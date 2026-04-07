/**
 * MCP Client Manager
 * Registers integrations in INTEGRATIONS — each can be skipped when env is missing.
 */

import path from "path";
import { createRequire } from "module";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const ytmcpServerPath = require.resolve("@mrsknetwork/ytmcp/build/server/index.js");
const mermaidMcpServerPath = require.resolve("@narasimhaponnada/mermaid-mcp-server/dist/index.js");
const e2bMcpServerPath = require.resolve("@e2b/mcp-server/build/index.js");
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import {
  getWebSearchOpenAITools,
  executeWebSearchTool,
  getWebServerStatus,
  isWebSearchEnabled,
} from "../tools/webSearch.js";

const __mcpDir = path.dirname(fileURLToPath(import.meta.url));
const googleWorkspaceMcpPath = path.resolve(__mcpDir, "google-workspace-mcp/index.js");
const whatsappCloudMcpPath = path.resolve(__mcpDir, "whatsapp-cloud-mcp/index.js");
const richPptMcpPath = path.resolve(__mcpDir, "rich-ppt-mcp/index.js");

/** @param {string} key */
function envTruthy(key) {
  const v = process.env[key];
  return v != null && String(v).trim() !== "";
}

/** @param {string} key */
function envFlagOn(key) {
  const v = process.env[key];
  if (v == null) return false;
  const s = String(v).trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "on";
}

