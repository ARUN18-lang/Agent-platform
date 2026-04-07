import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";

const TTL_MS = 2 * 60 * 60 * 1000;
/** @type {Map<string, { userId: string, filename: string, mime: string, csvText: string, expiresAt: number }>} */
const store = new Map();

const DISK_ROOT = path.join(os.tmpdir(), "agent-platform-chat-attachments");

function safeUserSegment(userId) {
  return String(userId || "unknown")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 96);
}

function diskPath(userId, id) {
  return path.join(DISK_ROOT, safeUserSegment(userId), `${id}.json`);
}

function prune() {
  const now = Date.now();
  for (const [id, rec] of store) {
    if (rec.expiresAt <= now) store.delete(id);
  }
}

/**
 * @param {string} userId
 * @param {string} id
 */
function readFromDisk(userId, id) {
  try {
    const p = diskPath(userId, id);
    if (!fs.existsSync(p)) return null;
    const raw = fs.readFileSync(p, "utf8");
    const rec = JSON.parse(raw);
    if (!rec || typeof rec !== "object") return null;
    if (typeof rec.expiresAt !== "number" || rec.expiresAt <= Date.now()) {
      try {
        fs.unlinkSync(p);
      } catch {
        /* ignore */
      }
      return null;
    }
    if (String(rec.userId) !== String(userId)) return null;
    return rec;
  } catch {
    return null;
  }
}

/**
 * @param {string} id
 * @param {{ userId: string, filename: string, mime: string, csvText: string, expiresAt: number }} rec
 */
function writeToDisk(id, rec) {
  try {
    const dir = path.dirname(diskPath(rec.userId, id));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(diskPath(rec.userId, id), JSON.stringify(rec), "utf8");
  } catch (e) {
    console.error("[chatAttachmentStore] disk write failed:", e?.message || e);
  }
}

/**
 * @param {{ userId: string, filename: string, mime: string, csvText: string }} row
 * @returns {string} attachment id
 */
export function saveChatAttachment(row) {
  prune();
  const id = crypto.randomBytes(14).toString("hex");
  const userId = String(row.userId || "");
  const rec = {
    userId,
    filename: row.filename,
    mime: row.mime,
    csvText: row.csvText,
    expiresAt: Date.now() + TTL_MS,
  };
  store.set(id, rec);
  writeToDisk(id, rec);
  return id;
}

/**
 * @param {string} userId
 * @param {string[]} ids
 * @returns {Array<{ id: string, filename: string, mime: string, csvText: string }>}
 */
export function resolveChatAttachments(userId, ids) {
  prune();
  const uid = String(userId || "");
  if (!uid || !Array.isArray(ids) || ids.length === 0) return [];

  const out = [];
  for (const id of ids) {
    if (typeof id !== "string" || !/^[a-f0-9]{28}$/i.test(id)) continue;

    let rec = store.get(id);
    if (rec && String(rec.userId) !== uid) rec = null;
    if (!rec) rec = readFromDisk(uid, id);

    if (!rec || String(rec.userId) !== uid) continue;

    if (rec.expiresAt <= Date.now()) {
      store.delete(id);
      try {
        fs.unlinkSync(diskPath(uid, id));
      } catch {
        /* ignore */
      }
      continue;
    }

    store.set(id, rec);

    out.push({
      id,
      filename: rec.filename,
      mime: rec.mime,
      csvText: rec.csvText,
    });
  }
  return out;
}
