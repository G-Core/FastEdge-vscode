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

function findCargoToml(startDir: string): string | null {
  let dir = startDir;
  while (dir !== path.parse(dir).root) {
    const cargoPath = path.join(dir, "Cargo.toml");
    if (fs.existsSync(cargoPath)) {
      return cargoPath;
    }
    dir = path.dirname(dir);
  }
  return null;
}

function rustConfigWasiTarget(
  logDebugConsole: LogToDebugConsole,
  startDir: string
): string {
  // Explicit `.cargo/config.toml` `[build] target = ...` wins.
  const configPath = findCargoConfig(startDir);
  try {
    if (configPath !== null) {
      const configContent = fs.readFileSync(configPath, "utf-8");
      const config = toml.parse(configContent);
      if (config?.build?.target) {
        return config.build.target;
      }
    }
  } catch (error) {
    logDebugConsole(
      `Failed to read or parse .cargo/config.toml${configPath ? ` (${configPath})` : ""}: ${(error as Error).message}\n`,
      "stderr"
    );
  }

  // Otherwise infer from `Cargo.toml` `[dependencies]`: wstd → wasip2, else wasip1.
  let wasiTarget = "wasm32-wasip1";
  const cargoTomlPath = findCargoToml(startDir);
  try {
    if (cargoTomlPath !== null) {
      const cargoContent = fs.readFileSync(cargoTomlPath, "utf-8");
      const cargo = toml.parse(cargoContent);
      if (cargo?.dependencies && "wstd" in cargo.dependencies) {
        wasiTarget = "wasm32-wasip2";
      }
    }
  } catch (error) {
    logDebugConsole(
      `Failed to read or parse Cargo.toml${cargoTomlPath ? ` (${cargoTomlPath})` : ""}: ${(error as Error).message} (fallback target: ${wasiTarget})\n`,
      "stderr"
    );
  }
  return wasiTarget;
}

export { rustConfigWasiTarget };
