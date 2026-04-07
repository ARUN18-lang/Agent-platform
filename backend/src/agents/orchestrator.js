/**
 * Agent Orchestrator
 * Uses OpenAI with a tool-use loop to execute multi-step tasks
 * across all connected MCP servers.
 */

import OpenAI from "openai";
import { mcpManager } from "../mcp/manager.js";
import { isWebSearchEnabled } from "../tools/webSearch.js";
import {
  classifyIntent,
  expandDomainsForPlotAndFinance,
  filterToolsByDomains,
  lastUserText,
} from "./intentRouter.js";
import {
  extractGeneratedDeckPath,
  registerDownloadableFile,
} from "../services/generatedFileDownloads.js";
import { buildFilePreviewsForPlanner, buildUploadedDataContext } from "../services/uploadedDataContext.js";
import { planDataAnalysisWithAttachments } from "./analysisPlanner.js";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SYSTEM_PROMPT = `You are an intelligent automation agent with access to MCP-connected tools. Tool names are namespaced: serverKey__tool_name (e.g. slack__slack_post_message, google_workspace__create_calendar_event_with_meet).

Typical capabilities when connected:
- **GitHub** (github__…): repos, issues, PRs, files, search.
- **Slack** (slack__…): channels, post, threads, reactions, history, users.
- **Jira Cloud** (jira__…): issues, JQL, transitions, comments, sprints.
- **Gmail package** (gmail__…): full Gmail API — drafts, send, threads, labels, etc. A draft email does NOT create a real Google Meet link.
- **Google Workspace local** (google_workspace__…): Calendar + real Meet links via google_workspace__create_calendar_event_with_meet; also google_workspace__send_gmail_message and google_workspace__list_gmail_messages. For “create a Meet”, “video link”, or “calendar invite with Meet”, use create_calendar_event_with_meet with start_iso and end_iso in ISO 8601 (e.g. 2026-04-05T19:00:00+05:30 for 7 PM IST). Optional timezone Asia/Kolkata.
- **WhatsApp** (whatsapp__…): linked device session (Baileys); use connect/status tools first when needed.
- **WhatsApp Business Cloud** (whatsapp_cloud__…): For **any** outbound template message, **always** call **send_whatsapp_template** with **template_name: "agent_greeting"** and **language_code: "en"** (English templates here use **en**, not en_US). Put the user-visible text in **body_parameters** ({{1}}, …) or **body_named_parameters**. Do **not** use **hello_world** for custom content. **list_whatsapp_message_templates** lists exact name/language if WHATSAPP_CLOUD_WABA_ID is set. **send_whatsapp_text** only after they messaged you (~24h). Full international "to", no +.
- **Web** (web__web_search): search the public web for current events, weather, news, prices, or anything that needs up-to-date sources. Use focused queries; cite what you found. If the tool is missing from your list, say web search is not configured.
- **YouTube** (youtube__…): video transcripts, search_content, metadata, comments, captions when those tools appear in your list. Prefer these for youtube.com links or “what does this video say” over guessing.
- **Mermaid** (mermaid__…): render and validate diagrams (generateDiagram, validateDiagram, listSupportedTypes, templates). **Use sparingly** — not for every reply. Call these tools only when (a) the user **explicitly** asks for a diagram, chart, flowchart, “draw”, “visualize”, Mermaid, architecture picture, etc., or (b) you are explaining a **complex** topic or **non-trivial code / control flow** where a diagram clearly helps more than text alone. For simple questions, definitions, one-step answers, or routine tool tasks (email, Slack, GitHub…), **do not** use Mermaid — answer normally. When you do use it, include returned **SVG** or Mermaid source in a fenced \`\`\`mermaid code block; use mermaid__validateDiagram if generation fails. **Flowchart syntax:** If a node label contains parentheses, carets, slashes, asterisks, equals, or other math/punctuation, wrap the label in **double quotes**: use E["Energy = (a^2/2) * Width"] not E[Energy = (a^2/2) * Width] — unquoted text causes parse errors. Same for subgraph titles if needed.
- **PowerPoint** (ppt__create_structured_deck): builds a native **.pptx** with designed layouts (accent bars, section slides, bullet lists, two-column compare, metric cards, quotes, closing). Pass **deck_title**, **theme** (one of: ocean, slate, aurora, ember, noir), optional **filename** (base name, no extension), and **slides**: an ordered array. Each slide has **layout** set to one of: title (title + optional subtitle), section (full-bleed chapter divider), bullets (title + optional subtitle + bullets array), two_column (title + left_bullets / right_bullets + optional headings), metrics (1–4 items with value + label), quote (text + optional attribution), closing (title + optional lines). Aim for **6–15 slides** for a real deck: alternate section + bullets; use metrics for numbers; two_column for pros/cons or before/after. If the user only names a **topic**, use **web__web_search** first, then synthesize. Output path is under the server user's **Downloads** folder; quote it for the user.
- **E2B** (e2b__run_code): runs **Python** in an isolated cloud sandbox (Jupyter-style cells). Use for numerical work, **pandas** / **NumPy**, statistics, Monte Carlo or portfolio-style calculations, and **matplotlib** visualizations. Tool output is JSON with **results** and **logs**; **matplotlib figures** often include a **png** field—the **app renders those images** in the tool panel for the user (you will see a placeholder for png in your context; describe the chart in plain English). Each invocation uses a **new** sandbox (no persistent state between calls unless you embed data in code). If live market or external figures are needed and not provided, use **web__web_search** first, then pass data into code. Do not exfiltrate user secrets; keep snippets focused and handle errors clearly.

Routing rules:
- User wants a **Google Meet URL** or **calendar event with Meet** → use google_workspace__create_calendar_event_with_meet if that tool exists in your tool list. Do not say you lack Calendar/Meet access without checking your tools.
- User wants **email only** (draft/send body) → gmail__… or google_workspace__send_gmail_message as appropriate.
- After you have a Meet link, you may post it to Slack (slack__…) if the user asked.
- **Do not** use GitHub (issues, files, fake repos) as a substitute for Calendar, Meet, or Slack when those tools exist.
- For **current or external facts** (today’s news, live scores, “what happened recently”), prefer **web__web_search** over guessing.
- For **YouTube-specific** tasks (transcript, channel/video lookup on YouTube), use **youtube__** tools when present instead of web search alone.
- For **Mermaid diagrams**, use **mermaid__** tools only when the user asked for a visual/diagram **or** the explanation is **complex** (e.g. multi-branch logic, pipelines, system boundaries, elaborate code paths). Skip Mermaid for straightforward queries.
- For **presentations / .pptx**, use **ppt__create_structured_deck** when that tool exists; combine with **web__web_search** for topic-only requests so slides are factual and varied layouts.
- For **Python execution**, charts, heavy data analysis, or financial modeling that needs real code, use **e2b__run_code** when present (not for tasks other tools already solve trivially).
- For **stock or market plots**: call **web__web_search at most once** for a recent price level or context if needed, then **e2b__run_code** with matplotlib (e.g. yfinance or hardcoded values from search). **Never** chain many web searches hoping for chart-ready data—snippets are not a time series.
- **WhatsApp Cloud outbound:** No arbitrary free-text cold DMs — use **send_whatsapp_template** with **template_name: "agent_greeting"**, **language_code: "en"**, and **body_parameters** / **body_named_parameters**. Do not use hello_world for custom copy. If the customer already messaged the business within ~24h, **send_whatsapp_text** is allowed for session replies.

GitHub (github__…) rules:
- Parameters **owner** and **repo** must be real values: a GitHub **username or organization**, never the literal string **"me"** (that is invalid and causes 404).
- If the user does not name owner/repo, ask them or use github search/list tools if available. If this server sets a default owner hint in the session line below, prefer that for “my” repos.
- If list_issues or similar returns Not Found: the repo may not exist, the name may be wrong, or the token may lack access — explain that to the user instead of inventing placeholder repos (e.g. me/temp-repo).

Guidelines:
- **Mermaid:** optional polish — default to text; add diagrams only when the user requests them or when complexity warrants it (see Mermaid capability above).
- Be concise but thorough in your responses.
- When the user's goal is satisfied (or cannot be completed), answer in plain text and stop calling tools.
- When performing multi-step tasks, explain each step you're taking.
- Format results clearly using markdown.
- If a tool call fails, explain what happened and suggest alternatives.
- Always confirm destructive operations (delete, close, merge) before executing unless told to proceed.
- **Uploaded CSV/Excel:** When UPLOAD_0_B64 / UPLOAD_1_B64 appear below, your **first e2b__run_code** call must paste the **entire** UPLOAD_n_B64 assignment lines (Python triple-quoted strings of base64) from this system message into the tool **code** argument (they contain long base64 — that is correct). **Forbidden:** inventing CSV inside StringIO, sample stock tables, or renaming variables and stuffing plain text where base64 belongs. Decode only the provided UPLOAD_*_B64 strings, then pandas. Do not answer from memory or web alone. Excel → CSV (first sheet only).

Today's date: ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}`;

