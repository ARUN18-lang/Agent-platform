import "dotenv/config";
import express from "express";
import cors from "cors";
import { agentRouter } from "./routes/agent.js";
import { voiceRouter } from "./routes/voice.js";
import { toolsRouter } from "./routes/tools.js";
import { sessionsRouter } from "./routes/sessions.js";
import { authRouter } from "./routes/auth.js";
import { integrationsRouter } from "./routes/integrations.js";
import { exportsRouter } from "./routes/exports.js";
import { requireAuth } from "./middleware/requireAuth.js";
import { connectMongo, closeMongo } from "./db/mongo.js";
import { attachVoiceWebSocket } from "./voice/attachVoiceWebSocket.js";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: process.env.FRONTEND_URL || "http://localhost:5173" }));
app.use(express.json({ limit: "2mb" }));

// Routes (public)
app.use("/api/auth", authRouter);
app.use("/api/integrations", integrationsRouter);

// Protected API
app.use("/api/agent", requireAuth, agentRouter);
app.use("/api/agent/voice", requireAuth, voiceRouter);
app.use("/api/exports", requireAuth, exportsRouter);
app.use("/api/tools", requireAuth, toolsRouter);
app.use("/api/sessions", requireAuth, sessionsRouter);

// Health check
app.get("/health", (_, res) => {
  res.json({ status: "ok", version: "1.0.0", storage: process.env.MONGODB_URI ? "mongo" : "off" });
});

await connectMongo();

const server = app.listen(PORT, () => {
  console.log(`🚀 Agent Platform backend running on http://localhost:${PORT}`);
});

attachVoiceWebSocket(server);

const shutdown = async () => {
  server.close();
  await closeMongo();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
