import { spawn } from "child_process";
import fs from "fs";
import path from "path";

import { LogToDebugConsole } from "../types";
import { resolveConfigRoot, resolveBuildRoot } from "../utils/resolveAppRoot";
import { resolvePackageBin } from "../utils/resolveBin";

const BINARY_NAME = "app.wasm";
const AS_PACKAGE = "assemblyscript";
const AS_BIN = "asc";
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
      // Launched via process.execPath with an argv array — never a shell.
      // See utils/resolveBin.ts for why npx is not used.
      const ascBin = resolvePackageBin(buildRoot, AS_PACKAGE, AS_BIN);
      const asBuild = spawn(
        process.execPath,
        [
          ascBin,
          AS_ENTRY_POINT,
          "--target",
          "release",
          "--outFile",
          outFile,
        ],
        {
          stdio: ["ignore", "pipe", "pipe"],
          cwd: buildRoot,
        }
      );

      // Without a shell, a launch failure arrives as "error", not exit code 127.
      asBuild.on("error", (err: Error) =>
        reject(
          new Error(`Failed to start the AssemblyScript compiler: ${err.message}`)
        )
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
        // A zero exit code is not proof of a binary — see the equivalent check
        // in jsBuild.ts. Resolving a path that does not exist sends the
        // debugger off to load a stale binary instead of reporting the failure.
        if (!fs.existsSync(outFile)) {
          reject(
            new Error(
              `The asc build reported success but produced no binary at ${outFile}. ` +
                "Check the build output above for the cause."
            )
          );
          return;
        }
        resolve(outFile);
      });
    } catch (err) {
      reject(err);
    }
  });
}
