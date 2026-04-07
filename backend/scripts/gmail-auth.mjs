/**
 * Run Gmail MCP interactive OAuth using vars from backend/.env.
 * Usage: npm run gmail:auth  (from backend/)
 */
import { config } from "dotenv";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import path from "path";

const __dir = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dir, "..", ".env") });

const env = { ...process.env };
if (env.GMAIL_AUTH_PORT && !env.AUTH_SERVER_PORT) {
  env.AUTH_SERVER_PORT = env.GMAIL_AUTH_PORT;
}

const child = spawn("npx", ["-y", "@shinzolabs/gmail-mcp", "auth"], {
  stdio: "inherit",
  env,
  shell: true,
});

child.on("exit", (code) => process.exit(code ?? 1));
