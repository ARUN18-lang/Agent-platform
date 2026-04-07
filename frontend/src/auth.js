export const AUTH_TOKEN_KEY = "nexus_token";
export const AUTH_EMAIL_KEY = "nexus_user_email";

export function getToken() {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

export function setSession(token, email) {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
  if (email) localStorage.setItem(AUTH_EMAIL_KEY, email);
  localStorage.removeItem("nexus_authenticated");
}

export function clearSession() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_EMAIL_KEY);
  localStorage.removeItem("nexus_authenticated");
}

export function isAuthenticated() {
  return Boolean(getToken()?.trim());
}
