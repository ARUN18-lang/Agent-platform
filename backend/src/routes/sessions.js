import { Router } from "express";
import { ObjectId } from "mongodb";
import { getDb } from "../db/mongo.js";

export const sessionsRouter = Router();

function sessionsCol() {
  const db = getDb();
  if (!db) return null;
  return db.collection("sessions");
}

function toPublicSession(doc) {
  if (!doc) return null;
  const messageCount =
    typeof doc.messageCount === "number"
      ? doc.messageCount
      : Array.isArray(doc.messages)
        ? doc.messages.length
        : 0;
  return {
    id: doc._id.toString(),
    title: doc.title || "New conversation",
    createdAt: doc.createdAt?.toISOString?.() ?? null,
    updatedAt: doc.updatedAt?.toISOString?.() ?? null,
    messageCount,
  };
}

/** GET /api/sessions — list sessions (newest first) */
sessionsRouter.get("/", async (_req, res) => {
  const col = sessionsCol();
  if (!col) {
    return res.json({ sessions: [], persistence: false });
  }

  try {
    const docs = await col
      .aggregate([
        { $sort: { updatedAt: -1 } },
        { $limit: 200 },
        {
          $project: {
            title: 1,
            createdAt: 1,
            updatedAt: 1,
            messageCount: { $size: { $ifNull: ["$messages", []] } },
          },
        },
      ])
      .toArray();

    const sessions = docs.map((d) => toPublicSession(d));
    res.json({ sessions, persistence: true });
  } catch (err) {
    console.error("sessions list:", err);
    res.status(500).json({ error: "Could not load conversations", persistence: true });
  }
});

/** POST /api/sessions — create empty session */
sessionsRouter.post("/", async (req, res) => {
  const col = sessionsCol();
  if (!col) {
    return res.status(503).json({ error: "Saving is not available", persistence: false });
  }

  const title =
    typeof req.body?.title === "string" && req.body.title.trim()
      ? req.body.title.trim().slice(0, 120)
      : "New conversation";

  const now = new Date();
  try {
    const { insertedId } = await col.insertOne({
      title,
      messages: [],
      createdAt: now,
      updatedAt: now,
    });
    const doc = await col.findOne({ _id: insertedId });
    res.status(201).json({ session: toPublicSession(doc) });
  } catch (err) {
    console.error("sessions create:", err);
    res.status(500).json({ error: "Could not start a conversation" });
  }
});

/** GET /api/sessions/:id */
sessionsRouter.get("/:id", async (req, res) => {
  const col = sessionsCol();
  if (!col) {
    return res.status(503).json({ error: "Database not configured" });
  }

  let oid;
  try {
    oid = new ObjectId(req.params.id);
  } catch {
    return res.status(400).json({ error: "Invalid id" });
  }

  try {
    const doc = await col.findOne({ _id: oid });
    if (!doc) return res.status(404).json({ error: "Not found" });

    res.json({
      session: {
        ...toPublicSession(doc),
        messages: Array.isArray(doc.messages) ? doc.messages : [],
      },
    });
  } catch (err) {
    console.error("sessions get:", err);
    res.status(500).json({ error: "Could not load conversation" });
  }
});

/** PUT /api/sessions/:id — replace messages (and optional title) */
sessionsRouter.put("/:id", async (req, res) => {
  const col = sessionsCol();
  if (!col) {
    return res.status(503).json({ error: "Database not configured" });
  }

  let oid;
  try {
    oid = new ObjectId(req.params.id);
  } catch {
    return res.status(400).json({ error: "Invalid id" });
  }

  const { messages, title } = req.body || {};
  if (!Array.isArray(messages)) {
    return res.status(400).json({ error: "messages array required" });
  }

  const safeMessages = messages
    .filter((m) => m && (m.role === "user" || m.role === "assistant"))
    .map((m) => ({
      id: typeof m.id === "string" ? m.id : undefined,
      role: m.role,
      content: typeof m.content === "string" ? m.content : "",
      steps: Array.isArray(m.steps) ? m.steps : undefined,
      attachmentNames: Array.isArray(m.attachmentNames)
        ? m.attachmentNames.map((x) => String(x).slice(0, 200)).slice(0, 8)
        : undefined,
    }));

  const now = new Date();
  const update = { messages: safeMessages, updatedAt: now };

  if (typeof title === "string" && title.trim()) {
    update.title = title.trim().slice(0, 120);
  } else {
    const firstUser = safeMessages.find((m) => m.role === "user" && m.content?.trim());
    if (firstUser?.content) {
      const snippet = firstUser.content.trim().replace(/\s+/g, " ").slice(0, 72);
      update.title = snippet.length < firstUser.content.trim().length ? `${snippet}…` : snippet;
    }
  }

  try {
    const ur = await col.updateOne({ _id: oid }, { $set: update });
    if (ur.matchedCount === 0) return res.status(404).json({ error: "Not found" });
    const doc = await col.findOne({ _id: oid });
    res.json({
      session: {
        ...toPublicSession(doc),
        messages: doc.messages || [],
      },
    });
  } catch (err) {
    console.error("sessions put:", err);
    res.status(500).json({ error: "Could not save conversation" });
  }
});

/** DELETE /api/sessions/:id */
sessionsRouter.delete("/:id", async (req, res) => {
  const col = sessionsCol();
  if (!col) {
    return res.status(503).json({ error: "Database not configured" });
  }

  let oid;
  try {
    oid = new ObjectId(req.params.id);
  } catch {
    return res.status(400).json({ error: "Invalid id" });
  }

  try {
    const { deletedCount } = await col.deleteOne({ _id: oid });
    if (!deletedCount) return res.status(404).json({ error: "Not found" });
    res.status(204).end();
  } catch (err) {
    console.error("sessions delete:", err);
    res.status(500).json({ error: "Could not delete conversation" });
  }
});