const INTEGRATIONS = [
  {
    key: "github",
    label: "GitHub",
    icon: "🐙",
    publicDescription:
      "Search repositories, triage issues, and reason about pull requests and code without leaving your workspace.",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-github"],
    enabled: () => !envFlagOn("GITHUB_MCP_DISABLE"),
    requiredEnv: ["GITHUB_TOKEN"],
    buildEnv: () => ({
      GITHUB_PERSONAL_ACCESS_TOKEN: process.env.GITHUB_TOKEN,
    }),
    setupGuide:
      "Create a GitHub PAT (fine-grained or classic) with repo/issue scope. Set GITHUB_TOKEN in backend/.env.",
  },
  {
    key: "slack",
    label: "Slack",
    icon: "💬",
    publicDescription:
      "Draft updates, read channel context, and keep team communication aligned where work already happens.",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-slack"],
    requiredEnv: ["SLACK_BOT_TOKEN", "SLACK_TEAM_ID"],
    buildEnv: () => {
      const env = {
        SLACK_BOT_TOKEN: process.env.SLACK_BOT_TOKEN,
        SLACK_TEAM_ID: process.env.SLACK_TEAM_ID,
      };
      if (envTruthy("SLACK_CHANNEL_IDS")) {
        env.SLACK_CHANNEL_IDS = process.env.SLACK_CHANNEL_IDS;
      }
      return env;
    },
    setupGuide:
      "Slack App → OAuth scopes: channels:history, channels:read, chat:write, reactions:write, users:read, users.profile:read. Install to workspace. Set SLACK_BOT_TOKEN (xoxb-…) and SLACK_TEAM_ID (T…). Optional: SLACK_CHANNEL_IDS comma-separated.",
  },
  {
    key: "jira",
    label: "Jira Cloud",
    icon: "📋",
    publicDescription:
      "Surface tickets, sprints, and backlogs so planning and status checks stay grounded in real work items.",
    command: "npx",
    args: ["-y", "mcp-jira-cloud@latest"],
    requiredEnv: ["JIRA_BASE_URL", "JIRA_EMAIL", "JIRA_API_TOKEN"],
    buildEnv: () => ({
      JIRA_BASE_URL: process.env.JIRA_BASE_URL,
      JIRA_EMAIL: process.env.JIRA_EMAIL,
      JIRA_API_TOKEN: process.env.JIRA_API_TOKEN,
    }),
    setupGuide:
      "Atlassian → Account → Security → API tokens. Set JIRA_BASE_URL (https://yourorg.atlassian.net), JIRA_EMAIL, and JIRA_API_TOKEN in backend/.env.",
  },
  {
    key: "gmail",
    label: "Gmail",
    icon: "📧",
    publicDescription:
      "Summarize threads, draft replies, and manage inbox tasks without switching to another tab.",
    command: "npx",
    args: ["-y", "@shinzolabs/gmail-mcp"],
    enabled: () => envFlagOn("GMAIL_MCP_ENABLE"),
    requiredEnv: [],
    buildEnv: () => {
      const env = {};
      if (envTruthy("GMAIL_OAUTH_PATH")) env.GMAIL_OAUTH_PATH = process.env.GMAIL_OAUTH_PATH;
      if (envTruthy("GMAIL_CREDENTIALS_PATH")) {
        env.GMAIL_CREDENTIALS_PATH = process.env.GMAIL_CREDENTIALS_PATH;
      }
      if (envTruthy("GMAIL_AUTH_PORT")) env.AUTH_SERVER_PORT = process.env.GMAIL_AUTH_PORT;
      if (envTruthy("MCP_CONFIG_DIR")) env.MCP_CONFIG_DIR = process.env.MCP_CONFIG_DIR;
      if (envTruthy("CLIENT_ID")) env.CLIENT_ID = process.env.CLIENT_ID;
      if (envTruthy("CLIENT_SECRET")) env.CLIENT_SECRET = process.env.CLIENT_SECRET;
      if (envTruthy("REFRESH_TOKEN")) env.REFRESH_TOKEN = process.env.REFRESH_TOKEN;
      return env;
    },
    setupGuide:
      "Set GMAIL_MCP_ENABLE=1. Place Google OAuth desktop client JSON at ~/.gmail-mcp/gcp-oauth.keys.json, run `npx @shinzolabs/gmail-mcp auth` once, or set CLIENT_ID, CLIENT_SECRET, REFRESH_TOKEN for headless.",
  },
  {
    key: "whatsapp",
    label: "WhatsApp",
    icon: "📱",
    publicDescription:
      "Personal WhatsApp via a linked session—useful for quick coordination when you have connected the device.",
    command: "npx",
    args: ["-y", "--package=whatsapp-mcp-lifeosai", "whatsapp-mcp"],
    enabled: () => envFlagOn("WHATSAPP_MCP_ENABLE"),
    requiredEnv: [],
    buildEnv: () =>
      envTruthy("WHATSAPP_AUTH_DIR")
        ? { WHATSAPP_AUTH_DIR: process.env.WHATSAPP_AUTH_DIR }
        : {},
    setupGuide:
      "Unofficial Baileys-based client (same protocol as WhatsApp Web). Set WHATSAPP_MCP_ENABLE=1, restart the backend, then use MCP tool `connect` to scan QR. May conflict with WhatsApp ToS — use at your own risk. Optional: WHATSAPP_AUTH_DIR.",
  },
  {
    key: "whatsapp_cloud",
    label: "WhatsApp Business (Cloud API)",
    icon: "✅",
    publicDescription:
      "Official Business API for approved templates, customer replies, and scalable messaging from your workspace.",
    command: process.execPath,
    args: [whatsappCloudMcpPath],
    enabled: () => {
      if (!envFlagOn("WHATSAPP_CLOUD_MCP_ENABLE")) return false;
      return (
        envTruthy("WHATSAPP_CLOUD_ACCESS_TOKEN") && envTruthy("WHATSAPP_CLOUD_PHONE_NUMBER_ID")
      );
    },
    requiredEnv: [],
    buildEnv: () => ({
      WHATSAPP_CLOUD_ACCESS_TOKEN: process.env.WHATSAPP_CLOUD_ACCESS_TOKEN || "",
      WHATSAPP_CLOUD_PHONE_NUMBER_ID: process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID || "",
      ...(envTruthy("WHATSAPP_CLOUD_API_VERSION")
        ? { WHATSAPP_CLOUD_API_VERSION: process.env.WHATSAPP_CLOUD_API_VERSION }
        : {}),
      ...(envTruthy("WHATSAPP_CLOUD_WABA_ID")
        ? { WHATSAPP_CLOUD_WABA_ID: process.env.WHATSAPP_CLOUD_WABA_ID }
        : {}),
    }),
    setupGuide:
      "Meta: Phone number ID + token (whatsapp_business_messaging; add whatsapp_business_management to list templates). WHATSAPP_CLOUD_MCP_ENABLE=1. Templates: create in WhatsApp Manager or POST /{WABA_ID}/message_templates; send via send_whatsapp_template (positional or named body vars). Optional WHATSAPP_CLOUD_WABA_ID for list_whatsapp_message_templates. send_whatsapp_text = ~24h session only. Optional WHATSAPP_CLOUD_API_VERSION.",
  },
  {
    key: "google_workspace",
    label: "Google (Meet + Gmail)",
    icon: "📅",
    publicDescription:
      "Calendar events, Meet links, and Gmail together—ideal for scheduling, invites, and follow-up in one flow.",
    command: process.execPath,
    args: [googleWorkspaceMcpPath],
    enabled: () => {
      if (!envFlagOn("GOOGLE_WORKSPACE_MCP_ENABLE")) {
        return false;
      }
      if (!envTruthy("GOOGLE_WORKSPACE_CLIENT_ID") || !envTruthy("GOOGLE_WORKSPACE_CLIENT_SECRET")) {
        return false;
      }
      return envTruthy("GOOGLE_WORKSPACE_REFRESH_TOKEN") || envTruthy("GOOGLE_WORKSPACE_TOKEN_PATH");
    },
    requiredEnv: [],
    buildEnv: () => ({
      GOOGLE_WORKSPACE_CLIENT_ID: process.env.GOOGLE_WORKSPACE_CLIENT_ID,
      GOOGLE_WORKSPACE_CLIENT_SECRET: process.env.GOOGLE_WORKSPACE_CLIENT_SECRET,
      GOOGLE_WORKSPACE_REFRESH_TOKEN: process.env.GOOGLE_WORKSPACE_REFRESH_TOKEN || "",
      ...(envTruthy("GOOGLE_WORKSPACE_TOKEN_PATH")
        ? { GOOGLE_WORKSPACE_TOKEN_PATH: process.env.GOOGLE_WORKSPACE_TOKEN_PATH }
        : {}),
    }),
    setupGuide:
      "Local MCP: src/mcp/google-workspace-mcp/index.js. Enable Google Calendar API + Gmail API; OAuth scopes: calendar.events, gmail.send, gmail.readonly (or gmail.modify). Set GOOGLE_WORKSPACE_MCP_ENABLE=1, GOOGLE_WORKSPACE_CLIENT_ID, GOOGLE_WORKSPACE_CLIENT_SECRET, and GOOGLE_WORKSPACE_REFRESH_TOKEN (or GOOGLE_WORKSPACE_TOKEN_PATH, e.g. ~/.gmail-mcp/credentials.json). Re-auth if your token only has Gmail. Optional: turn off GMAIL_MCP_ENABLE to avoid duplicate Gmail tools.",
  },
  {
    key: "youtube",
    label: "YouTube",
    icon: "▶️",
    publicDescription:
      "Search videos and channels, pull transcripts and metadata, and answer questions about public YouTube content from one place.",
    command: process.execPath,
    args: () =>
      envTruthy("YOUTUBE_API_KEY")
        ? [ytmcpServerPath, process.env.YOUTUBE_API_KEY]
        : [ytmcpServerPath],
    enabled: () => envFlagOn("YOUTUBE_MCP_ENABLE"),
    requiredEnv: [],
    buildEnv: () => {
      const env = {};
      if (envTruthy("YOUTUBE_GOOGLE_CLIENT_ID")) {
        env.GOOGLE_CLIENT_ID = process.env.YOUTUBE_GOOGLE_CLIENT_ID;
      }
      if (envTruthy("YOUTUBE_GOOGLE_CLIENT_SECRET")) {
        env.GOOGLE_CLIENT_SECRET = process.env.YOUTUBE_GOOGLE_CLIENT_SECRET;
      }
      if (envTruthy("YOUTUBE_DL_DIR")) {
        env.YOUTUBE_DL_DIR = process.env.YOUTUBE_DL_DIR;
      }
      if (envTruthy("YOUTUBE_DL_FILENAME")) {
        env.YOUTUBE_DL_FILENAME = process.env.YOUTUBE_DL_FILENAME;
      }
      return env;
    },
    setupGuide:
      "Set YOUTUBE_MCP_ENABLE=1. Transcripts: yt-dlp-exec expects a binary at node_modules/yt-dlp-exec/bin/yt-dlp — run `npm run yt-dlp:fetch` in backend/ (or rely on postinstall). Or install Homebrew yt-dlp and set YOUTUBE_DL_DIR=/opt/homebrew/bin (Apple Silicon) or /usr/local/bin (Intel). Set YOUTUBE_API_KEY for YouTube Data API tools. Optional OAuth: YOUTUBE_GOOGLE_CLIENT_ID + YOUTUBE_GOOGLE_CLIENT_SECRET.",
  },
  {
    key: "mermaid",
    label: "Mermaid",
    icon: "📐",
    publicDescription:
      "Turn explanations into flowcharts, sequence diagrams, and architecture sketches—rendered as diagrams you can drop straight into docs or slides.",
    command: process.execPath,
    args: [mermaidMcpServerPath],
    enabled: () => envFlagOn("MERMAID_MCP_ENABLE"),
    requiredEnv: [],
    buildEnv: () => ({}),
    setupGuide:
      "Set MERMAID_MCP_ENABLE=1. Uses @narasimhaponnada/mermaid-mcp-server (bundled). Pulls Puppeteer on npm install for SVG rendering—first diagram may be slower. Tools: mermaid__generateDiagram, validateDiagram, listSupportedTypes, templates, etc.",
  },
  {
    key: "ppt",
    label: "PowerPoint",
    icon: "📊",
    publicDescription:
      "Build designed slide decks with real PowerPoint layouts—section dividers, bullet slides, two-column pages, metric cards, quotes, and themed colors—not flat screenshots.",
    command: process.execPath,
    args: [richPptMcpPath],
    enabled: () => envFlagOn("PPT_MCP_ENABLE"),
    requiredEnv: [],
    buildEnv: () => ({}),
    setupGuide:
      "Set PPT_MCP_ENABLE=1. Local rich-ppt-mcp (PptxGenJS, no Playwright). Output .pptx under the server user's Downloads folder (e.g. ~/Downloads). Tool: ppt__create_structured_deck — pass deck_title, theme (ocean|slate|aurora|ember|noir), and slides array (layout: title|section|bullets|two_column|metrics|quote|closing). Optional PRESENTATION_DOWNLOAD_ROOT for download API path allowlist.",
  },
  {
    key: "e2b",
    label: "E2B Code Interpreter",
    icon: "🧪",
    publicDescription:
      "Execute Python in a secure cloud sandbox—pandas, NumPy, statistics, and matplotlib charts for analysis, finance-style models, and reproducible numeric results.",
    command: process.execPath,
    args: [e2bMcpServerPath],
    enabled: () => envFlagOn("E2B_MCP_ENABLE"),
    requiredEnv: ["E2B_API_KEY"],
    buildEnv: () => ({ E2B_API_KEY: process.env.E2B_API_KEY }),
    setupGuide:
      "Get an API key at https://e2b.dev/dashboard. Set E2B_MCP_ENABLE=1 and E2B_API_KEY in backend/.env. Bundled @e2b/mcp-server. Tool: e2b__run_code — Python only (Jupyter-style). Use matplotlib for plots; parse tool JSON for results and logs. Sandboxes consume E2B quota / billing.",
  },
];

