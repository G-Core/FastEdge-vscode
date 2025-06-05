import * as fs from "node:fs";
import * as path from "node:path";
import * as toml from "toml";
import { LogToDebugConsole } from "../types";

function findCargoConfig(startDir: string): string | null {
  let dir = startDir;
  while (dir !== path.parse(dir).root) {
    const configPath = path.join(dir, ".cargo", "config.toml");
    if (fs.existsSync(configPath)) {
      return configPath;
    }
    dir = path.dirname(dir);
  }
  return null;
}

function rustConfigWasiTarget(
  logDebugConsole: LogToDebugConsole,
  startDir: string
): string {
  let wasiTarget = "wasm32-wasip1";
  try {
    const configPath = findCargoConfig(startDir);
    if (configPath === null) {
      throw new Error("No .cargo/config.toml found");
    }
    const configContent = fs.readFileSync(configPath, "utf-8");
    const config = toml.parse(configContent);
    if (config?.build?.target) {
      wasiTarget = config.build.target;
    }
  } catch (error) {
    logDebugConsole(
      `Failed to read or parse config.toml (fallback target: ${wasiTarget})\n`,
      "stderr"
    );
  } finally {
    return wasiTarget;
  }
}

export { rustConfigWasiTarget };
