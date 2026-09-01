import { defineConfig } from "vitest/config";
import { readFileSync } from "fs";
import { join } from "path";

// Mirror the esbuild define so tests see the same injected constant.
const mcpServerVersion = readFileSync(
  join(__dirname, "mcp-server.version"),
  "utf8",
).trim();

export default defineConfig({
  define: {
    __MCP_SERVER_VERSION__: JSON.stringify(mcpServerVersion),
  },
});