function mergeToolsForDataAnalysis(tools, connectedList) {
  const names = new Set((tools || []).map((t) => t?.function?.name).filter(Boolean));
  const all = mcpManager.getAllToolsAsOpenAI();
  const out = [...(tools || [])];
  const prefixes = [];
  if (connectedList.includes("e2b")) prefixes.push("e2b__");
  if (connectedList.includes("web")) prefixes.push("web__");
  for (const pref of prefixes) {
    for (const t of all) {
      const n = t?.function?.name;
      if (typeof n === "string" && n.startsWith(pref) && !names.has(n)) {
        names.add(n);
        out.push(t);
      }
    }
  }
  return out;
}

/** OpenAI chat.completions rejects more than 128 tools (array_above_max_length). */
const OPENAI_MAX_TOOLS = Math.min(
  128,
  Math.max(1, parseInt(process.env.AGENT_OPENAI_MAX_TOOLS || "128", 10) || 128)
);

const TOOL_TRIM_PRIORITY = [
  "e2b__",
  "web__",
  "google_workspace__",
  "gmail__",
  "slack__",
  "github__",
  "jira__",
  "youtube__",
  "mermaid__",
  "ppt__",
  "whatsapp_cloud__",
  "whatsapp__",
];

function dedupeToolsByName(tools) {
  const seen = new Set();
  const out = [];
  for (const t of tools || []) {
    const n = t?.function?.name;
    if (!n || seen.has(n)) continue;
    seen.add(n);
    out.push(t);
  }
  return out;
}

