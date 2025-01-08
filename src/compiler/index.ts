import * as vscode from "vscode";

import { compileJavascriptBinary } from "./jsBuild";
import { compileRustAndFindBinary } from "./rustBuild";

import {
  BinaryInfo,
  DebugContext,
  ExtLanguage,
  LogToDebugConsole,
} from "./types";

function getActiveFileLanguage(): ExtLanguage | null {
  const languageId = vscode.window.activeTextEditor?.document.languageId ?? "";
  const javascriptLanguageIds = [
    "javascript",
    "typescript",
    "javascriptreact",
    "typescriptreact",
  ];
  if (javascriptLanguageIds.includes(languageId)) {
    return "javascript";
  } else if (languageId === "rust") {
    return "rust";
  }
  return null;
}

async function compileActiveEditorsBinary(
  debugContext: DebugContext = "file",
  logDebugConsole: LogToDebugConsole
): Promise<BinaryInfo> {
  const activeFile =
    debugContext === "workspace"
      ? vscode.workspace?.workspaceFolders?.[0].uri.fsPath + "/"
      : vscode.window.activeTextEditor?.document.uri.fsPath;

  const activeFileLanguage = getActiveFileLanguage();
  if (!activeFile || !activeFileLanguage) {
    // return an error.. need to have a rust or javascript file selected
    throw new Error(
      "No active file or language detected is incorrect! Only Rust or Javascript files are supported"
    );
  }

  if (activeFileLanguage === "javascript") {
    return {
      path: await compileJavascriptBinary(activeFile, debugContext),
      lang: activeFileLanguage,
    };
  } else if (activeFileLanguage === "rust") {
    const activeFilePath = activeFile?.slice(0, activeFile?.lastIndexOf("/"));
    return {
      path: await compileRustAndFindBinary(activeFilePath, logDebugConsole),
      lang: activeFileLanguage,
    };
  }
  throw new Error(
    "Invalid language, only Rust or Javascript files are supported"
  );
}

export { compileActiveEditorsBinary };
export type { BinaryInfo, DebugContext, ExtLanguage };
