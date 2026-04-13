/**
 * Sarvam Speech-to-Text-Translate: audio → English transcript.
 * @see https://docs.sarvam.ai/api-reference-docs/speech-to-text-translate/translate
 */

const SARVAM_URL = "https://api.sarvam.ai/speech-to-text-translate";

/**
 * Resolve subscription key from env (dashboard → API Keys).
 * Supports SARVAM_API_SUBSCRIPTION_KEY or SARVAM_API_KEY; strips wrapping quotes.
 * @returns {string | null}
 */
function getSarvamSubscriptionKey() {
  const raw =
    process.env.SARVAM_API_SUBSCRIPTION_KEY?.trim() ||
    process.env.SARVAM_API_KEY?.trim() ||
    "";
  if (!raw) return null;
  const unquoted = raw.replace(/^["']|["']$/g, "").trim();
  return unquoted || null;
}

/**
 * Sarvam only allows bare types (e.g. audio/webm), not parameters like codecs=opus.
 * @param {string} [mimeType]
 */
function normalizeMimeForSarvam(mimeType) {
  const raw = typeof mimeType === "string" ? mimeType.trim() : "";
  const base = raw.split(";")[0].trim().toLowerCase();
  if (base === "video/webm") return "audio/webm";
  return base || "application/octet-stream";
}

function extensionForMime(mime) {
  const m = normalizeMimeForSarvam(mime);
  if (m.includes("webm")) return "webm";
  if (m.includes("mp4") || m.includes("m4a")) return "m4a";
  if (m.includes("wav")) return "wav";
  if (m.includes("mpeg") || m.includes("mp3")) return "mp3";
  if (m.includes("ogg")) return "ogg";
  return "webm";
}

/**
 * @param {Buffer} buffer
 * @param {string} [mimeType]
 * @returns {Promise<{ transcript: string, language_code: string | null, request_id: string | null }>}
 */
export async function sarvamSpeechToEnglish(buffer, mimeType = "audio/webm") {
  const key = getSarvamSubscriptionKey();
  if (!key) {
    throw new Error(
      "Sarvam API key is not configured — set SARVAM_API_SUBSCRIPTION_KEY or SARVAM_API_KEY in backend/.env (from https://dashboard.sarvam.ai/ → API Keys)."
    );
  }
  if (!buffer?.length) {
    throw new Error("Empty audio");
  }

  const mime = normalizeMimeForSarvam(mimeType);
  const ext = extensionForMime(mime);
  const filename = `voice.${ext}`;
  const blob = new Blob([buffer], { type: mime });
  const form = new FormData();
  form.append("file", blob, filename);

  const res = await fetch(SARVAM_URL, {
    method: "POST",
    headers: { "api-subscription-key": key },
    body: form,
  });

  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Sarvam returned non-JSON (${res.status}): ${text.slice(0, 200)}`);
  }

  if (!res.ok) {
    const code = json?.error?.code;
    let msg = json?.error?.message || json?.message || text.slice(0, 300) || `HTTP ${res.status}`;
    if (code === "invalid_api_key_error" || code === "authentication_error") {
      msg += " — Use the subscription key from Sarvam Dashboard (API Keys), in backend/.env as SARVAM_API_SUBSCRIPTION_KEY. Restart the server after editing .env.";
    }
    throw new Error(msg);
  }

  const transcript = typeof json.transcript === "string" ? json.transcript.trim() : "";
  return {
    transcript,
    language_code: json.language_code ?? null,
    request_id: json.request_id ?? null,
  };
}
