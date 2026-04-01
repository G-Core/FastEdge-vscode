import { spawn } from "child_process";
import fs from "fs";
import path from "path";

import { LogToDebugConsole } from "../types";
import { resolveConfigRoot, resolveBuildRoot } from "../utils/resolveAppRoot";

const BINARY_NAME = "app.wasm";
const AS_ENTRY_POINT = path.join("assembly", "index.ts");

const makeDebugDirectory = (appRoot: string) =>
  new Promise<string>((resolve, reject) => {
    const debugDir = path.join(appRoot, ".fastedge-debug");
    fs.mkdir(debugDir, { recursive: true }, (err) =>
      err ? reject(err) : resolve(debugDir)
    );
  });

export function compileAssemblyScriptBinary(
  activeFilePath: string,
  logDebugConsole: LogToDebugConsole
) {
  logDebugConsole("Compiling AssemblyScript binary...\n");
  return new Promise<string>(async (resolve, reject) => {
    try {
      const buildRoot = resolveBuildRoot(activeFilePath);
      if (!buildRoot) {
        throw new Error(
          "Could not find app root. Ensure your project has a package.json."
        );
      }

      if (!fs.existsSync(path.join(buildRoot, "asconfig.json"))) {
        throw new Error(
          "asconfig.json not found. Ensure this is an AssemblyScript project."
        );
      }

      // WASM output goes to configRoot (= WORKSPACE_PATH) so the debugger server
      // can serve it. Falls back to buildRoot when no .fastedge-debug/ dir
      // exists (caller should have created it, but guard defensively).
      const configRoot = resolveConfigRoot(activeFilePath) ?? buildRoot;
      const binPath = await makeDebugDirectory(configRoot);
      const outFile = path.join(binPath, BINARY_NAME);

      // Use --target release to pick up optimisation settings from asconfig.json,
      // but override --outFile to route output to the standard debugger location.
      const asBuild = spawn(
        "npx",
        ["asc", AS_ENTRY_POINT, "--target", "release", "--outFile", outFile],
        {
          shell: true,
          stdio: ["ignore", "pipe", "pipe"],
          cwd: buildRoot,
        }
      );

      let stderr = "";

      asBuild.stdout?.on("data", (data: Buffer) => {
        logDebugConsole(data.toString());
      });

      asBuild.stderr?.on("data", (data: Buffer) => {
        stderr += data;
      });

      asBuild.on("close", (code: number) => {
        if (code !== 0) {
          reject(new Error(`asc build exited with code ${code}: ${stderr}`));
          return;
        }
        resolve(outFile);
      });
    } catch (err) {
      reject(err);
    }
  });
}
