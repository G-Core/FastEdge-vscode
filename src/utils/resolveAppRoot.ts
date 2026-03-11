import * as fs from "fs";
import * as path from "path";

/**
 * Walk up from a file (or directory) path to find the app root.
 *
 * Priority at each directory level (all three are checked before moving up):
 *   1. test-config.json  — FastEdge-specific, always at app root
 *   2. package.json      — JS app root
 *   3. Cargo.toml        — Rust app root
 *
 * Returns the first directory where any marker is found, or null if none found.
 */
export function resolveAppRoot(startPath: string): string | null {
  let dir: string;
  try {
    dir = fs.statSync(startPath).isDirectory()
      ? startPath
      : path.dirname(startPath);
  } catch {
    dir = path.dirname(startPath);
  }

  const markers = ["test-config.json", "package.json", "Cargo.toml"];

  while (true) {
    for (const marker of markers) {
      if (fs.existsSync(path.join(dir, marker))) {
        return dir;
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      // Reached filesystem root without finding a marker
      return null;
    }
    dir = parent;
  }
}
