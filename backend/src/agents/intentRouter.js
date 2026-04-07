/**
 * Lightweight intent router: one cheap LLM call to pick MCP namespaces,
 * then filter OpenAI tool definitions so the main agent sees fewer tools.
 */

import OpenAI from "openai";

const VALID_KEYS = new Set([
  "github",
  "slack",
  "jira",
  "gmail",
  "whatsapp",
  "whatsapp_cloud",
  "google_workspace",
  "youtube",
  "mermaid",
  "ppt",
  "e2b",
  "web",
]);

/**
 * @param {Array<{role:string, content?:string}>} messages
 */
export function lastUserText(messages) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === "user" && typeof m.content === "string" && m.content.trim()) {
      return m.content.trim();
    }
  }
  return "";
}

/**
 * @param {import("openai").OpenAI} openai
 * @param {string[]} connectedKeys
 * @param {string} userText
 * @returns {Promise<{ domains: string[], needsAll: boolean, routerNote: string }>}
 */
export async function classifyIntent(openai, connectedKeys, userText) {
  if (!userText || connectedKeys.length === 0) {
    return { domains: [], needsAll: true, routerNote: "" };
  }

  const routerModel = process.env.AGENT_ROUTER_MODEL || "gpt-4o-mini";

  const sys = `You route user requests to integration namespaces. Reply with ONLY valid JSON (no markdown fence).

Connected namespaces for this deployment: ${connectedKeys.join(", ")}

Valid domain keys (use exactly): github, slack, jira, gmail, whatsapp, whatsapp_cloud, google_workspace, youtube, mermaid, ppt, e2b, web.

Guidance:
- google_workspace: Google Meet link, Calendar event with video, "schedule on my calendar", IST/local meeting times as calendar events
- gmail: email inbox, send mail, drafts (not the same as Meet — Meet needs google_workspace if connected)
- slack: Slack channels, posting to #channel, workspace messages
- github: repositories, issues, PRs, code search on GitHub
- jira: Jira issues, JQL, tickets
- whatsapp_cloud: WhatsApp Business Cloud API — outbound: send_whatsapp_template with **template_name "agent_greeting"**, **language_code "en"**, body_parameters; send_whatsapp_text only for ~24h session replies
- whatsapp: personal WhatsApp via linked-device MCP (QR session), not Cloud API
- web: internet search, current news, weather, sports scores, stock/crypto prices, “what happened today”, fact-checking, looking up public docs or websites (not private repos or email). If the user wants a **chart/plot/graph** of stock or market data and **e2b** is connected, return **both web and e2b** (not web alone)—search once for context, code for the figure.
- youtube: YouTube videos, channels, playlists, transcripts/captions, video search, comments, stats — not generic web search
- mermaid: only when the user explicitly wants a diagram/visualization/Mermaid **or** the question clearly needs a visual for a **complex** explanation or **code / data-flow** (not for simple factual or short answers)
- ppt: PowerPoint / pitch deck / .pptx — structured slide generation (ppt__create_structured_deck); user may supply copy or only a topic (pair with web for research)
- e2b: run Python in E2B sandbox — data analysis, financial calculations, simulations, matplotlib charts, pandas/NumPy — not for Slack/GitHub/email. **Stock/crypto plots:** include **e2b** whenever the user asks to plot or chart prices (include **web** too if they need “current” quotes).

If the user needs multiple (e.g. "create Meet and post in Slack"), return multiple domains.

If the message is general chat, unclear, or might need any tool, set needs_all to true and domains to [].

Output shape: {"domains":["slack"],"needs_all":false}`;

  try {
    const res = await openai.chat.completions.create({
      model: routerModel,
      temperature: 0,
      max_tokens: 120,
      messages: [
        { role: "system", content: sys },
        { role: "user", content: userText.slice(0, 4000) },
      ],
    });
    const raw = res.choices[0]?.message?.content?.trim() || "";
    const jsonStr = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    const parsed = JSON.parse(jsonStr);
    const needsAll = Boolean(parsed.needs_all);
    let domains = Array.isArray(parsed.domains) ? parsed.domains : [];

    domains = domains.filter((d) => typeof d === "string" && VALID_KEYS.has(d) && connectedKeys.includes(d));

    if (needsAll || domains.length === 0) {
      return {
        domains: [],
        needsAll: true,
        routerNote: "",
      };
    }

    return {
      domains: [...new Set(domains)],
      needsAll: false,
      routerNote: `Intent router narrowed tools to: ${domains.join(", ")}.`,
    };
  } catch {
    return { domains: [], needsAll: true, routerNote: "" };
  }
}

/**
 * @param {Array<{type:string, function:{name:string}}>} allTools
 * @param {string[]} domains
 */
export function filterToolsByDomains(allTools, domains) {
  if (!domains.length) return allTools;
  const prefixes = domains.map((d) => `${d}__`);
  const filtered = allTools.filter((t) => {
    const name = t?.function?.name || "";
    return prefixes.some((p) => name.startsWith(p));
  });
  return filtered.length > 0 ? filtered : allTools;
}

/**
 * If the router narrowed to web-only for a plot + markets request, add e2b so the model can run matplotlib.
 * @param {string} userText
 * @param {string[]} domains
 * @param {string[]} connectedList
 * @returns {string[]}
 */
export function expandDomainsForPlotAndFinance(userText, domains, connectedList) {
  if (!userText || !Array.isArray(domains) || domains.length === 0) return domains;
  if (!connectedList.includes("e2b")) return domains;
  if (domains.includes("e2b")) return domains;

  const wantsViz = /\b(plot|chart|graph|visuali[sz]e|matplotlib|figure|candlestick)\b/i.test(userText);
  const wantsMarket = /\b(stock|stocks|share price|ticker|nvidia|apple stock|aapl|msft|googl|meta stock|nasdaq|nyse|s&p|sp500|equity|crypto|bitcoin|ethereum|forex|ohlc|quote)\b/i.test(
    userText.toLowerCase()
  );
  if (!wantsViz || !wantsMarket) return domains;

  return [...new Set([...domains, "e2b"])];
}
