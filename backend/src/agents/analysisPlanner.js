/**
 * Lightweight planner pass before the main agent when tabular uploads + E2B are in play.
 * Produces structured JSON the main model uses to write correct sandbox Python.
 */

import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * @param {Array<{ filename: string, preview: string }>} filePreviews
 * @param {string} userGoal
 * @returns {Promise<string>} human-readable plan block for system prompt
 */
export async function planDataAnalysisWithAttachments(userGoal, filePreviews) {
  if (process.env.AGENT_DATA_PLANNER === "0" || process.env.AGENT_DATA_PLANNER === "false") {
    return "";
  }
  if (!filePreviews?.length || !userGoal?.trim()) return "";

  const model = process.env.AGENT_DATA_PLANNER_MODEL || "gpt-4o-mini";

  const previewBlock = filePreviews
    .map((f) => `### ${f.filename}\n${f.preview}`)
    .join("\n\n");

  const sys = `You are a senior data analyst planning Python work in a disposable Jupyter-style sandbox (pandas, NumPy, matplotlib).
The user attached CSV/tabular files. A separate system message will embed full data as base64 for the main agent — you only see previews.

Reply with ONLY valid JSON (no markdown fence), shape:
{
  "objective": "one sentence",
  "steps": ["ordered step strings"],
  "libraries": ["pandas","numpy"] ,
  "code_sketch": "2-6 lines: must reference UPLOAD_0_B64 from the system message (base64.decode + read_csv), not placeholder CSV or StringIO with fake rows",
  "checks": ["sanity checks or validations"],
  "caveats": "risks, assumptions, or missing columns"
}`;

  try {
    const res = await openai.chat.completions.create({
      model,
      temperature: 0.2,
      max_tokens: 900,
      messages: [
        { role: "system", content: sys },
        {
          role: "user",
          content: `User request:\n${userGoal.trim().slice(0, 4000)}\n\nFile previews (truncated):\n${previewBlock.slice(0, 12000)}`,
        },
      ],
    });
    const raw = res.choices[0]?.message?.content?.trim() || "";
    const jsonStr = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    const parsed = JSON.parse(jsonStr);
    return formatPlanForPrompt(parsed);
  } catch {
    return "";
  }
}

function formatPlanForPrompt(p) {
  if (!p || typeof p !== "object") return "";
  const lines = ["[Data analysis plan — follow before writing e2b__run_code]"];
  if (p.objective) lines.push(`Objective: ${p.objective}`);
  if (Array.isArray(p.steps) && p.steps.length) {
    lines.push("Steps:");
    p.steps.forEach((s, i) => lines.push(`  ${i + 1}. ${s}`));
  }
  if (Array.isArray(p.libraries) && p.libraries.length) {
    lines.push(`Libraries: ${p.libraries.join(", ")}`);
  }
  if (p.code_sketch) lines.push(`Code sketch:\n${p.code_sketch}`);
  if (Array.isArray(p.checks) && p.checks.length) {
    lines.push(`Checks: ${p.checks.join("; ")}`);
  }
  if (p.caveats) lines.push(`Caveats: ${p.caveats}`);
  return `\n\n${lines.join("\n")}`;
}
