import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { ObjectId } from "mongodb";
import { getDb } from "../db/mongo.js";

export const authRouter = Router();

const SALT_ROUNDS = 12;
const JWT_DEFAULT_EXPIRES = "7d";

function jwtSecret() {
  return process.env.JWT_SECRET?.trim() || "";
}

function normalizeEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function authConfigured(res) {
  const db = getDb();
  if (!db) {
    res.status(503).json({ error: "Database is not configured. Set MONGODB_URI in backend/.env." });
    return false;
  }
  if (!jwtSecret()) {
    res.status(503).json({ error: "JWT_SECRET is not set on the server." });
    return false;
  }
  return true;
}

function issueToken(user) {
  const secret = jwtSecret();
  const expiresIn = process.env.JWT_EXPIRES_IN?.trim() || JWT_DEFAULT_EXPIRES;
  return jwt.sign(
    { sub: user._id.toString(), email: user.email },
    secret,
    { expiresIn }
  );
}

/** POST /api/auth/register */
authRouter.post("/register", async (req, res) => {
  if (!authConfigured(res)) return;

  const email = normalizeEmail(req.body?.email);
  const password = req.body?.password;

  if (!email || !EMAIL_RE.test(email)) {
    return res.status(400).json({ error: "Valid email is required." });
  }
  if (typeof password !== "string" || password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters." });
  }

  const db = getDb();
  const users = db.collection("users");
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const createdAt = new Date();

  try {
    const r = await users.insertOne({ email, passwordHash, createdAt });
    const user = { _id: r.insertedId, email };
    const token = issueToken(user);
    return res.status(201).json({
      token,
      user: { id: user._id.toString(), email: user.email },
    });
  } catch (e) {
    if (e.code === 11000) {
      return res.status(409).json({ error: "An account with this email already exists." });
    }
    console.error("[auth] register", e);
    return res.status(500).json({ error: "Could not create account." });
  }
});

/** POST /api/auth/login */
authRouter.post("/login", async (req, res) => {
  if (!authConfigured(res)) return;

  const email = normalizeEmail(req.body?.email);
  const password = req.body?.password;

  if (!email || typeof password !== "string") {
    return res.status(400).json({ error: "Email and password are required." });
  }

  const db = getDb();
  const user = await db.collection("users").findOne({ email });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ error: "Invalid email or password." });
  }

  const token = issueToken(user);
  return res.json({
    token,
    user: { id: user._id.toString(), email: user.email },
  });
});

/** GET /api/auth/me */
authRouter.get("/me", async (req, res) => {
  if (!authConfigured(res)) return;

  const h = req.headers.authorization;
  if (!h?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const token = h.slice(7).trim();
  try {
    const payload = jwt.verify(token, jwtSecret());
    const id = payload.sub;
    if (!id || !ObjectId.isValid(id)) {
      return res.status(401).json({ error: "Invalid token" });
    }
    const db = getDb();
    const user = await db.collection("users").findOne(
      { _id: new ObjectId(id) },
      { projection: { passwordHash: 0 } }
    );
    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }
    return res.json({ user: { id: user._id.toString(), email: user.email, createdAt: user.createdAt } });
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
});
