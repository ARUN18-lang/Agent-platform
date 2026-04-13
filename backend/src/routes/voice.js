import { Router } from "express";
import multer from "multer";
import { ObjectId } from "mongodb";
import {
  insertVoiceSegment,
  listVoiceSegmentsForStream,
  processVoiceSegmentAsync,
  voiceInputsCol,
} from "../services/voiceInputs.js";
import { broadcastVoiceEvent } from "../voice/voiceSubscribers.js";

export const voiceRouter = Router();

const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

function requireVoiceDb(res) {
  if (!voiceInputsCol()) {
    res.status(503).json({ error: "Database not configured (MONGODB_URI required for voice)." });
    return false;
  }
  return true;
}

/**
 * POST /api/agent/voice/segment
 * multipart: file, fields: streamId, segmentIndex
 */
voiceRouter.post("/segment", (req, res, next) => {
  audioUpload.single("file")(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message || "Upload failed" });
    }
    next();
  });
}, async (req, res) => {
  if (!requireVoiceDb(res)) return;
  if (!req.file?.buffer?.length) {
    return res.status(400).json({ error: "No audio file" });
  }
  const streamId = typeof req.body?.streamId === "string" ? req.body.streamId.trim() : "";
  const segmentIndex = Number(req.body?.segmentIndex);
  if (!streamId || streamId.length > 128) {
    return res.status(400).json({ error: "streamId is required (max 128 chars)" });
  }
  if (!Number.isFinite(segmentIndex) || segmentIndex < 0 || segmentIndex > 10_000) {
    return res.status(400).json({ error: "segmentIndex must be a non-negative integer" });
  }

  const userId = String(req.user.id);
  try {
    const docId = await insertVoiceSegment({
      userId,
      streamId,
      segmentIndex,
      mimeType: req.file.mimetype || "application/octet-stream",
      audioBuffer: req.file.buffer,
    });

    void processVoiceSegmentAsync(docId, (evt) => {
      if (evt.type === "transcript" || evt.type === "transcript_error") {
        broadcastVoiceEvent(userId, streamId, evt);
      }
    });

    res.status(202).json({
      id: docId.toString(),
      streamId,
      segmentIndex,
      status: "pending",
    });
  } catch (e) {
    console.error("voice segment:", e);
    res.status(500).json({ error: e?.message || "Could not queue voice segment" });
  }
});

/** GET /api/agent/voice/stream/:streamId — list segments (no raw audio) */
voiceRouter.get("/stream/:streamId", async (req, res) => {
  if (!requireVoiceDb(res)) return;
  const streamId = String(req.params.streamId || "").trim();
  if (!streamId) {
    return res.status(400).json({ error: "Invalid streamId" });
  }
  try {
    const segments = await listVoiceSegmentsForStream(String(req.user.id), streamId);
    res.json({ streamId, segments });
  } catch (e) {
    console.error("voice stream list:", e);
    res.status(500).json({ error: "Could not load voice stream" });
  }
});

/** GET /api/agent/voice/segment/:id — single segment metadata */
voiceRouter.get("/segment/:id", async (req, res) => {
  if (!requireVoiceDb(res)) return;
  let oid;
  try {
    oid = new ObjectId(req.params.id);
  } catch {
    return res.status(400).json({ error: "Invalid id" });
  }
  try {
    const col = voiceInputsCol();
    const doc = await col.findOne(
      { _id: oid, userId: String(req.user.id) },
      { projection: { audio: 0 } }
    );
    if (!doc) return res.status(404).json({ error: "Not found" });
    res.json({
      id: doc._id.toString(),
      streamId: doc.streamId,
      segmentIndex: doc.segmentIndex,
      mimeType: doc.mimeType,
      status: doc.status,
      transcriptEn: doc.transcriptEn,
      languageCode: doc.languageCode,
      error: doc.error,
      createdAt: doc.createdAt?.toISOString?.() ?? null,
      updatedAt: doc.updatedAt?.toISOString?.() ?? null,
    });
  } catch (e) {
    console.error("voice segment get:", e);
    res.status(500).json({ error: "Could not load segment" });
  }
});
