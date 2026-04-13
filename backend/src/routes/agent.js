import path from "path";
import multer from "multer";
import { Router } from "express";
import { runAgent } from "../agents/orchestrator.js";
import { saveChatAttachment, resolveChatAttachments } from "../services/chatAttachmentStore.js";
import { bufferToCsvText } from "../services/uploadParsing.js";

export const agentRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/\.(csv|xlsx|xls)$/i.test(file.originalname || "")) {
      cb(null, true);
      return;
    }
    cb(new Error("Only .csv, .xlsx, or .xls files are allowed"));
  },
});

/**
 * POST /api/agent/attachments
 * multipart field name: file
 */
agentRouter.post("/attachments", (req, res, next) => {
  upload.single("file")(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message || "Upload failed" });
    }
    next();
  });
}, async (req, res) => {
  try {
    if (!req.file?.buffer) {
      return res.status(400).json({ error: "No file" });
    }
    const csvText = bufferToCsvText(req.file.buffer, req.file.originalname);
    const maxChars = 5_000_000;
    if (csvText.length > maxChars) {
      return res.status(413).json({ error: "File too large after conversion" });
    }
    const filename = path.basename(req.file.originalname || "data.csv");
    const id = saveChatAttachment({
      userId: String(req.user.id),
      filename,
      mime: req.file.mimetype || "application/octet-stream",
      csvText,
    });
    const lines = csvText.split("\n");
    const head = lines.slice(0, 8).join("\n");
    res.json({
      id,
      filename,
      rowEstimate: lines.length,
      head,
    });
  } catch (e) {
    res.status(400).json({ error: e?.message || "Could not read file" });
  }
});

/**
 * POST /api/agent/chat
 * Body: { messages: [{role, content}], attachmentIds?: string[] }
 * Streams SSE events back to the client
 */
agentRouter.post("/chat", async (req, res) => {
  const { messages, attachmentIds } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: "messages array required" });
  }

  const ids = Array.isArray(attachmentIds)
    ? attachmentIds.filter((x) => typeof x === "string").slice(0, 5)
    : [];
  const attachments = resolveChatAttachments(String(req.user.id), ids);
  if (ids.length > 0) {
    if (attachments.length === 0) {
      console.warn("[agent/chat] attachmentIds sent but none resolved — user may need to re-attach", {
        idCount: ids.length,
      });
    } else if (attachments.length < ids.length) {
      console.warn("[agent/chat] partial attachment resolve", {
        requested: ids.length,
        resolved: attachments.length,
      });
    }
  }

  // Set up SSE
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  const send = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  // SSE comment pings keep proxies from treating long OpenAI + MCP runs as idle (Render, etc.)
  let heartbeat = null;

  try {
    if (ids.length > 0 && attachments.length === 0) {
      send("status", {
        message:
          "Attached file(s) could not be loaded — try attaching again (uploads expire after 2 hours).",
      });
    }
    send("status", { message: "Working…" });

    heartbeat = setInterval(() => {
      try {
        res.write(`: keepalive ${Date.now()}\n\n`);
      } catch {
        clearInterval(heartbeat);
        heartbeat = null;
      }
    }, 15000);

    const result = await runAgent(
      messages,
      (update) => {
      if (update.type === "tool_call") {
        send("tool_call", {
          tool: update.tool,
          args: update.args,
        });
      } else if (update.type === "tool_result") {
        send("tool_result", {
          tool: update.tool,
          result: update.result,
          success: update.success,
          ...(update.attachments?.length ? { attachments: update.attachments } : {}),
        });
      }
    },
    { attachments, attachmentIdsRequested: ids.length }
    );

    send("done", {
      content: result.content,
      steps: result.steps,
      usage: result.usage,
    });

    res.end();
  } catch (err) {
    console.error("Agent error:", err);
    send("error", { message: err.message });
    res.end();
  } finally {
    if (heartbeat) clearInterval(heartbeat);
  }
});
