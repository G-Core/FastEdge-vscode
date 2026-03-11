import { spawn } from "child_process";
import fs from "fs";
import path from "path";

import { DebugContext, LogToDebugConsole } from "../types";
import { resolveAppRoot } from "../utils/resolveAppRoot";

const BINARY_NAME = "debugger.wasm";

const makeBinDirectory = (appRoot: string) =>
  new Promise<string>((resolve, reject) => {
    const fastedgeBinDir = path.join(appRoot, ".fastedge", "bin");
    fs.mkdir(fastedgeBinDir, { recursive: true }, (err) =>
      err ? reject(err) : resolve(fastedgeBinDir)
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
      const appRoot = resolveAppRoot(activeFilePath);
      if (!appRoot) {
        throw new Error(
          "Could not find app root. Ensure your project has a package.json or fastedge-config.test.json."
        );
      }

      const binPath = await makeBinDirectory(appRoot);

      const jsEntryPoint =
        debugContext === "file"
          ? activeFilePath
          : path.join(appRoot, await getPackageJsonEntryPoint(appRoot));

      const jsBuild = spawn(
        "npx",
        ["fastedge-build", jsEntryPoint, `${binPath}/${BINARY_NAME}`],
        {
          shell: true,
          stdio: ["ignore", "pipe", "pipe"],
          cwd: appRoot,
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
