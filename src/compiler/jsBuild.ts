import * as vscode from "vscode";
import { exec } from "child_process";
import fs from "fs";
import path from "path";

import { DebugContext } from "./types";

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
  debugContext: DebugContext
) {
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

      exec(
        `npx fastedge-build ${jsEntryPoint} ${binPath}/${BINARY_NAME}`,
        { cwd: workspaceFolder?.uri.fsPath },
        (err) => {
          return err ? reject(err) : resolve(`${binPath}/${BINARY_NAME}`);
        }
      );
    } catch (err) {
      reject(err);
    }
  });
}
