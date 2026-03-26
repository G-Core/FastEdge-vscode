import * as fs from "fs";
import * as path from "path";

function startDir(startPath: string): string {
  try {
    return fs.statSync(startPath).isDirectory() ? startPath : path.dirname(startPath);
  } catch {
    return path.dirname(startPath);
  }
}

/**
 * Walk up from a file (or directory) path to find the per-app config root.
 *
 * Returns the first directory containing `fastedge-config.test.json`, or null
 * if none is found. This is the anchor for per-app identity (.debug-port sidecar,
 * WORKSPACE_PATH passed to the debugger server).
 */
export function resolveConfigRoot(startPath: string): string | null {
  let dir = startDir(startPath);

  while (true) {
    if (fs.existsSync(path.join(dir, "fastedge-config.test.json"))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * Walk up from a file (or directory) path to find the build root.
 *
 * Returns the first directory containing `package.json` or `Cargo.toml`.
 * This is where build commands (e.g. fastedge-build) must be run.
 * Returns null only if no build manifest is found up to the filesystem root.
 */
export function resolveBuildRoot(startPath: string): string | null {
  let dir = startDir(startPath);

  while (true) {
    if (
      fs.existsSync(path.join(dir, "package.json")) ||
      fs.existsSync(path.join(dir, "Cargo.toml"))
    ) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * Ensure a minimal `fastedge-config.test.json` exists in the given directory.
 *
 * Used when no config file is found during root resolution (the "third-app" case —
 * a project with only a package.json / Cargo.toml and no per-app config yet).
 * Writing `{}` creates the anchor that isolates this app's debug port from others
 * in the same workspace without making any assumptions about app configuration.
 *
 * No-op if the file already exists.
 */
export function ensureConfigFile(dir: string): void {
  const configPath = path.join(dir, "fastedge-config.test.json");
  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, "{}", "utf8");
  }
}
