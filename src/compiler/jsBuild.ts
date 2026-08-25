import { spawn } from "child_process";
import fs from "fs";
import path from "path";

import { DebugContext, LogToDebugConsole } from "../types";
import { resolveConfigRoot, resolveBuildRoot } from "../utils/resolveAppRoot";
import { resolvePackageBin } from "../utils/resolveBin";

const BINARY_NAME = "app.wasm";
const SDK_PACKAGE = "@gcoredev/fastedge-sdk-js";
const BUILD_BIN = "fastedge-build";

const makeDebugDirectory = (appRoot: string) =>
  new Promise<string>((resolve, reject) => {
    const debugDir = path.join(appRoot, ".fastedge-debug");
    fs.mkdir(debugDir, { recursive: true }, (err) =>
      err ? reject(err) : resolve(debugDir)
    );
  });

const getPackageJsonEntryPoint = (appRoot: string) =>
  new Promise<string>((resolve, reject) => {
    fs.readFile(
      path.join(appRoot, "package.json"),
      "utf8",
      (err, data) => {
        if (err) {
          reject(err);
        } else {
          try {
            const packageJson = JSON.parse(data);
            resolve(packageJson.main ?? "");
          } catch (err) {
            reject(err);
          }
        }
      }
    );
  });

/**
 * Resolve the `main` field of the project's package.json to an entry point
 * inside the build root.
 *
 * `main` is workspace-controlled, so it is a trust boundary: reject values that
 * escape the project (absolute paths, `../` traversal) rather than pointing the
 * compiler at arbitrary files on the developer's machine.
 */
const resolvePackageEntryPoint = (buildRoot: string, mainField: string) => {
  if (!mainField.trim()) {
    throw new Error(
      'No "main" entry point found in package.json. Add a "main" field pointing at your app entry file.',
    );
  }

  const entryPoint = path.resolve(buildRoot, mainField);
  const relative = path.relative(buildRoot, entryPoint);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(
      `The "main" field in package.json ("${mainField}") resolves outside the project. ` +
        "Use a path inside the project directory.",
    );
  }
  return entryPoint;
};

export function compileJavascriptBinary(
  activeFilePath: string,
  debugContext: DebugContext,
  logDebugConsole: LogToDebugConsole
) {
  logDebugConsole("Compiling javascript binary...\n");
  return new Promise<string>(async (resolve, reject) => {
    try {
      const buildRoot = resolveBuildRoot(activeFilePath);
      if (!buildRoot) {
        throw new Error(
          "Could not find app root. Ensure your project has a package.json."
        );
      }

      // WASM output goes to configRoot (= WORKSPACE_PATH) so the debugger server
      // can serve it. Falls back to buildRoot when no .fastedge-debug/ dir
      // exists (caller should have created it, but guard defensively).
      const configRoot = resolveConfigRoot(activeFilePath) ?? buildRoot;
      const binPath = await makeDebugDirectory(configRoot);

      const jsEntryPoint =
        debugContext === "file"
          ? activeFilePath
          : resolvePackageEntryPoint(
              buildRoot,
              await getPackageJsonEntryPoint(buildRoot)
            );

      // Launched via process.execPath with an argv array — never a shell.
      // See utils/resolveBin.ts for why npx is not used.
      const buildBin = resolvePackageBin(buildRoot, SDK_PACKAGE, BUILD_BIN);
      const jsBuild = spawn(
        process.execPath,
        [buildBin, jsEntryPoint, `${binPath}/${BINARY_NAME}`],
        {
          stdio: ["ignore", "pipe", "pipe"],
          cwd: buildRoot,
        }
      );

      // Without a shell, a launch failure arrives as "error", not exit code 127.
      jsBuild.on("error", (err: Error) =>
        reject(new Error(`Failed to start the FastEdge build: ${err.message}`))
      );

      let stdout = "";
      let stderr = "";

      jsBuild.stdout?.on("data", (data: Buffer) => {
        logDebugConsole(data.toString());
        stdout += data;
      });

      jsBuild.stderr?.on("data", (data: Buffer) => {
        stderr += data;
      });

      jsBuild.on("close", (code: number) => {
        if (code !== 0) {
          reject(new Error(`build exited with code ${code}: ${stderr}`));
          return;
        }
        // A zero exit code is not proof of a binary. fastedge-build reports
        // "Build success!!" and exits 0 while writing nothing when NODE_ENV is
        // set to "test". Without this check the debugger goes on to load a
        // stale binary, or none at all, and the real failure stays invisible.
        const outputPath = `${binPath}/${BINARY_NAME}`;
        if (!fs.existsSync(outputPath)) {
          reject(
            new Error(
              `The build reported success but produced no binary at ${outputPath}. ` +
                (process.env.NODE_ENV === "test"
                  ? 'NODE_ENV is set to "test", which makes fastedge-build skip the build silently. Unset it and retry.'
                  : "Check the build output above for the cause.")
            )
          );
          return;
        }
        resolve(outputPath);
      });
    } catch (err) {
      reject(err);
    }
  });
}
