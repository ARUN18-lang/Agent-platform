#!/usr/bin/env node
/**
 * Downloads the standalone yt-dlp binary into yt-dlp-exec's bin/ folder.
 * The @mrsknetwork/ytmcp dependency uses yt-dlp-exec, whose postinstall is often
 * skipped (--ignore-scripts) or fails (python preinstall). Run after npm install:
 *   npm run yt-dlp:fetch
 */
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, "..");
const binDir = path.join(backendRoot, "node_modules", "yt-dlp-exec", "bin");
const binPath = path.join(binDir, "yt-dlp");

const RELEASES_URL = "https://api.github.com/repos/yt-dlp/yt-dlp/releases?per_page=1";

async function main() {
  try {
    await fs.access(binPath);
    const st = await fs.stat(binPath);
    if (st.size > 1000) {
      console.log("yt-dlp already present:", binPath);
      return;
    }
  } catch {
    /* fetch */
  }

  const metaRes = await fetch(RELEASES_URL, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "agent-platform-yt-dlp-fetch" },
  });
  if (!metaRes.ok) {
    throw new Error(`GitHub API ${metaRes.status}: ${await metaRes.text()}`);
  }
  const [release] = await metaRes.json();
  const asset = release.assets?.find((a) => a.name === "yt-dlp");
  if (!asset?.browser_download_url) {
    throw new Error('No release asset named "yt-dlp" found');
  }

  const binRes = await fetch(asset.browser_download_url, {
    headers: { "User-Agent": "agent-platform-yt-dlp-fetch" },
  });
  if (!binRes.ok) {
    throw new Error(`Download failed ${binRes.status}`);
  }
  const buffer = Buffer.from(await binRes.arrayBuffer());

  await fs.mkdir(binDir, { recursive: true });
  await fs.writeFile(binPath, buffer, { mode: 0o755 });
  console.log("Installed yt-dlp →", binPath);
}

main().catch((err) => {
  console.error("fetch-yt-dlp:", err.message || err);
  process.exit(1);
});
