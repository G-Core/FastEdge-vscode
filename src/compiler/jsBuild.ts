import { spawn } from "child_process";
import fs from "fs";
import path from "path";

import { DebugContext, LogToDebugConsole } from "../types";
import { resolveConfigRoot, resolveBuildRoot } from "../utils/resolveAppRoot";

const BINARY_NAME = "app.wasm";

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
          : path.join(buildRoot, await getPackageJsonEntryPoint(buildRoot));

      const jsBuild = spawn(
        "npx",
        ["fastedge-build", jsEntryPoint, `${binPath}/${BINARY_NAME}`],
        {
          shell: true,
          stdio: ["ignore", "pipe", "pipe"],
          cwd: buildRoot,
        }
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
        resolve(`${binPath}/${BINARY_NAME}`);
      });
    } catch (err) {
      reject(err);
    }
  });
}
