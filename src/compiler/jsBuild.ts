import { spawn } from "child_process";
import fs from "fs";
import { createRequire } from "module";
import path from "path";

import { DebugContext, LogToDebugConsole } from "../types";
import { resolveConfigRoot, resolveBuildRoot } from "../utils/resolveAppRoot";
import { resolvePackageBin } from "../utils/resolveBin";

const BINARY_NAME = "app.wasm";
const SDK_PACKAGE = "@gcoredev/fastedge-sdk-js";
const BUILD_BIN = "fastedge-build";
const BUILD_CONFIG = path.join(".fastedge", "build-config.js");
// First SDK whose `fastedge-build -c <config> -o <path>` writes to <path>
const CONFIG_OUTPUT_SDK = [2, 7];

/** Whether the project's SDK can build its config into the debug output path. */
const sdkBuildsConfigToOutput = (buildRoot: string) => {
  const require = createRequire(path.join(buildRoot, "package.json"));
  const { version } = JSON.parse(
    fs.readFileSync(require.resolve(`${SDK_PACKAGE}/package.json`), "utf8")
  );
  const [major, minor] = String(version).split(".").map(Number);
  return (
    major > CONFIG_OUTPUT_SDK[0] ||
    (major === CONFIG_OUTPUT_SDK[0] && minor >= CONFIG_OUTPUT_SDK[1])
  );
};

const makeDebugDirectory = (appRoot: string) =>
  new Promise<string>((resolve, reject) => {
    const debugDir = path.join(appRoot, ".fastedge-debug");
    fs.mkdir(debugDir, { recursive: true }, (err) =>
      err ? reject(err) : resolve(debugDir)
    );
  });

const getPackageJsonEntryPoint = (appRoot: string) =>
  new Promise<unknown>((resolve, reject) => {
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
const resolvePackageEntryPoint = (buildRoot: string, mainField: unknown) => {
  if (typeof mainField !== "string" || !mainField.trim()) {
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

      // Launched via process.execPath with an argv array — never a shell.
      // See utils/resolveBin.ts for why npx is not used.
      const buildBin = resolvePackageBin(buildRoot, SDK_PACKAGE, BUILD_BIN);
      const outputPath = `${binPath}/${BINARY_NAME}`;
      const configPath = path.join(buildRoot, BUILD_CONFIG);
      const hasBuildConfig = fs.existsSync(configPath);

      // A workspace build of a project with a build config builds from it, so config-only
      // steps (static asset manifest, Wasm components, its entry point) run.
      let buildArgs: string[];
      if (debugContext !== "file" && hasBuildConfig && sdkBuildsConfigToOutput(buildRoot)) {
        logDebugConsole(`Building from ${BUILD_CONFIG}\n`);
        buildArgs = ["--config", configPath, "--output", outputPath];
      } else {
        const jsEntryPoint =
          debugContext === "file"
            ? activeFilePath
            : resolvePackageEntryPoint(
                buildRoot,
                await getPackageJsonEntryPoint(buildRoot)
              );
        buildArgs = [jsEntryPoint, outputPath];
      }

      const jsBuild = spawn(
        process.execPath,
        [buildBin, ...buildArgs],
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
          const hint =
            debugContext === "file" && hasBuildConfig
              ? `\nThis project has ${BUILD_CONFIG}. To build the project from it, run the ` +
                'workspace build: press F5 with package.json open, or set "entrypoint": ' +
                '"package" in launch.json.'
              : "";
          reject(new Error(`build exited with code ${code}: ${stderr}${hint}`));
          return;
        }
        // A zero exit code is not proof of a binary. fastedge-build reports
        // "Build success!!" and exits 0 while writing nothing when NODE_ENV is
        // set to "test". Without this check the debugger goes on to load a
        // stale binary, or none at all, and the real failure stays invisible.
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
