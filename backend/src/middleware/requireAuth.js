import jwt from "jsonwebtoken";

function jwtSecret() {
  return process.env.JWT_SECRET?.trim() || "";
}

/**
 * Express middleware: Bearer JWT required. Sets req.user = { id, email }.
 */
export function requireAuth(req, res, next) {
  const secret = jwtSecret();
  if (!secret) {
    return res.status(503).json({ error: "Server auth is not configured (JWT_SECRET)." });
  }
  const h = req.headers.authorization;
  if (!h || !h.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const token = h.slice(7).trim();
  if (!token) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const payload = jwt.verify(token, secret);
    const id = payload.sub;
    const email = payload.email;
    if (!id || !email) {
      return res.status(401).json({ error: "Invalid token" });
    }
    req.user = { id, email };
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}
