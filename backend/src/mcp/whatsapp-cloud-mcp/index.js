/**
 * Local MCP: WhatsApp Business Platform (Cloud API) via Meta Graph API.
 * Stdio only. Requires a permanent access token and Phone number ID from Meta Business Suite.
 *
 * Env (from parent):
 * - WHATSAPP_CLOUD_ACCESS_TOKEN
 * - WHATSAPP_CLOUD_PHONE_NUMBER_ID
 * Optional:
 * - WHATSAPP_CLOUD_API_VERSION (default v21.0)
 * - WHATSAPP_CLOUD_WABA_ID — for list_whatsapp_message_templates
 * - WHATSAPP_CLOUD_DEFAULT_LANGUAGE_CODE — optional; default **en** when language_code omitted in send_whatsapp_template
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const GRAPH_HOST = "https://graph.facebook.com";

/** Default template language when language_code is omitted (must match Meta; this project uses `en` not `en_US`). */
function defaultTemplateLanguageCode() {
  const v = process.env.WHATSAPP_CLOUD_DEFAULT_LANGUAGE_CODE?.trim();
  return v || "en";
}

function getConfig() {
  // Strip accidental leading "=" from typos like WHATSAPP_CLOUD_ACCESS_TOKEN==... in .env
  const token = process.env.WHATSAPP_CLOUD_ACCESS_TOKEN?.trim().replace(/^=+/, "") || "";
  const phoneId = process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID?.trim();
  const version = (process.env.WHATSAPP_CLOUD_API_VERSION || "v21.0").replace(/^v?/, "v");
  if (!token || !phoneId) {
    throw new Error(
      "WHATSAPP_CLOUD_ACCESS_TOKEN and WHATSAPP_CLOUD_PHONE_NUMBER_ID are required"
    );
  }
  return { token, phoneId, version: version.startsWith("v") ? version : `v${version}` };
}

/** E.164 digits only (no + or spaces). WhatsApp requires country code + national number. */
function normalizePhone(to) {
  const digits = String(to).replace(/\D/g, "");
  if (digits.length < 8) {
    throw new Error("Recipient must be a phone number with country code (e.g. 14155552671)");
  }
  if (digits.length === 10) {
    throw new Error(
      "`to` has 10 digits only — add country code (no +). Example India: 919361559703 not 9361559703. The allow list must use the same full international number."
    );
  }
  return digits;
}

/** Cloud API group id from Groups API (not consumer JID like 120363...@g.us). */
function normalizeGroupId(to) {
  const id = String(to).trim();
  if (id.length < 8) {
    throw new Error(
      "Group id must be the Cloud API group id from Meta Groups API (create/list groups), not a phone number."
    );
  }
  return id;
}

