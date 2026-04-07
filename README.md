# ⚡ Nexus — AI Multi-Agent Automation Platform

A multi-agent console powered by **OpenAI** + **Model Context Protocol (MCP)** over stdio. Plug in **GitHub**, **Slack**, **Jira Cloud**, **Gmail**, **WhatsApp** (Baileys or **WhatsApp Business Cloud API**), and **Google Workspace** by setting environment variables — the sidebar shows what connected and what is missing.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     Browser (React)                      │
│   Sidebar (tools)  │  Chat Panel  │  Steps Log (SSE)    │
└────────────────────┬────────────────────────────────────┘
                     │ HTTP + SSE
┌────────────────────▼────────────────────────────────────┐
│               Express Backend (Node.js)                  │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │              Agent Orchestrator                   │   │
│  │   OpenAI GPT-4o + Tool-use loop (up to 10 iters) │   │
│  └──────────────────────┬───────────────────────────┘   │
│                         │ callTool()                     │
│  ┌──────────────────────▼───────────────────────────┐   │
│  │              MCP Client Manager                   │   │
│  │   Manages N MCP server connections (stdio)        │   │
│  └───┬──────────┬──────────┬──────────┬─────────────┘   │
└──────┼──────────┼──────────┼──────────┼─────────────────┘
       │  GitHub · Slack · Jira · Gmail · WhatsApp · WhatsApp Cloud · Google (env-gated)
```

**Key design decisions:**
- Each MCP server runs as a child process over stdio — zero networking overhead
- Tools are **namespaced** (`github__create_issue`) so OpenAI never confuses tools from different servers
- SSE streaming lets the UI show real-time tool call progress
- The agent loop runs up to 10 iterations — handles complex multi-step tasks

---

## Quick Start

### 1. Clone & Install

```bash
git clone <your-repo>
cd nexus-agent-platform
npm run install:all
```

### 2. Configure Environment

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env` (see `backend/.env.example` for every variable):