/**
 * @param {unknown[]} dedupedTools — already unique by function.name
 * @param {{ prioritizePrefixes?: string[] }} [opts]
 */
function capToolsAtOpenAILimit(dedupedTools, opts = {}) {
  const list = dedupedTools;
  if (list.length <= OPENAI_MAX_TOOLS) return list;

  const prefOrder = [...(opts.prioritizePrefixes || []), ...TOOL_TRIM_PRIORITY];
  const seenPref = new Set();
  const uniquePrefs = prefOrder.filter((p) => {
    if (seenPref.has(p)) return false;
    seenPref.add(p);
    return true;
  });

  const picked = [];
  const taken = new Set();
  const add = (t) => {
    const n = t?.function?.name;
    if (!n || taken.has(n)) return;
    taken.add(n);
    picked.push(t);
  };

  for (const pref of uniquePrefs) {
    for (const t of list) {
      if (picked.length >= OPENAI_MAX_TOOLS) return picked;
      if (String(t?.function?.name || "").startsWith(pref)) add(t);
    }
  }
  for (const t of list) {
    if (picked.length >= OPENAI_MAX_TOOLS) break;
    add(t);
  }
  return picked;
}

/**
 * Run the agent with a full agentic loop (handles multiple tool call rounds)
 * @param {Array} messages - conversation history
 * @param {function} onUpdate - callback for streaming updates
 * @param {{ attachments?: Array<{ id: string, filename: string, csvText: string }>, attachmentIdsRequested?: number }} [options]
 */
