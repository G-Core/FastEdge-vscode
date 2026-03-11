import { spawn } from "child_process";
import * as os from "os";
import * as fs from "fs";
import * as path from "path";
import { LogToDebugConsole } from "../types";
import { rustConfigWasiTarget } from "./rustConfig";
import { resolveAppRoot } from "../utils/resolveAppRoot";

export function compileRustAndFindBinary(
  activeFilePath: string,
  logDebugConsole: LogToDebugConsole
) {
  return new Promise<string>(async (resolve, reject) => {
    logDebugConsole("Compiling Rust binary...\n");
    const isWindows = os.platform() === "win32";
    const shell = isWindows ? "cmd.exe" : "sh";

    const appRoot = resolveAppRoot(activeFilePath);
    if (!appRoot) {
      return reject(
        new Error(
          "Could not find app root. Ensure your project has a Cargo.toml or fastedge-config.test.json."
        )
      );
    }

    const target = rustConfigWasiTarget(logDebugConsole, activeFilePath);
    logDebugConsole("wasm build target: " + target + "\n", "stderr");
    const cargoBuild = spawn(
      "cargo",
      ["build", "--message-format=json", `--target=${target}`],
      {
        shell,
        stdio: ["ignore", "pipe", "pipe"],
        cwd: appRoot,
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

        if (
          message &&
          message.reason === "compiler-artifact" &&
          message.filenames &&
          message.filenames.length === 1
        ) {
          if (/.*\.wasm$/.test(message.filenames[0])) {
            const cargoWasmPath = message.filenames[0];

            // Copy to <appRoot>/.fastedge/bin/debugger.wasm for auto-load support
            const fastedgeBinDir = path.join(appRoot, ".fastedge", "bin");
            const standardWasmPath = path.join(fastedgeBinDir, "debugger.wasm");

            // Create directory if it doesn't exist
            fs.mkdirSync(fastedgeBinDir, { recursive: true });

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
