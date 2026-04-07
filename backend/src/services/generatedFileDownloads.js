/**
 * Short-lived tokens for downloading PPT/PDF files produced by the presentation MCP
 * (written under the server user's Downloads folder).
 */

import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";

const TTL_MS = 2 * 60 * 60 * 1000;
/** @type {Map<string, { filePath: string, expiresAt: number }>} */
const entries = new Map();

function allowedRoots() {
  const roots = [path.resolve(path.join(os.homedir(), "Downloads"))];
  const extra = process.env.PRESENTATION_DOWNLOAD_ROOT?.trim();
  if (extra) roots.push(path.resolve(extra));
  return roots;
}

function isUnderAllowedRoot(resolvedFile) {
  const file = path.resolve(resolvedFile);
  for (const root of allowedRoots()) {
    const rel = path.relative(root, file);
    if (rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel))) {
      return true;
    }
  }
  return false;
}

function prune() {
  const now = Date.now();
  for (const [id, rec] of entries) {
    if (rec.expiresAt <= now) entries.delete(id);
  }
}

/**
 * @param {string} toolName namespaced tool e.g. ppt__create_structured_deck
 * @param {string} resultText formatted MCP text result
 * @returns {string | null} absolute path on disk
 */
export function extractGeneratedDeckPath(toolName, resultText) {
  if (typeof resultText !== "string") return null;
  if (typeof toolName !== "string" || !toolName.startsWith("ppt__")) return null;

  let m = /Presentation successfully created and saved to:\s*(.+)/i.exec(resultText);
  if (m) return m[1].trim();

  m = /PDF successfully created and saved to:\s*(.+)/i.exec(resultText);
  return m ? m[1].trim() : null;
}

/**
 * @param {string} absolutePath
 * @returns {{ id: string, filename: string, kind: "pptx" | "pdf" } | null}
 */
export function registerDownloadableFile(absolutePath) {
  prune();
  if (!absolutePath || typeof absolutePath !== "string") return null;
  const resolved = path.resolve(absolutePath.trim());
  const lower = resolved.toLowerCase();
  if (!lower.endsWith(".pptx") && !lower.endsWith(".pdf")) return null;
  if (!isUnderAllowedRoot(resolved)) return null;
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) return null;

  const id = crypto.randomBytes(16).toString("hex");
  entries.set(id, { filePath: resolved, expiresAt: Date.now() + TTL_MS });
  const filename = path.basename(resolved);
  const kind = lower.endsWith(".pdf") ? "pdf" : "pptx";
  return { id, filename, kind };
}

/**
 * @param {string} id
 * @returns {{ filePath: string } | null}
 */
export function getRegisteredFile(id) {
  prune();
  if (!id || typeof id !== "string" || !/^[a-f0-9]{32}$/i.test(id)) return null;
  const rec = entries.get(id);
  if (!rec || Date.now() > rec.expiresAt) {
    entries.delete(id);
    return null;
  }
  return { filePath: rec.filePath };
}
