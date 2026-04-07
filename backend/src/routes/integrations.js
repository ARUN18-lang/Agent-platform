import { Router } from "express";
import { mcpManager } from "../mcp/manager.js";

export const integrationsRouter = Router();

/** GET /api/integrations — public list of integrations (no tool names). */
integrationsRouter.get("/", async (req, res) => {
  try {
    await mcpManager.init();
    const integrations = mcpManager.getPublicIntegrationList();
    const connected = integrations.filter((i) => i.connected).length;
    res.json({ integrations, connectedCount: connected });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