class MCPClientManager {
  constructor() {
    /** @type {Map<string, { client: Client, tools: any[], def: object }>} */
    this.servers = new Map();
    /** @type {Map<string, { reason: string, missing?: string[] }>} */
    this.skipped = new Map();
    this.initialized = false;
  }

  /** Human-readable hint when an opt-in integration is off (for logs + debugging). */
  _enabledSkipHint(def) {
    if (def.key === "google_workspace") {
      const hints = [];
      if (!envFlagOn("GOOGLE_WORKSPACE_MCP_ENABLE")) {
        hints.push("set GOOGLE_WORKSPACE_MCP_ENABLE=1");
      }
      if (!envTruthy("GOOGLE_WORKSPACE_CLIENT_ID")) hints.push("GOOGLE_WORKSPACE_CLIENT_ID");
      if (!envTruthy("GOOGLE_WORKSPACE_CLIENT_SECRET")) hints.push("GOOGLE_WORKSPACE_CLIENT_SECRET");
      if (!envTruthy("GOOGLE_WORKSPACE_REFRESH_TOKEN") && !envTruthy("GOOGLE_WORKSPACE_TOKEN_PATH")) {
        hints.push("GOOGLE_WORKSPACE_REFRESH_TOKEN or GOOGLE_WORKSPACE_TOKEN_PATH");
      }
      return hints.length ? ` — ${hints.join(", ")}` : "";
    }
    if (def.key === "whatsapp_cloud") {
      const hints = [];
      if (!envFlagOn("WHATSAPP_CLOUD_MCP_ENABLE")) hints.push("set WHATSAPP_CLOUD_MCP_ENABLE=1");
      if (!envTruthy("WHATSAPP_CLOUD_ACCESS_TOKEN")) hints.push("WHATSAPP_CLOUD_ACCESS_TOKEN");
      if (!envTruthy("WHATSAPP_CLOUD_PHONE_NUMBER_ID")) hints.push("WHATSAPP_CLOUD_PHONE_NUMBER_ID");
      return hints.length ? ` — ${hints.join(", ")}` : "";
    }
    if (def.key === "whatsapp" && !envFlagOn("WHATSAPP_MCP_ENABLE")) {
      return " — set WHATSAPP_MCP_ENABLE=1";
    }
    if (def.key === "youtube" && !envFlagOn("YOUTUBE_MCP_ENABLE")) {
      return " — set YOUTUBE_MCP_ENABLE=1";
    }
    if (def.key === "mermaid" && !envFlagOn("MERMAID_MCP_ENABLE")) {
      return " — set MERMAID_MCP_ENABLE=1";
    }
    if (def.key === "ppt" && !envFlagOn("PPT_MCP_ENABLE")) {
      return " — set PPT_MCP_ENABLE=1";
    }
    if (def.key === "e2b") {
      const hints = [];
      if (!envFlagOn("E2B_MCP_ENABLE")) hints.push("set E2B_MCP_ENABLE=1");
      if (!envTruthy("E2B_API_KEY")) hints.push("E2B_API_KEY");
      return hints.length ? ` — ${hints.join(", ")}` : "";
    }
    if (def.key === "github" && envFlagOn("GITHUB_MCP_DISABLE")) {
      return " — GITHUB_MCP_DISABLE=1";
    }
    return "";
  }

