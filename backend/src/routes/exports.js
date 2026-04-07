import { Router } from "express";
import fs from "fs";
import path from "path";
import { getRegisteredFile } from "../services/generatedFileDownloads.js";

export const exportsRouter = Router();

/**
 * GET /api/exports/:id
 * Streams a registered presentation export (pptx/pdf). Requires same auth as chat.
 */
exportsRouter.get("/:id", (req, res) => {
  const rec = getRegisteredFile(req.params.id);
  if (!rec) {
    return res.status(404).json({ error: "Download link expired or invalid." });
  }
  const { filePath } = rec;
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return res.status(404).json({ error: "File is no longer available on the server." });
  }

  const filename = path.basename(filePath);
  const lower = filename.toLowerCase();
  const mime = lower.endsWith(".pdf")
    ? "application/pdf"
    : "application/vnd.openxmlformats-officedocument.presentationml.presentation";

  const asciiFallback = filename.replace(/[^\x20-\x7E]/g, "_");
  res.setHeader("Content-Type", mime);
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`
  );

  const stream = fs.createReadStream(filePath);
  stream.on("error", () => {
    if (!res.headersSent) res.status(500).end();
  });
  stream.pipe(res);
});