async function graphFetch(path, { method = "GET", body } = {}) {
  const { token, version } = getConfig();
  const url = `${GRAPH_HOST}/${version}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      data?.error?.message ||
      data?.error?.error_user_msg ||
      res.statusText ||
      `HTTP ${res.status}`;
    const errCode = data?.error?.code;
    const code = errCode != null ? ` (code ${errCode})` : "";
    let hint = "";
    if (errCode === 131030 || /allowed list/i.test(String(msg))) {
      hint =
        " — Development allow list lives in developers.facebook.com → your app (same app as this token) → WhatsApp → API setup / \"send test message\" recipients — not only Business Suite. The number must match exactly in international form (e.g. 919361559703). Production: templates or 24h window.";
    }
    if (errCode === 132001 || /does not exist in the translation/i.test(String(msg))) {
      hint =
        " — No approved template for this **name + language** combo. Use list_whatsapp_message_templates (needs WHATSAPP_CLOUD_WABA_ID) and send with the **exact** template `name` and `language` from an APPROVED row. Use **template_name** agent_greeting and **language_code** **en** (default here; not en_US unless your template row says en_US).";
    }
    throw new Error(`${msg}${code}${hint}`);
  }
  return data;
}

const mcpServer = new McpServer({ name: "whatsapp-cloud-mcp", version: "1.0.0" });

mcpServer.registerTool(
  "send_whatsapp_template",
  {
    description:
      "Send an APPROVED template. **Always pass template_name: \"agent_greeting\"** for standard outbound messages. Use **language_code \"en\"** (omit to default to en — do not use en_US unless your Meta template is registered as en_US). Put the user-visible text in **body_parameters** ({{1}}, …) or **body_named_parameters**. Do **not** use hello_world for custom text. Do not pass both positional and named body params.",
    inputSchema: {
      to: z
        .string()
        .describe("Recipient: full international digits with country code, no + (e.g. 919361559703)."),
      template_name: z
        .string()
        .min(1)
        .describe('Required. Use **agent_greeting** for standard agent messages; otherwise the exact Meta template name (snake_case).'),
      language_code: z
        .string()
        .optional()
        .describe('Template language as in Meta (default **en**). Use **en** for agent_greeting when approved as English; only pass en_US if the template list shows en_US.'),
      body_parameters: z
        .array(z.string())
        .optional()
        .describe(
          "Positional variables only: values for {{1}}, {{2}}, … in order. Omit if using body_named_parameters."
        ),
      body_named_parameters: z
        .array(
          z.object({
            parameter_name: z.string().describe("Name as in template, e.g. first_name for {{first_name}}"),
            text: z.string().describe("Value to substitute"),
          })
        )
        .optional()
        .describe(
          "Named variables only: use when template uses parameter_format named. Omit if using body_parameters."
        ),
    },
  },
  async ({ to, template_name, language_code, body_parameters, body_named_parameters }) => {
    const { phoneId } = getConfig();
    const resolvedName = String(template_name).trim();
    if (!resolvedName) {
      throw new Error("template_name is required (e.g. agent_greeting).");
    }
    const hasPos = body_parameters?.length > 0;
    const hasNamed = body_named_parameters?.length > 0;
    if (hasPos && hasNamed) {
      throw new Error("Use either body_parameters (positional) or body_named_parameters, not both.");
    }
    const template = {
      name: resolvedName,
      language: { code: language_code?.trim() || defaultTemplateLanguageCode() },
    };
    if (hasNamed) {
      template.components = [
        {
          type: "body",
          parameters: body_named_parameters.map(({ parameter_name, text }) => ({
            type: "text",
            parameter_name,
            text: String(text),
          })),
        },
      ];
    } else if (hasPos) {
      template.components = [
        {
          type: "body",
          parameters: body_parameters.map((text) => ({
            type: "text",
            text: String(text),
          })),
        },
      ];
    }
    const payload = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: normalizePhone(to),
      type: "template",
      template,
    };
    const data = await graphFetch(`/${phoneId}/messages`, { method: "POST", body: payload });
    const id = data?.messages?.[0]?.id || data?.message_id || JSON.stringify(data);
    let note = "";
    const noVars = !hasPos && !hasNamed;
    const lower = String(resolvedName).toLowerCase();
    if (noVars && lower === "hello_world") {
      note =
        "\n\nNote: hello_world is Meta’s fixed preset — not your custom text. Use template_name **agent_greeting** with body_parameters for your message, or another approved template with variables.";
    } else if (noVars && lower === "agent_greeting") {
      note =
        "\n\nIf this template has body variables (e.g. {{1}}), Meta may reject the send or show an incomplete message until you pass body_parameters or body_named_parameters matching the template.";
    }
    return {
      content: [
        {
          type: "text",
          text: `Template sent. WhatsApp message id: ${id}${note}`,
        },
      ],
    };
  }
);

mcpServer.registerTool(
  "send_whatsapp_text",
  {
    description:
      "Session-only reply: free text only when the user messaged this business number within ~24h. If they have NOT messaged you recently, Meta may still return HTTP 200 + a message id but the text will NOT appear on their phone — use send_whatsapp_template instead. First outbound / cold outreach must use an approved template. Groups: recipient_type group + Cloud group id.",
    inputSchema: {
      recipient_type: z
        .enum(["individual", "group"])
        .optional()
        .describe(
          '"individual" (default): E.164-style phone digits. "group": Meta Cloud group id string from Groups API.'
        ),
      to: z
        .string()
        .describe(
          "individual: digits with country code, no +. group: Cloud API group id (opaque string from create/list group endpoints)."
        ),
      body: z.string().max(4096).describe("Message text (UTF-8)"),
      preview_url: z
        .boolean()
        .optional()
        .describe("If true, show link previews in the message (default false)"),
    },
  },
  async ({ to, body, preview_url, recipient_type }) => {
    const { phoneId } = getConfig();
    const rType = recipient_type === "group" ? "group" : "individual";
    const toValue = rType === "group" ? normalizeGroupId(to) : normalizePhone(to);
    const payload = {
      messaging_product: "whatsapp",
      recipient_type: rType,
      to: toValue,
      type: "text",
      text: {
        preview_url: Boolean(preview_url),
        body,
      },
    };
    const data = await graphFetch(`/${phoneId}/messages`, { method: "POST", body: payload });
    const id = data?.messages?.[0]?.id || data?.message_id || JSON.stringify(data);
    const warn = [
      "A 200 response and a message id only mean Cloud API accepted the request — not that the user’s WhatsApp will show it.",
      "Session text (type \"text\") outside the ~24h customer-care window is routinely not delivered to the handset even when Meta returns an id.",
      "For numbers that have not messaged you recently (or to guarantee delivery): use send_whatsapp_template with explicit template_name (e.g. **agent_greeting**), exact language_code, and body_parameters / body_named_parameters matching the template’s {{1}} or named vars.",
      "In Meta app development mode, the recipient must also be on the test allow list (developers.facebook.com → your app → WhatsApp → API setup).",
    ].join(" ");
    return {
      content: [
        {
          type: "text",
          text: `Accepted by Meta. WhatsApp message id: ${id}\n\n${warn}`,
        },
      ],
    };
  }
);

mcpServer.registerTool(
  "list_whatsapp_message_templates",
  {
    description:
      "List templates on the WhatsApp Business Account (name, status, language, category). Requires WHATSAPP_CLOUD_WABA_ID in backend env. Use to see which templates are APPROVED and exact language codes before sending.",
    inputSchema: {
      limit: z
        .number()
        .optional()
        .describe("Max rows (default 30, cap 100)"),
    },
  },
  async ({ limit }) => {
    const wabaId = process.env.WHATSAPP_CLOUD_WABA_ID?.trim();
    if (!wabaId) {
      throw new Error(
        "Set WHATSAPP_CLOUD_WABA_ID to your WhatsApp Business Account ID (Business Settings → WhatsApp accounts, or API) to list templates."
      );
    }
    const n = Math.min(Math.max(limit ?? 30, 1), 100);
    const fields = encodeURIComponent("name,status,language,category,id");
    const data = await graphFetch(`/${wabaId}/message_templates?limit=${n}&fields=${fields}`);
    const rows = data?.data ?? [];
    if (rows.length === 0) {
      return { content: [{ type: "text", text: "No templates returned (empty list or check token permissions)." }] };
    }
    const lines = rows.map(
      (t) =>
        `- ${t.name ?? "?"} | ${t.language ?? "?"} | ${t.status ?? "?"} | ${t.category ?? "?"} | id ${t.id ?? "?"}`
    );
    return {
      content: [{ type: "text", text: lines.join("\n") }],
    };
  }
);

mcpServer.registerTool(
  "get_whatsapp_phone_status",
  {
    description:
      "Verify Cloud API credentials: returns display phone number, verified name, and quality rating for the configured Phone number ID.",
    inputSchema: {},
  },
  async () => {
    const { phoneId } = getConfig();
    const fields =
      "display_phone_number,verified_name,code_verification_status,quality_rating";
    const data = await graphFetch(`/${phoneId}?fields=${fields}`);
    const text = [
      `display_phone_number: ${data.display_phone_number ?? "(n/a)"}`,
      `verified_name: ${data.verified_name ?? "(n/a)"}`,
      `code_verification_status: ${data.code_verification_status ?? "(n/a)"}`,
      `quality_rating: ${data.quality_rating ?? "(n/a)"}`,
    ].join("\n");
    return { content: [{ type: "text", text }] };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);
}

main().catch((err) => {
  console.error("whatsapp-cloud-mcp fatal:", err);
  process.exit(1);
});