  _shouldSkip(def) {
    if (def.enabled && !def.enabled()) {
      return { skip: true, reason: "disabled", missing: [], hint: this._enabledSkipHint(def) };
    }
    const req = def.requiredEnv || [];
    const missing = req.filter((k) => !envTruthy(k));
    if (missing.length > 0) {
      return { skip: true, reason: "missing_env", missing, hint: "" };
    }
    return { skip: false };
  }

  async init() {
    if (this.initialized) return;

    console.log("🔌 Initializing MCP servers...");
    this.skipped.clear();

    for (const def of INTEGRATIONS) {
      const { skip, reason, missing, hint } = this._shouldSkip(def);
      if (skip) {
        this.skipped.set(def.key, { reason, missing });
        const extra =
          reason === "missing_env" && missing?.length
            ? ` — need env: ${missing.join(", ")}`
            : hint || "";
        console.log(`  ⏭️  ${def.icon} ${def.label}: skipped (${reason})${extra}`);
        continue;
      }
      await this._connect(def);
    }

    this.initialized = true;
    console.log(`✅ MCP ready — ${this.servers.size} server(s) connected`);
  }

  async _connect(def) {
    const key = def.key;
    try {
      const extraEnv = def.buildEnv();
      const childEnv = { ...process.env, ...extraEnv };
      delete childEnv.PORT;
      const args = typeof def.args === "function" ? def.args() : def.args;
      const transport = new StdioClientTransport({
        command: def.command,
        args,
        env: childEnv,
      });

      const client = new Client(
        { name: `agent-platform-${key}`, version: "1.0.0" },
        { capabilities: {} }
      );

      await client.connect(transport);
      const { tools } = await client.listTools();

      const taggedTools = tools.map((t) => ({
        ...t,
        _server: key,
        _serverLabel: def.label,
        _serverIcon: def.icon,
      }));

      this.servers.set(key, { client, tools: taggedTools, def });
      console.log(`  ${def.icon} ${def.label}: ${tools.length} tools loaded`);
    } catch (err) {
      console.error(`  ❌ Failed to connect ${def.label}:`, err.message);
      this.skipped.set(key, { reason: "connect_failed", missing: [] });
    }
  }

