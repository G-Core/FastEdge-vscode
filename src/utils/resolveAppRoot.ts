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
 * Walk up from a file (or directory) path to find the per-app debug root.
 *
 * Returns the first directory containing a `.fastedge-debug/` folder, or null
 * if none is found. This is the anchor for per-app identity (.debug-port,
 * app.wasm, config — all inside `.fastedge-debug/`).
 */
export function resolveConfigRoot(startPath: string): string | null {
  let dir = startDir(startPath);

  while (true) {
    try {
      if (fs.statSync(path.join(dir, ".fastedge-debug")).isDirectory()) {
        return dir;
      }
    } catch {
      // .fastedge-debug doesn't exist in this directory — continue walking up
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
 * Ensure the `.fastedge-debug/` directory exists in the given directory.
 *
 * Used when no debug root is found during resolution (the "third-app" case —
 * a project with only a package.json / Cargo.toml and no per-app debug dir yet).
 * Creating the directory establishes the anchor that isolates this app's debug
 * artifacts from others in the same workspace.
 *
 * No-op if the directory already exists (recursive mkdir).
 */
export function ensureDebugDir(dir: string): void {
  const debugPath = path.join(dir, ".fastedge-debug");
  try {
    if (!fs.statSync(debugPath).isDirectory()) {
      throw new Error(
        `Cannot create debug directory: "${debugPath}" already exists as a file. ` +
          "Remove or rename it and try again.",
      );
    }
  } catch (err: unknown) {
    if (err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT") {
      fs.mkdirSync(debugPath, { recursive: true });
    } else {
      throw err;
    }
  }
}
