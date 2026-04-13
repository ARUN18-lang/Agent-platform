import { Binary, ObjectId } from "mongodb";
import { getDb } from "../db/mongo.js";
import { sarvamSpeechToEnglish } from "./sarvamSpeech.js";

const COLLECTION = "voice_inputs";

export function voiceInputsCol() {
  const db = getDb();
  if (!db) return null;
  return db.collection(COLLECTION);
}

/**
 * @param {{ userId: string, streamId: string, segmentIndex: number, mimeType: string, audioBuffer: Buffer }} p
 * @returns {Promise<ObjectId>}
 */
export async function insertVoiceSegment(p) {
  const col = voiceInputsCol();
  if (!col) throw new Error("Database not configured");
  const now = new Date();
  const { insertedId } = await col.insertOne({
    userId: p.userId,
    streamId: p.streamId,
    segmentIndex: p.segmentIndex,
    mimeType: p.mimeType || "application/octet-stream",
    audio: new Binary(p.audioBuffer),
    transcriptEn: null,
    languageCode: null,
    sarvamRequestId: null,
    status: "pending",
    error: null,
    createdAt: now,
    updatedAt: now,
  });
  return insertedId;
}

/**
 * Run Sarvam after insert; invokes onEvent for transcript/error (for WebSocket push).
 * @param {import('mongodb').ObjectId} docId
 * @param {(evt: { type: string, [k: string]: unknown }) => void} [onEvent]
 */
export async function processVoiceSegmentAsync(docId, onEvent) {
  const col = voiceInputsCol();
  if (!col) return;

  const doc = await col.findOne({ _id: docId });
  if (!doc || doc.status !== "pending") return;

  const now = new Date();
  await col.updateOne({ _id: docId }, { $set: { status: "processing", updatedAt: now } });

  let audioBuf;
  try {
    const raw = doc.audio;
    audioBuf = raw?.buffer != null ? Buffer.from(raw.buffer) : Buffer.from(raw ?? []);
  } catch {
    await col.updateOne(
      { _id: docId },
      { $set: { status: "error", error: "Invalid audio payload", updatedAt: new Date() } }
    );
    onEvent?.({
      type: "transcript_error",
      segmentId: docId.toString(),
      streamId: doc.streamId,
      segmentIndex: doc.segmentIndex,
      message: "Invalid audio payload",
    });
    return;
  }

  try {
    const out = await sarvamSpeechToEnglish(audioBuf, doc.mimeType);
    await col.updateOne(
      { _id: docId },
      {
        $set: {
          status: "done",
          transcriptEn: out.transcript,
          languageCode: out.language_code,
          sarvamRequestId: out.request_id,
          updatedAt: new Date(),
        },
      }
    );
    onEvent?.({
      type: "transcript",
      segmentId: docId.toString(),
      streamId: doc.streamId,
      segmentIndex: doc.segmentIndex,
      text: out.transcript,
      languageCode: out.language_code,
    });
  } catch (err) {
    const message = err?.message || String(err);
    await col.updateOne(
      { _id: docId },
      { $set: { status: "error", error: message, updatedAt: new Date() } }
    );
    onEvent?.({
      type: "transcript_error",
      segmentId: docId.toString(),
      streamId: doc.streamId,
      segmentIndex: doc.segmentIndex,
      message,
    });
  }
}

/**
 * @param {string} userId
 * @param {string} streamId
 */
export async function listVoiceSegmentsForStream(userId, streamId) {
  const col = voiceInputsCol();
  if (!col) return [];
  const docs = await col
    .find(
      { userId, streamId },
      {
        projection: {
          audio: 0,
        },
      }
    )
    .sort({ segmentIndex: 1 })
    .toArray();
  return docs.map((d) => ({
    id: d._id.toString(),
    streamId: d.streamId,
    segmentIndex: d.segmentIndex,
    mimeType: d.mimeType,
    status: d.status,
    transcriptEn: d.transcriptEn,
    languageCode: d.languageCode,
    error: d.error,
    createdAt: d.createdAt?.toISOString?.() ?? null,
    updatedAt: d.updatedAt?.toISOString?.() ?? null,
  }));
}
