import { getToken } from "./auth.js";

export function authHeaders() {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

export async function fetchJson(url, options = {}) {
  const headers = { ...(options.headers || {}), ...authHeaders() };
  if (options.body && typeof options.body === "string" && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  const r = await fetch(url, { ...options, headers });
  const text = await r.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!r.ok) {
    const msg = data?.error || r.statusText || `Request failed (${r.status})`;
    throw new Error(msg);
  }
  return data;
}