  getAllToolsAsOpenAI() {
    const openaiTools = [];

    for (const { tools } of this.servers.values()) {
      for (const tool of tools) {
        openaiTools.push({
          type: "function",
          function: {
            name: `${tool._server}__${tool.name}`,
            description: `[${tool._serverLabel}] ${tool.description}`,
            parameters: tool.inputSchema || { type: "object", properties: {} },
          },
        });
      }
    }

    openaiTools.push(...getWebSearchOpenAITools());
    return openaiTools;
  }

  async executeTool(namespacedName, args) {
    if (namespacedName.startsWith("web__")) {
      return executeWebSearchTool(namespacedName, args);
    }

    const [serverKey, ...toolParts] = namespacedName.split("__");
    const toolName = toolParts.join("__");
    const server = this.servers.get(serverKey);

    if (!server) throw new Error(`MCP server '${serverKey}' not connected`);

    return server.client.callTool({
      name: toolName,
      arguments: args,
    });
  }

  /** Connected servers (backward-compatible shape for API consumers) */
  getServerStatus() {
    const rows = Array.from(this.servers.entries()).map(([key, { tools, def }]) => ({
      key,
      label: def.label,
      icon: def.icon,
      toolCount: tools.length,
      tools: tools.map((t) => ({ name: t.name, description: t.description })),
    }));
    const web = getWebServerStatus();
    if (web) rows.push(web);
    return rows;
  }

