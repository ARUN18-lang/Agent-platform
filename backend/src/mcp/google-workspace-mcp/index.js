/**
 * Local MCP: Google Calendar (Meet links) + Gmail (send / list).
 * Stdio only. Auth: OAuth2 refresh token + client id/secret.
 *
 * Required env (from parent process):
 * - GOOGLE_WORKSPACE_CLIENT_ID
 * - GOOGLE_WORKSPACE_CLIENT_SECRET
 * - GOOGLE_WORKSPACE_REFRESH_TOKEN  OR  GOOGLE_WORKSPACE_TOKEN_PATH (JSON with refresh_token)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { google } from "googleapis";
import { readFileSync, existsSync } from "fs";
import { homedir } from "os";
import path from "path";
import { z } from "zod";

function resolvePath(p) {
  if (!p) return p;
  if (p.startsWith("~/")) return path.join(homedir(), p.slice(2));
  return p;
}

function loadRefreshToken() {
  const direct = process.env.GOOGLE_WORKSPACE_REFRESH_TOKEN?.trim();
  if (direct) return direct;
  const p = resolvePath(process.env.GOOGLE_WORKSPACE_TOKEN_PATH?.trim());
  if (p && existsSync(p)) {
    const j = JSON.parse(readFileSync(p, "utf8"));
    if (j.refresh_token) return j.refresh_token;
  }
  throw new Error("Missing GOOGLE_WORKSPACE_REFRESH_TOKEN or valid GOOGLE_WORKSPACE_TOKEN_PATH");
}

function getAuth() {
  const clientId = process.env.GOOGLE_WORKSPACE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_WORKSPACE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_WORKSPACE_CLIENT_ID and GOOGLE_WORKSPACE_CLIENT_SECRET are required");
  }
  const refreshToken = loadRefreshToken();
  const oauth2 = new google.auth.OAuth2(clientId, clientSecret, "http://localhost");
  oauth2.setCredentials({ refresh_token: refreshToken });
  return oauth2;
}

function encodeRawEmail(to, subject, body) {
  const lines = [
    `To: ${to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "",
    body,
  ];
  return Buffer.from(lines.join("\r\n")).toString("base64url");
}

const mcpServer = new McpServer({ name: "google-workspace-mcp", version: "1.0.0" });

mcpServer.registerTool(
  "create_calendar_event_with_meet",
  {
    description:
      "Create a Google Calendar event on the primary calendar and attach a Google Meet link (Hangouts Meet). Requires Calendar API scope on the refresh token.",
    inputSchema: {
      summary: z.string().describe("Event title"),
      start_iso: z.string().describe("Start time in ISO 8601 (e.g. 2026-04-05T21:00:00+05:30 for 9pm IST)"),
      end_iso: z.string().describe("End time in ISO 8601"),
      description: z.string().optional().describe("Optional event description / agenda"),
      timezone: z
        .string()
        .optional()
        .describe("IANA timezone fallback if start/end are date-time without offset (e.g. Asia/Kolkata)"),
      attendee_emails: z
        .array(z.string())
        .optional()
        .describe("Optional list of attendee email addresses"),
    },
  },
  async ({ summary, start_iso, end_iso, description, timezone, attendee_emails }) => {
    const auth = getAuth();
    const calendar = google.calendar({ version: "v3", auth });
    const tz = timezone || "UTC";
    const requestId = `mcp-meet-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    let res;
    try {
      res = await calendar.events.insert({
        calendarId: "primary",
        conferenceDataVersion: 1,
        requestBody: {
          summary,
          description: description || undefined,
          start: { dateTime: start_iso, timeZone: tz },
          end: { dateTime: end_iso, timeZone: tz },
          conferenceData: {
            createRequest: {
              requestId,
              conferenceSolutionKey: { type: "hangoutsMeet" },
            },
          },
          attendees: attendee_emails?.length ? attendee_emails.map((email) => ({ email })) : undefined,
        },
      });
    } catch (err) {
      const status = err?.response?.status ?? err?.code;
      const body = err?.response?.data?.error?.message || err?.message || String(err);
      const scopeHint =
        status === 403 || /insufficient|permission|access denied|forbidden/i.test(body)
          ? " Your OAuth refresh token likely lacks Calendar scope. In Google Cloud: enable Calendar API; add scope https://www.googleapis.com/auth/calendar.events to the OAuth consent screen; revoke this app at https://myaccount.google.com/permissions then re-authorize (OAuth Playground or a new auth flow) and replace GOOGLE_WORKSPACE_REFRESH_TOKEN / credentials.json."
          : "";
      throw new Error(`${body}${scopeHint}`);
    }

    const data = res.data;
    const meetLink =
      data.hangoutLink ||
      data.conferenceData?.entryPoints?.find((e) => e.entryPointType === "video")?.uri ||
      null;

    const text = [
      `Event id: ${data.id}`,
      `Summary: ${data.summary}`,
      `Meet link: ${meetLink || "(none — check Workspace / API response)"}`,
      `htmlLink: ${data.htmlLink || ""}`,
    ].join("\n");

    return { content: [{ type: "text", text }] };
  }
);

mcpServer.registerTool(
  "list_calendar_events",
  {
    description: "List upcoming events on the primary calendar between two ISO datetimes.",
    inputSchema: {
      time_min: z.string().describe("Start of range (ISO 8601)"),
      time_max: z.string().describe("End of range (ISO 8601)"),
      max_results: z.number().optional().describe("Max events (default 10)"),
    },
  },
  async ({ time_min, time_max, max_results }) => {
    const auth = getAuth();
    const calendar = google.calendar({ version: "v3", auth });
    let res;
    try {
      res = await calendar.events.list({
        calendarId: "primary",
        timeMin: time_min,
        timeMax: time_max,
        maxResults: max_results ?? 10,
        singleEvents: true,
        orderBy: "startTime",
      });
    } catch (err) {
      const status = err?.response?.status ?? err?.code;
      const body = err?.response?.data?.error?.message || err?.message || String(err);
      const scopeHint =
        status === 403 || /insufficient|permission|access denied/i.test(body)
          ? " Add Calendar scope https://www.googleapis.com/auth/calendar.events and re-authorize to get a new refresh_token."
          : "";
      throw new Error(`${body}${scopeHint}`);
    }
    const items = res.data.items || [];
    const text =
      items.length === 0
        ? "No events in range."
        : items
            .map((ev) => {
              const start = ev.start?.dateTime || ev.start?.date || "";
              return `- ${start} | ${ev.summary || "(no title)"} | ${ev.hangoutLink || ""}`;
            })
            .join("\n");
    return { content: [{ type: "text", text }] };
  }
);

mcpServer.registerTool(
  "send_gmail_message",
  {
    description:
      "Send a plain-text email via Gmail API. Requires gmail.send (or broader Gmail) scope on the refresh token.",
    inputSchema: {
      to: z.string().describe("Recipient email"),
      subject: z.string().describe("Subject line"),
      body: z.string().describe("Plain text body"),
    },
  },
  async ({ to, subject, body }) => {
    const auth = getAuth();
    const gmail = google.gmail({ version: "v1", auth });
    const raw = encodeRawEmail(to, subject, body);
    const res = await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw },
    });
    return {
      content: [
        {
          type: "text",
          text: `Sent. Message id: ${res.data.id || "unknown"}`,
        },
      ],
    };
  }
);

mcpServer.registerTool(
  "list_gmail_messages",
  {
    description: "List recent message ids and subjects (snippet) from the inbox.",
    inputSchema: {
      max_results: z.number().optional().describe("Max messages (default 10, max 20)"),
      query: z.string().optional().describe("Gmail search query (same as Gmail search box)"),
    },
  },
  async ({ max_results, query }) => {
    const auth = getAuth();
    const gmail = google.gmail({ version: "v1", auth });
    const n = Math.min(max_results ?? 10, 20);
    const list = await gmail.users.messages.list({
      userId: "me",
      maxResults: n,
      q: query || undefined,
    });
    const msgs = list.data.messages || [];
    if (msgs.length === 0) {
      return { content: [{ type: "text", text: "No messages." }] };
    }
    const lines = [];
    for (const m of msgs) {
      const full = await gmail.users.messages.get({
        userId: "me",
        id: m.id,
        format: "metadata",
        metadataHeaders: ["Subject", "From"],
      });
      const headers = full.data.payload?.headers || [];
      const sub = headers.find((h) => h.name === "Subject")?.value || "";
      const from = headers.find((h) => h.name === "From")?.value || "";
      lines.push(`- ${m.id} | ${sub} | ${from}`);
    }
    return { content: [{ type: "text", text: lines.join("\n") }] };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);
}

main().catch((err) => {
  console.error("google-workspace-mcp fatal:", err);
  process.exit(1);
});
