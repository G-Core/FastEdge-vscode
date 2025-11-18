import * as vscode from "vscode";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";

import { DebugContext, LogToDebugConsole } from "../types";

const BINARY_NAME = "debugger.wasm";

const makeBinDirectory = (workspaceFolder: vscode.WorkspaceFolder) =>
  new Promise<string>((resolve, reject) => {
    const vscodeBinDir = path.join(
      workspaceFolder.uri.fsPath,
      ".vscode",
      "bin"
    );
    fs.mkdir(vscodeBinDir, { recursive: true }, (err) =>
      err ? reject(err) : resolve(vscodeBinDir)
    );
  });

const getPackageJsonEntryPoint = (workspaceFolder: vscode.WorkspaceFolder) =>
  new Promise<string>((resolve, reject) => {
    fs.readFile(
      path.join(workspaceFolder.uri.fsPath, "package.json"),
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
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        throw new Error(
          "No workspace folder found! Please open a workspace folder to compile"
        );
      }

      const binPath = await makeBinDirectory(
        workspaceFolder as vscode.WorkspaceFolder
      );

      const jsEntryPoint =
        debugContext === "file"
          ? activeFilePath
          : path.join(
              workspaceFolder?.uri.fsPath,
              await getPackageJsonEntryPoint(workspaceFolder)
            );

      const jsBuild = spawn(
        "npx",
        ["fastedge-build", jsEntryPoint, `${binPath}/${BINARY_NAME}`],
        {
          shell: true,
          stdio: ["ignore", "pipe", "pipe"],
          cwd: workspaceFolder?.uri.fsPath,
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