  /** Full catalog: connected + skipped + failed */
  getIntegrationCatalog() {
    const base = INTEGRATIONS.map((def) => {
      if (this.servers.has(def.key)) {
        const { tools } = this.servers.get(def.key);
        return {
          key: def.key,
          label: def.label,
          icon: def.icon,
          state: "connected",
          toolCount: tools.length,
          tools: tools.map((t) => ({ name: t.name, description: t.description })),
        };
      }
      const skip = this.skipped.get(def.key);
      return {
        key: def.key,
        label: def.label,
        icon: def.icon,
        state: "unavailable",
        skipReason: skip?.reason || "unknown",
        missingEnv: skip?.missing || [],
        setupGuide: def.setupGuide,
      };
    });

    if (isWebSearchEnabled()) {
      const web = getWebServerStatus();
      base.push({
        key: "web",
        label: web.label,
        icon: web.icon,
        state: "connected",
        toolCount: web.toolCount,
        tools: web.tools,
      });
    } else {
      base.push({
        key: "web",
        label: "Web search",
        icon: "🌐",
        state: "unavailable",
        skipReason: "missing_env",
        missingEnv: ["TAVILY_API_KEY or BRAVE_SEARCH_API_KEY"],
        setupGuide:
          "Add TAVILY_API_KEY (tavily.com) or BRAVE_SEARCH_API_KEY (brave.com/search/api) to backend/.env and restart the server.",
      });
    }

    return base;
  }

  /** Marketing-safe list: label, icon, description, connected flag — no tool names or schemas. */
  getPublicIntegrationList() {
    const list = INTEGRATIONS.map((def) => ({
      key: def.key,
      label: def.label,
      icon: def.icon,
      description: def.publicDescription,
      connected: this.servers.has(def.key),
    }));
    list.push({
      key: "web",
      label: "Web search",
      icon: "🌐",
      description:
        "Ground answers in current news, documentation, and the public web when your private apps do not hold the answer.",
      connected: isWebSearchEnabled(),
    });
    return list;
  }
}

export const mcpManager = new MCPClientManager();