| Variable | Integration | Notes |
|----------|-------------|--------|
| `OPENAI_API_KEY` | Agent | Required |
| `GITHUB_TOKEN` | GitHub MCP | Required for GitHub tools (passed as `GITHUB_PERSONAL_ACCESS_TOKEN` to the server) |
| `SLACK_BOT_TOKEN`, `SLACK_TEAM_ID` | Slack MCP | Official `@modelcontextprotocol/server-slack`; optional `SLACK_CHANNEL_IDS` |
| `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN` | Jira | `npx mcp-jira-cloud@latest` |
| `GMAIL_MCP_ENABLE=1` | Gmail | Opt-in; run `npx @shinzolabs/gmail-mcp auth` or set OAuth paths / `CLIENT_ID` + `CLIENT_SECRET` + `REFRESH_TOKEN` |
| `WHATSAPP_MCP_ENABLE=1` | WhatsApp (personal) | Opt-in; unofficial Baileys-based client — QR via tools; know your risk / ToS |
| `WHATSAPP_CLOUD_MCP_ENABLE=1` + token + phone ID | WhatsApp Business (Cloud API) | Official Meta Graph API — see `backend/.env.example` |
| `PPT_MCP_ENABLE=1` | PowerPoint MCP | Local `rich-ppt-mcp` (PptxGenJS): structured themed layouts; output under the server user’s Downloads folder |
| `E2B_MCP_ENABLE=1` + `E2B_API_KEY` | E2B Code Interpreter | Bundled `@e2b/mcp-server`: Python sandbox (`e2b__run_code`); see [e2b.dev](https://e2b.dev) for keys and usage limits |

**GitHub token:** Fine-grained or classic PAT with repo, issues, and PR scopes as needed for your workflows.

### 3. Run

```bash
npm run dev
```

- Frontend: http://localhost:5173
- Backend: http://localhost:3001
- Health check: http://localhost:3001/health

---

## Project Structure

```
nexus-agent-platform/
├── package.json                  # Root — concurrent dev scripts
├── backend/
│   ├── package.json
│   ├── .env.example
│   └── src/
│       ├── index.js              # Express entry point
│       ├── mcp/
│       │   ├── manager.js          # ← MCP registry & stdio connections
│       │   ├── google-workspace-mcp/  # ← local Calendar + Meet + Gmail MCP
│       │   └── whatsapp-cloud-mcp/    # ← local WhatsApp Business Cloud API MCP
│       ├── agents/
│       │   └── orchestrator.js   # ← OpenAI agentic loop
│       └── routes/
│           ├── agent.js          # POST /api/agent/chat (SSE)
│           └── tools.js          # GET /api/tools
└── frontend/
    ├── package.json
    ├── vite.config.js
    ├── index.html
    └── src/
        ├── main.jsx
        ├── App.jsx
        ├── index.css
        └── components/
            ├── Sidebar.jsx       # Tool list + server status
            ├── Sidebar.css
            ├── ChatPanel.jsx     # Main chat UI + steps log
            └── ChatPanel.css
```

---

## Adding or changing an MCP server

1. Add an entry to the `INTEGRATIONS` array in `backend/src/mcp/manager.js` (`command`, `args`, `requiredEnv` and/or `enabled`, `buildEnv`, `setupGuide`).
2. Document env vars in `backend/.env.example`.
3. Restart the backend. `GET /api/tools` returns `servers` (connected) and `integrations` (full catalog, including skipped servers and setup copy).

Tool names are namespaced (`github__…`, `slack__…`, `jira__…`, etc.).

---

## Bundled MCP packages

| Integration | npm invocation | Auth |
|-------------|----------------|------|
| GitHub | `@modelcontextprotocol/server-github` | `GITHUB_TOKEN` |
| Slack | `@modelcontextprotocol/server-slack` | Bot token + `SLACK_TEAM_ID` |
| Jira Cloud | `mcp-jira-cloud@latest` | API token + email + base URL |
| Gmail | `@shinzolabs/gmail-mcp` | OAuth files or env (opt-in `GMAIL_MCP_ENABLE`) |
| WhatsApp (personal) | `whatsapp-mcp-lifeosai` (bin `whatsapp-mcp`) | QR / Baileys (opt-in `WHATSAPP_MCP_ENABLE`) |
| WhatsApp Business Cloud | **Local** `backend/src/mcp/whatsapp-cloud-mcp/` | Opt-in `WHATSAPP_CLOUD_MCP_ENABLE`; Meta access token + `WHATSAPP_CLOUD_PHONE_NUMBER_ID` |
| Google Meet + Gmail | **Local** `backend/src/mcp/google-workspace-mcp/` | Opt-in `GOOGLE_WORKSPACE_MCP_ENABLE`; OAuth refresh token with Calendar + Gmail scopes |

More reference servers: https://github.com/modelcontextprotocol/servers

---

## Example Agent Tasks

**Single-tool:**
- "List all open issues in owner/repo"
- "Create an issue titled 'Fix login bug' with label bug"
- "Show me the last 5 commits on main"
- "List open pull requests"

**Multi-step (agent chains tools):**
- "Find all open issues labeled 'bug', then create a PR checklist issue summarizing them"
- "Check if there are any failing CI runs on open PRs"
- "Search for repos about MCP servers and list the top 3 by stars"

---

## API Reference

### `POST /api/agent/chat`

Streams SSE events.

**Request body:**
```json
{
  "messages": [
    { "role": "user", "content": "List open issues in myorg/myrepo" }
  ]
}
```

**SSE Events:**
| Event | Payload |
|-------|---------|
| `status` | `{ message: string }` |
| `tool_call` | `{ tool: string, args: object }` |
| `tool_result` | `{ tool: string, result: string, success: boolean }` |
| `done` | `{ content: string, steps: Step[], usage: object }` |
| `error` | `{ message: string }` |

### `GET /api/tools`

Returns connected MCP servers and their tools.

---

## Customizing the Agent

Edit the system prompt in `backend/src/agents/orchestrator.js`:

```js
const SYSTEM_PROMPT = `You are an intelligent automation agent...`;
```

Change the model in `.env`:
```env
OPENAI_MODEL=gpt-4o-mini   # cheaper, faster
OPENAI_MODEL=gpt-4o        # smarter, default
```

---

## Tech Stack

| Layer | Tech |
|-------|------|
| LLM | OpenAI GPT-4o |
| Tool Protocol | Model Context Protocol (MCP) |
| Backend | Node.js + Express |
| Frontend | React 18 + Vite |
| Streaming | Server-Sent Events (SSE) |
| Styling | CSS Variables + custom design system |
