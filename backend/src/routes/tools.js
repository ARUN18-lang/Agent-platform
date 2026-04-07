import { Router } from "express";
import { mcpManager } from "../mcp/manager.js";

export const toolsRouter = Router();

// GET /api/tools - list all connected MCP servers and their tools
toolsRouter.get("/", async (req, res) => {
  try {
    await mcpManager.init();
    res.json({
      servers: mcpManager.getServerStatus(),
      integrations: mcpManager.getIntegrationCatalog(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
