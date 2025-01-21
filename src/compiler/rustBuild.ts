import { spawn } from "child_process";
import { LogToDebugConsole } from "./types";

export function compileRustAndFindBinary(
  activeFilePath: string,
  logDebugConsole: LogToDebugConsole
) {
  return new Promise<string>(async (resolve, reject) => {
    const cargoBuild = spawn("cargo", ["build", "--message-format=json"], {
      cwd: activeFilePath,
    });

    let stdout = "";
    let stderr = "";

    cargoBuild.stdout.on("data", (data: Buffer) => {
      stdout += data;
    });

    cargoBuild.stderr.on("data", (data: Buffer) => {
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
            return resolve(message.filenames[0]);
          }
        }
      }
    });
  });
}
