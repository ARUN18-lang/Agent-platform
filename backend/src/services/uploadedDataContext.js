import { Buffer } from "node:buffer";

/**
 * Build instructions + base64 payloads so the LLM can paste into e2b__run_code.
 * @param {Array<{ filename: string, csvText: string }>} attachments
 * @returns {string} suffix for system prompt
 */
export function buildUploadedDataContext(attachments) {
  if (!attachments?.length) return "";

  const maxRaw = Math.max(
    4096,
    Math.min(450_000, parseInt(process.env.AGENT_UPLOAD_MAX_CSV_CHARS || "320000", 10) || 320000)
  );

  const parts = [
    "\n\n[Uploaded tabular data — user attached file(s). You MUST use e2b__run_code with Python.]",
    "Each file is UTF-8 CSV (Excel was converted to CSV using the first sheet only).",
    "",
    "NON-NEGOTIABLE — The e2b__run_code `code` string MUST include the FULL assignments below exactly as written (UPLOAD_0_B64 = \"\"\"<long base64>\"\"\", etc.).",
    "That base64 is the user's real file. Do NOT replace it with hand-typed CSV, toy examples (e.g. AAPL/GOOGL rows), StringIO(literal_csv), or any “placeholder”.",
    "Do NOT assign plain CSV text to a variable whose name suggests base64. If you skip or shorten the base64, the analysis is wrong.",
    "",
    "After pasting those assignments, decode with base64.standard_b64decode(UPLOAD_0_B64) and pd.read_csv(io.BytesIO(...)). Use df0, df1, … per file.",
    "",
  ];

  attachments.forEach((a, i) => {
    let text = a.csvText || "";
    let truncated = false;
    if (text.length > maxRaw) {
      text = text.slice(0, maxRaw);
      truncated = true;
    }
    const b64 = Buffer.from(text, "utf8").toString("base64");
    parts.push(`--- File ${i + 1}: ${a.filename}${truncated ? ` (truncated to ${maxRaw} characters for context — state this in your reply if it affects analysis)` : ""} ---`);
    parts.push(`UPLOAD_${i}_B64 = """${b64}"""`);
    parts.push("");
  });

  parts.push("Skeleton after the pasted UPLOAD_*_B64 lines (you add analysis below):");
  parts.push("import base64, io, pandas as pd");
  parts.push("# UPLOAD_*_B64 already defined above — copy them into this cell verbatim; never substitute fake data.");
  parts.push("df0 = pd.read_csv(io.BytesIO(base64.standard_b64decode(UPLOAD_0_B64)))");
  if (attachments.length > 1) {
    parts.push("# df1 from UPLOAD_1_B64, etc.");
  }

  return parts.join("\n");
}

/**
 * Short previews for the planner model (no base64).
 * @param {Array<{ filename: string, csvText: string }>} attachments
 * @returns {Array<{ filename: string, preview: string }>}
 */
export function buildFilePreviewsForPlanner(attachments, maxPreviewChars = 8000) {
  return (attachments || []).map((a) => {
    const t = a.csvText || "";
    const slice = t.slice(0, maxPreviewChars);
    const more = t.length > maxPreviewChars ? `\n… (${t.length - maxPreviewChars} more characters in full upload)` : "";
    return { filename: a.filename, preview: slice + more };
  });
}