export async function runAgent(messages, onUpdate, options = {}) {
  const attachments = Array.isArray(options.attachments) ? options.attachments : [];
  const attachmentIdsRequested = Math.max(0, Number(options.attachmentIdsRequested) || 0);

  await mcpManager.init();

  const connectedList = [...mcpManager.servers.keys()];
  if (isWebSearchEnabled()) connectedList.push("web");
  const connectedKeys = connectedList.join(", ");
  let tools = mcpManager.getAllToolsAsOpenAI();

  const routerOff =
    process.env.AGENT_INTENT_ROUTER === "0" || process.env.AGENT_INTENT_ROUTER === "false";
  let routerLine = "";
  if (!routerOff && tools.length > 0 && connectedList.length > 0) {
    const ut = lastUserText(messages);
    const { domains, needsAll, routerNote } = await classifyIntent(openai, connectedList, ut);
    if (!needsAll && domains.length > 0) {
      const expanded = expandDomainsForPlotAndFinance(ut, domains, connectedList);
      const extra =
        expanded.length > domains.length
          ? " [Also enabled e2b for chart/code alongside web.]"
          : "";
      tools = filterToolsByDomains(tools, expanded);
      routerLine = (routerNote ? `\n\n[Router] ${routerNote}` : "") + (extra ? `\n\n[Router]${extra}` : "");
    }
  }

  if (attachments.length > 0) {
    tools = mergeToolsForDataAnalysis(tools, connectedList);
    routerLine += `\n\n[Router] Tabular file(s) attached — e2b (and web if connected) tools ensured for analysis.`;
  }

  tools = dedupeToolsByName(tools);
  const toolCountBeforeCap = tools.length;
  tools = capToolsAtOpenAILimit(tools, {
    prioritizePrefixes: attachments.length > 0 ? ["e2b__", "web__"] : [],
  });
  if (toolCountBeforeCap > tools.length) {
    routerLine += `\n\n[Router] Tool list capped at ${OPENAI_MAX_TOOLS} (OpenAI API limit); some integrations are omitted this turn — ask again for a different tool if needed.`;
  }

  let dataAppendix = "";
  if (attachments.length > 0) {
    const previews = buildFilePreviewsForPlanner(attachments);
    const planText = await planDataAnalysisWithAttachments(lastUserText(messages), previews);
    dataAppendix = planText + buildUploadedDataContext(attachments);
    if (attachmentIdsRequested > attachments.length) {
      dataAppendix += `\n\n[Note] Only ${attachments.length} of ${attachmentIdsRequested} attached file(s) were loaded; tell the user if some files are missing and to re-attach them.`;
    }
  } else if (attachmentIdsRequested > 0) {
    dataAppendix =
      "\n\n[CRITICAL — UPLOAD DATA NOT AVAILABLE] The user attached one or more CSV/Excel files, but this server could not load their contents (expired upload, invalid ID, or server restarted before in-memory data existed — disk recovery also failed). You MUST ask them to click the spreadsheet icon, attach the file(s) again, and send the message. Do NOT fabricate statistics or pretend you analyzed their spreadsheet.";
  }

  const defaultGh = process.env.GITHUB_DEFAULT_OWNER?.trim();
  const ghDefaultLine = defaultGh
    ? ` Default GitHub owner/org for ambiguous requests: "${defaultGh}" (still confirm repo name with the user if unsure).`
    : "";
  const runtimeHint =
    (connectedKeys
      ? `\n\n[This session] Connected tool namespaces: ${connectedKeys}.${ghDefaultLine} Only call tools that exist in your tools list.`
      : `\n\n[This session] No integrations connected.${ghDefaultLine}`) + routerLine;
  const history = [{ role: "system", content: SYSTEM_PROMPT + runtimeHint + dataAppendix }, ...messages];

  const steps = [];
  let iterations = 0;
  const MAX_ITERATIONS = Math.max(
    3,
    Math.min(40, parseInt(process.env.AGENT_MAX_ITERATIONS || "18", 10) || 18)
  );
  const model = process.env.OPENAI_MODEL || "gpt-4o";

  while (iterations < MAX_ITERATIONS) {
    iterations++;

    const response = await openai.chat.completions.create({
      model,
      messages: history,
      tools: tools.length > 0 ? tools : undefined,
      tool_choice: tools.length > 0 ? "auto" : undefined,
    });

    const message = response.choices[0].message;
    history.push(message);

    if (!message.tool_calls || message.tool_calls.length === 0) {
      return {
        content: message.content,
        steps,
        usage: response.usage,
      };
    }

    const toolResults = await Promise.all(
      message.tool_calls.map(async (tc) => {
        const fnName = tc.function.name;
        const args = JSON.parse(tc.function.arguments || "{}");

        onUpdate?.({
          type: "tool_call",
          tool: fnName,
          args,
        });

        try {
          const result = await mcpManager.executeTool(fnName, args);
          const resultText = formatToolResult(result);
          const modelToolContent =
            fnName === "e2b__run_code" ? sanitizeE2BToolResultForModel(resultText) : resultText;

          const rawPath = extractGeneratedDeckPath(fnName, resultText);
          const reg = rawPath ? registerDownloadableFile(rawPath) : null;
          const downloadAttachments = reg ? [reg] : [];

          steps.push({ tool: fnName, args, result: resultText, success: true, attachments: downloadAttachments });
          onUpdate?.({
            type: "tool_result",
            tool: fnName,
            result: resultText,
            success: true,
            attachments: downloadAttachments,
          });

          return {
            role: "tool",
            tool_call_id: tc.id,
            content: modelToolContent,
          };
        } catch (err) {
          const errMsg = `Error: ${err.message}`;
          steps.push({ tool: fnName, args, result: errMsg, success: false, attachments: [] });
          onUpdate?.({
            type: "tool_result",
            tool: fnName,
            result: errMsg,
            success: false,
            attachments: [],
          });

          return {
            role: "tool",
            tool_call_id: tc.id,
            content: errMsg,
          };
        }
      })
    );

    history.push(...toolResults);
  }

  // Cap hit after a tool round: history ends with tool messages but no assistant reply yet.
  // Without this extra call, the model never gets to answer and looks like an "infinite" tool loop.
  const finalize = await openai.chat.completions.create({
    model,
    messages: [
      ...history,
      {
        role: "user",
        content:
          "Stop calling tools. You reached the maximum tool rounds for this request. Summarize what succeeded and what failed, paste any important links or IDs from tool results above, and say clearly what the user should do next (if anything).",
      },
    ],
    tool_choice: "none",
  });

  const finalMsg = finalize.choices[0].message;
  return {
    content:
      finalMsg.content ||
      "Tool round limit reached; check the steps log for tool outputs.",
    steps,
    usage: finalize.usage,
  };
}

function formatToolResult(result) {
  if (!result) return "Done.";
  if (typeof result === "string") return result;

  // MCP tool results have a content array
  if (result.content) {
    return result.content
      .map((c) => {
        if (c.type === "text") return c.text;
        if (c.type === "image") return `[Image: ${c.url || "embedded"}]`;
        return JSON.stringify(c);
      })
      .join("\n");
  }

  return JSON.stringify(result, null, 2);
}

/** Replace huge matplotlib PNG base64 in E2B JSON so the next LLM turn is not megatokens. Full JSON stays in steps / UI. */
function sanitizeE2BToolResultForModel(text) {
  if (typeof text !== "string" || text.length < 80) return text;
  try {
    const j = JSON.parse(text);
    if (!j || typeof j !== "object" || !Array.isArray(j.results)) return text;
    const copy = JSON.parse(JSON.stringify(j));
    for (const r of copy.results) {
      if (r && typeof r.png === "string" && r.png.length > 500) {
        r.png = `[matplotlib PNG omitted (${r.png.length} base64 chars); chart is shown to the user in the tool output panel]`;
      }
    }
    return JSON.stringify(copy, null, 2);
  } catch {
    return text;
  }
}
