import { spawn } from "child_process";
import * as os from "os";
import * as fs from "fs";
import * as path from "path";
import { LogToDebugConsole } from "../types";
import { rustConfigWasiTarget } from "./rustConfig";
import { resolveConfigRoot, resolveBuildRoot } from "../utils/resolveAppRoot";

export function compileRustAndFindBinary(
  activeFilePath: string,
  logDebugConsole: LogToDebugConsole
) {
  return new Promise<string>(async (resolve, reject) => {
    logDebugConsole("Compiling Rust binary...\n");
    const isWindows = os.platform() === "win32";
    const shell = isWindows ? "cmd.exe" : "sh";

    const buildRoot = resolveBuildRoot(activeFilePath);
    if (!buildRoot) {
      return reject(
        new Error(
          "Could not find app root. Ensure your project has a Cargo.toml."
        )
      );
    }

    // WASM output goes to the config root (= WORKSPACE_PATH) so the debugger
    // server can serve it via /api/workspace-wasm. Falls back to build root
    // when no .fastedge-debug/ dir exists (should have been created by the
    // caller, but guard defensively).
    const configRoot = resolveConfigRoot(activeFilePath) ?? buildRoot;

    const target = rustConfigWasiTarget(logDebugConsole, activeFilePath);
    logDebugConsole("wasm build target: " + target + "\n", "stderr");
    const cargoBuild = spawn(
      "cargo",
      ["build", "--message-format=json", `--target=${target}`],
      {
        shell,
        stdio: ["ignore", "pipe", "pipe"],
        cwd: buildRoot,
      }
    );

    let stdout = "";
    let stderr = "";

    cargoBuild.stdout?.on("data", (data: Buffer) => {
      stdout += data;
    });

    cargoBuild.stderr?.on("data", (data: Buffer) => {
      logDebugConsole(data.toString());
      stderr += data;
    });

    cargoBuild.on("close", (code: number) => {
      if (code !== 0) {
        reject(new Error(`cargo build exited with code ${code}: ${stderr}`));
        return;
      }

      const lines = stdout.split("\n");
      logDebugConsole(`[debug] cargo JSON stdout lines: ${lines.filter(l => l).length}\n`);
      for (const line of lines) {
        if (!line) {
          continue;
        }

        let message;
        try {
          message = JSON.parse(line);
        } catch (err) {
          reject(
            new Error(`Failed to parse cargo output: ${(err as Error).message}`)
          );
          return;
        }

        if (message?.reason === "compiler-artifact") {
          logDebugConsole(`[debug] artifact: ${JSON.stringify(message.filenames)}\n`);
        }

        if (
          message &&
          message.reason === "compiler-artifact" &&
          message.filenames &&
          message.filenames.length === 1
        ) {
          if (/.*\.wasm$/.test(message.filenames[0])) {
            const cargoWasmPath = message.filenames[0];

            // Copy to <configRoot>/.fastedge-debug/app.wasm for auto-load support.
            // configRoot = WORKSPACE_PATH so the server can find it via /api/workspace-wasm.
            const debugDir = path.join(configRoot, ".fastedge-debug");
            const standardWasmPath = path.join(debugDir, "app.wasm");

            // Create directory if it doesn't exist
            fs.mkdirSync(debugDir, { recursive: true });

            // Copy the WASM file
            try {
              fs.copyFileSync(cargoWasmPath, standardWasmPath);
              logDebugConsole(`Copied WASM to: ${standardWasmPath}\n`);
              return resolve(standardWasmPath);
            } catch (err) {
              logDebugConsole(`Warning: Failed to copy WASM to standard location: ${(err as Error).message}\n`);
              // Fall back to cargo output path
              return resolve(cargoWasmPath);
            }
          }
        }
      }
      reject(new Error("cargo build succeeded but no .wasm artifact found in output. Ensure your Cargo.toml targets wasm32-wasi or wasm32-wasip1."));
    });
  });
}
