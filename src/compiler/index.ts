import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";

import { compileAssemblyScriptBinary } from "./asBuild";
import { compileJavascriptBinary } from "./jsBuild";
import { compileRustAndFindBinary } from "./rustBuild";
import { resolveBuildRoot } from "../utils/resolveAppRoot";

import {
  BinaryInfo,
  DebugContext,
  ExtLanguage,
  LogToDebugConsole,
} from "../types";

function getActiveFileLanguage(activeFile: string): ExtLanguage | null {
  const languageId = vscode.window.activeTextEditor?.document.languageId ?? "";
  const javascriptLanguageIds = [
    "javascript",
    "typescript",
    "javascriptreact",
    "typescriptreact",
  ];
  if (javascriptLanguageIds.includes(languageId)) {
    // AssemblyScript files are reported as "typescript" by VSCode.
    // Distinguish by checking for asconfig.json at the build root.
    const buildRoot = resolveBuildRoot(activeFile);
    if (buildRoot && fs.existsSync(path.join(buildRoot, "asconfig.json"))) {
      return "assemblyscript";
    }
    return "javascript";
  } else if (languageId === "rust") {
    return "rust";
  }
  return null;
}

/**
 * Detect the project language from the build manifest rather than the active
 * editor's language. Used for "workspace" / "package entry" builds where the
 * active file may be any type (README, JSON, etc.).
 */
function getProjectLanguage(activeFile: string): ExtLanguage | null {
  const buildRoot = resolveBuildRoot(activeFile);
  if (!buildRoot) return null;

  if (fs.existsSync(path.join(buildRoot, "Cargo.toml"))) {
    return "rust";
  }
  if (fs.existsSync(path.join(buildRoot, "asconfig.json"))) {
    return "assemblyscript";
  }
  if (fs.existsSync(path.join(buildRoot, "package.json"))) {
    return "javascript";
  }
  return null;
}

async function compileActiveEditorsBinary(
  debugContext: DebugContext = "file",
  logDebugConsole: LogToDebugConsole
): Promise<BinaryInfo> {
  const activeFile = vscode.window.activeTextEditor?.document.uri.fsPath;

  if (!activeFile) {
    throw new Error(
      "No active file detected. Only Rust, JavaScript, or AssemblyScript files are supported."
    );
  }

  const activeFileLanguage =
    debugContext === "workspace"
      ? getProjectLanguage(activeFile)
      : getActiveFileLanguage(activeFile);

  if (!activeFileLanguage) {
    throw new Error(
      debugContext === "workspace"
        ? "Could not detect project language. Ensure your project has a package.json or Cargo.toml."
        : "Language not supported. Only Rust, JavaScript, or AssemblyScript files are supported."
    );
  }

  if (activeFileLanguage === "javascript") {
    return {
      path: await compileJavascriptBinary(activeFile, debugContext, logDebugConsole),
      lang: activeFileLanguage,
    };
  } else if (activeFileLanguage === "rust") {
    return {
      path: await compileRustAndFindBinary(activeFile, logDebugConsole),
      lang: activeFileLanguage,
    };
  } else if (activeFileLanguage === "assemblyscript") {
    return {
      path: await compileAssemblyScriptBinary(activeFile, logDebugConsole),
      lang: activeFileLanguage,
    };
  }
  throw new Error(
    "Invalid language. Only Rust, JavaScript, or AssemblyScript files are supported."
  );
}

export { compileActiveEditorsBinary };
export type { BinaryInfo, DebugContext, ExtLanguage };
