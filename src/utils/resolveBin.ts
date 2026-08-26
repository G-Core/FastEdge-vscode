import { createRequire } from "node:module";
import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Resolve an npm package's bin script from inside the user's project.
 *
 * Build tools are launched as `process.execPath <binScript> ...` rather than
 * `npx <tool>` through a shell. A shell made workspace-controlled values
 * (package.json `main`, `.cargo/config.toml` target, directory names)
 * executable, and the obvious Windows workaround — spawning `npx.cmd` — is
 * rejected by patched Node with EINVAL (CVE-2024-27980) and re-opens argument
 * injection on unpatched Node.
 *
 * The tool must be a local dependency of the project. Nothing is downloaded:
 * `npx` would fetch a missing package from the registry and execute it, which
 * is neither reproducible nor safe to do on the user's behalf.
 *
 * Note: Yarn Plug'n'Play is unsupported — its dependency map lives in
 * .pnp.cjs, which Node ignores unless preloaded. Supporting it means executing
 * workspace JavaScript before the compiler starts; revisit only if a real
 * project needs it.
 */
export function resolvePackageBin(
  buildRoot: string,
  packageName: string,
  binName: string,
): string {
  const requireFromProject = createRequire(path.join(buildRoot, "package.json"));

  let packageJsonPath: string;
  try {
    packageJsonPath = requireFromProject.resolve(`${packageName}/package.json`);
  } catch {
    throw new Error(
      `${binName} not found in this project. Add "${packageName}" as a development ` +
        `dependency and retry (npm install --save-dev ${packageName}). The extension ` +
        `does not download build tools automatically, and does not support Yarn ` +
        `Plug'n'Play projects.`,
    );
  }

  const { bin } = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  const binRelativePath = typeof bin === "string" ? bin : bin?.[binName];
  if (!binRelativePath) {
    throw new Error(
      `"${packageName}" does not provide a "${binName}" executable. ` +
        `Check the installed version.`,
    );
  }

  return path.resolve(path.dirname(packageJsonPath), binRelativePath);
}
