/**
 * Web search for the agent (Tavily or Brave Search API).
 * Returns MCP-shaped tool results so formatToolResult in the orchestrator works unchanged.
 */

const WEB_SEARCH_FETCH_MS = Math.min(
  120_000,
  Math.max(5_000, parseInt(process.env.WEB_SEARCH_FETCH_TIMEOUT_MS || "25000", 10) || 25000)
);

function fetchTimeoutSignal() {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), WEB_SEARCH_FETCH_MS);
  return { signal: c.signal, cancel: () => clearTimeout(t) };
}

function tavilyKey() {
  return process.env.TAVILY_API_KEY?.trim() || "";
}

function braveKey() {
  return process.env.BRAVE_SEARCH_API_KEY?.trim() || "";
}

export function isWebSearchEnabled() {
  return Boolean(tavilyKey() || braveKey());
}

/**
 * OpenAI tool definitions (namespaced web__… for executeTool routing).
 */
export function getWebSearchOpenAITools() {
  if (!isWebSearchEnabled()) return [];

  return [
    {
      type: "function",
      function: {
        name: "web__web_search",
        description:
          "[Web] Search the public web for up-to-date information: news, weather, sports, product releases, documentation, facts after your knowledge cutoff. Use concise queries. Prefer this when the user asks for current or external information not in connected apps.",
        parameters: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "What to look up (keywords or a short question).",
            },
            max_results: {
              type: "integer",
              description: "Number of results to return (1–10). Default 5.",
            },
          },
          required: ["query"],
        },
      },
    },
  ];
}

export function getWebServerStatus() {
  if (!isWebSearchEnabled()) return null;
  const tools = getWebSearchOpenAITools().map((t) => ({
    name: t.function.name.replace(/^web__/, ""),
    description: t.function.description,
  }));
  return {
    key: "web",
    label: "Web search",
    icon: "🌐",
    toolCount: tools.length,
    tools,
  };
}

/**
 * @param {string} fullName e.g. web__web_search
 * @param {Record<string, unknown>} args
 * @returns {Promise<{ content: { type: string, text: string }[] }>}
 */
export async function executeWebSearchTool(fullName, args) {
  const toolName = fullName.includes("__") ? fullName.slice(fullName.indexOf("__") + 2) : fullName;
  if (toolName !== "web_search") {
    throw new Error(`Unknown web tool: ${toolName}`);
  }

  const query = typeof args.query === "string" ? args.query.trim() : "";
  if (!query) throw new Error("query is required");

  let max = 5;
  if (typeof args.max_results === "number" && Number.isFinite(args.max_results)) {
    max = Math.min(10, Math.max(1, Math.floor(args.max_results)));
  }

  const text = tavilyKey()
    ? await searchTavily(query, max)
    : await searchBrave(query, max);

  return {
    content: [{ type: "text", text }],
  };
}

async function searchTavily(query, maxResults) {
  const key = tavilyKey();
  const { signal, cancel } = fetchTimeoutSignal();
  let res;
  try {
    res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: key,
        query,
        search_depth: "basic",
        max_results: maxResults,
        include_answer: true,
      }),
      signal,
    });
  } catch (e) {
    cancel();
    if (e?.name === "AbortError") {
      throw new Error(`Tavily search timed out after ${WEB_SEARCH_FETCH_MS}ms`);
    }
    throw e;
  }
  cancel();

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new Error(`Tavily search failed (${res.status}): ${errBody.slice(0, 200)}`);
  }

  const data = await res.json();
  const lines = [];

  if (data.answer) {
    lines.push("**Summary**", String(data.answer), "");
  }

  const results = Array.isArray(data.results) ? data.results : [];
  if (results.length === 0) {
    lines.push("_No web results returned. Try a different query._");
    return lines.join("\n");
  }

  lines.push("**Sources**");
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const title = r.title || "Untitled";
    const url = r.url || "";
    const snippet = (r.content || r.snippet || "").trim();
    lines.push(`${i + 1}. **${title}**${url ? ` — ${url}` : ""}`);
    if (snippet) lines.push(`   ${snippet.replace(/\s+/g, " ").slice(0, 500)}`);
  }

  return lines.join("\n");
}

async function searchBrave(query, maxResults) {
  const key = braveKey();
  const u = new URL("https://api.search.brave.com/res/v1/web/search");
  u.searchParams.set("q", query);
  u.searchParams.set("count", String(maxResults));

  const { signal, cancel } = fetchTimeoutSignal();
  let res;
  try {
    res = await fetch(u.toString(), {
      headers: {
        Accept: "application/json",
        "X-Subscription-Token": key,
      },
      signal,
    });
  } catch (e) {
    cancel();
    if (e?.name === "AbortError") {
      throw new Error(`Brave search timed out after ${WEB_SEARCH_FETCH_MS}ms`);
    }
    throw e;
  }
  cancel();

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new Error(`Brave search failed (${res.status}): ${errBody.slice(0, 200)}`);
  }

  const data = await res.json();
  const web = data.web?.results || data.results || [];
  const lines = ["**Web results**"];

  if (!Array.isArray(web) || web.length === 0) {
    lines.push("_No results. Try rephrasing the query._");
    return lines.join("\n");
  }

  for (let i = 0; i < web.length; i++) {
    const r = web[i];
    const title = r.title || "Untitled";
    const url = r.url || "";
    const desc = (r.description || "").trim();
    lines.push(`${i + 1}. **${title}**${url ? ` — ${url}` : ""}`);
    if (desc) lines.push(`   ${desc.replace(/\s+/g, " ").slice(0, 500)}`);
  }

  return lines.join("\n");
}
