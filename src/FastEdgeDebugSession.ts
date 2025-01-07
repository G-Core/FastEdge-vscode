import * as vscode from "vscode";
import * as cp from "child_process";
import {
  DebugSession,
  OutputEvent,
  TerminatedEvent,
} from "vscode-debugadapter";
import { DebugProtocol } from "vscode-debugprotocol";
import { DebugConfig } from "./BinaryDebugConfigurationProvider";

import { compileActiveEditorsBinary } from "./compiler";

export class FastEdgeDebugSession extends DebugSession {
  private childProcess: cp.ChildProcess | undefined;

  protected async launchRequest(
    response: DebugProtocol.LaunchResponse,
    _args: unknown
  ): Promise<void> {
    const args: DebugConfig = _args as DebugConfig;

    // Clear the debug console before starting a new session
    this.clearDebugConsole();

    try {
      args.binary = await compileActiveEditorsBinary(args?.debugContext);
    } catch (compileError) {
      vscode.window.showErrorMessage(`Compile Error: View Debug Console`);
      this.sendEvent(
        new OutputEvent(
          `Compile Error: ${(compileError as Error).message}`,
          "stderr"
        )
      );
      this.sendEvent(
        new OutputEvent("Compilation failed. Stopping debug session.", "stderr")
      );
      this.sendEvent(new TerminatedEvent());
      this.sendResponse(response);
      return;
    }
    const binary = args.binary;
    const cli = args.cliPath;
    const port = args.port ?? 8181;
    const loggingLevel = args.traceLogging ? "info,http_service=trace" : "info";
    const execArgs = [
      "http",
      "-p",
      port,
      "-w",
      binary.path,
      ...(args.args ?? []),
    ];

    if (args.geoIpHeaders) {
      execArgs.push("--geo");
    }

    if (args.memoryLimit) {
      execArgs.push("-m", args.memoryLimit);
    }

    if (binary.lang === "javascript") {
      execArgs.push("--wasi-http", true);
    }

    if (args.headers) {
      execArgs.push(...this.injectVariables("headers", args.headers));
    }

    if (args.env) {
      execArgs.push(...this.injectVariables("env", args.env));
    }

    console.log("Farq: FastEdgeDebugSession -> execArgs", execArgs);
    this.childProcess = cp.spawn(cli, execArgs, {
      env: {
        RUST_LOG: loggingLevel,
        ...process.env, // Preserve existing environment variables
      },
    });

    this.childProcess?.stdout?.on("data", (data) => {
      this.sendEvent(new OutputEvent(data.toString(), "stdout"));
    });

    this.childProcess?.stderr?.on("data", (data) => {
      this.sendEvent(new OutputEvent(data.toString(), "stderr"));
    });

    this.childProcess?.on("close", (code) => {
      this.sendEvent(new TerminatedEvent());
    });

    this.sendResponse(response);
  }

  private clearDebugConsole() {
    const debugConsole = vscode.debug.activeDebugConsole;
    if (debugConsole) {
      debugConsole.append("\x1b[2J\x1b[0f"); // ANSI escape codes to clear the console
    }
  }

  private injectVariables(
    type: "env" | "headers",
    vars: { [key: string]: string } = {}
  ): Array<string> {
    const result = [];
    for (const key in vars) {
      result.push(
        type === "env" ? "--env" : "--headers",
        `${key}=${vars[key]}`
      );
    }
    return result;
  }

  protected disconnectRequest(
    response: DebugProtocol.DisconnectResponse,
    args: DebugProtocol.DisconnectArguments
  ): void {
    if (this.childProcess) {
      this.childProcess.kill();
      this.childProcess = undefined;
    }
    this.sendEvent(new OutputEvent("FastEdge App stopping...", "stdout"));
    this.sendResponse(response);
  }
}
