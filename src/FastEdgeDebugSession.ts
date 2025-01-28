import * as os from "os";
import * as vscode from "vscode";
import treeKill from "tree-kill";
import { DebugProtocol } from "vscode-debugprotocol";
import {
  DebugSession,
  OutputEvent,
  TerminatedEvent,
} from "vscode-debugadapter";
import { spawn, ChildProcess } from "child_process";

import { DebugConfig } from "./BinaryDebugConfigurationProvider";

import { compileActiveEditorsBinary } from "./compiler";

export class FastEdgeDebugSession extends DebugSession {
  private childProcess: ChildProcess | undefined;
  private breakpoints: vscode.Breakpoint[] = [];
  private disabledBreakpoints: vscode.Breakpoint[] = [];

  public constructor() {
    super();
    this.setDebuggerLinesStartAt1(false);
    this.setDebuggerColumnsStartAt1(false);
  }

  protected initializeRequest(
    response: DebugProtocol.InitializeResponse,
    args: DebugProtocol.InitializeRequestArguments
  ): void {
    // build and return the capabilities of this debug adapter:
    response.body = response.body || {};
    response.body.supportsBreakpointLocationsRequest = true; // Enable breakpoint locations request
    response.body.supportsCancelRequest = false;
    response.body.supportsCompletionsRequest = false;
    response.body.supportsConfigurationDoneRequest = true;
    response.body.supportsDataBreakpoints = true;
    response.body.supportsDisassembleRequest = false;
    response.body.supportsEvaluateForHovers = false;
    response.body.supportsFunctionBreakpoints = true;
    response.body.supportsGotoTargetsRequest = false;
    response.body.supportsInstructionBreakpoints = true;
    response.body.supportsReadMemoryRequest = false;
    response.body.supportsRestartFrame = false;
    response.body.supportsSetExpression = false;
    response.body.supportsSetExpression = false;
    response.body.supportsSetVariable = false;
    response.body.supportsStepBack = false;
    response.body.supportsSteppingGranularity = false;
    response.body.supportsStepInTargetsRequest = false;
    response.body.supportsTerminateRequest = true;
    response.body.supportsTerminateThreadsRequest = false;
    response.body.supportsValueFormattingOptions = false;

    this.sendResponse(response);
  }

  /**
   * Called at the end of the configuration sequence.
   * Indicates that all breakpoints etc. have been sent to the DA and that the 'launch' can start.
   */
  protected configurationDoneRequest(
    response: DebugProtocol.ConfigurationDoneResponse,
    args: DebugProtocol.ConfigurationDoneArguments
  ): void {
    super.configurationDoneRequest(response, args);
  }

  protected setBreakpointsRequest(
    response: DebugProtocol.SetBreakpointsResponse,
    args: DebugProtocol.SetBreakpointsArguments
  ): void {
    response.body = { breakpoints: [] };
    this.sendResponse(response);
  }

  protected setDataBreakpointsRequest(
    response: DebugProtocol.SetDataBreakpointsResponse,
    args: DebugProtocol.SetDataBreakpointsArguments
  ): void {
    response.body = { breakpoints: [] };
    this.sendResponse(response);
  }

  protected async launchRequest(
    response: DebugProtocol.LaunchResponse,
    _args: unknown
  ): Promise<void> {
    const args: DebugConfig = _args as DebugConfig;

    // Clear the debug console before starting a new session
    this.clearDebugConsole();

    // Disable all breakpoints
    this.breakpoints = [...vscode.debug.breakpoints];
    this.disabledBreakpoints = this.breakpoints.map((bp) => {
      if (bp instanceof vscode.SourceBreakpoint) {
        return new vscode.SourceBreakpoint(
          bp.location,
          false,
          bp.condition,
          bp.hitCondition,
          bp.logMessage
        );
      } else if (bp instanceof vscode.FunctionBreakpoint) {
        return new vscode.FunctionBreakpoint(
          bp.functionName,
          false,
          bp.condition,
          bp.hitCondition,
          bp.logMessage
        );
      }
      return bp;
    });

    // Remove all existing breakpoints
    vscode.debug.removeBreakpoints(this.breakpoints);
    // Add disabled breakpoints
    vscode.debug.addBreakpoints(this.disabledBreakpoints);

    try {
      args.binary = await compileActiveEditorsBinary(
        args?.debugContext,
        (...args) => this.logDebugConsole(...args)
      );
    } catch (compileError) {
      vscode.window.showErrorMessage(`Compile Error: View Debug Console`);
      this.logDebugConsole(
        `Compile Error: ${(compileError as Error).message}\n`,
        "stderr"
      );
      this.logDebugConsole(
        `Compilation failed. Stopping debug session.\n`,
        "stderr"
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

    const isWindows = os.platform() === "win32";
    const shell = isWindows ? "cmd.exe" : "sh";

    this.childProcess = spawn(cli, execArgs, {
      shell,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        RUST_LOG: loggingLevel,
        ...process.env, // Preserve existing environment variables
      },
    });

    this.childProcess?.stdout?.on("data", (data: Buffer) => {
      this.logDebugConsole(data.toString(), "stdout");
    });

    this.childProcess?.stderr?.on("data", (data: Buffer) => {
      this.logDebugConsole(data.toString(), "stderr");
    });

    this.childProcess?.on("close", (code: number) => {
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

  private logDebugConsole(msg: string, type: "stdout" | "stderr" = "stdout") {
    this.sendEvent(new OutputEvent(msg, type));
  }

  private injectVariables(
    type: "env" | "headers",
    vars: { [key: string]: string } = {}
  ): Array<string> {
    const result = [];
    for (const key in vars) {
      result.push(
        type === "env" ? "--env" : "--headers",
        `"${key}=${vars[key]}"`
      );
    }
    return result;
  }

  protected disconnectRequest(
    response: DebugProtocol.DisconnectResponse,
    args: DebugProtocol.DisconnectArguments
  ): void {
    if (this.childProcess) {
      if (this.childProcess?.pid) {
        treeKill(this.childProcess.pid);
      } else {
        this.childProcess.kill();
      }
      this.childProcess = undefined;
    }
    // Remove all disabled breakpoints
    vscode.debug.removeBreakpoints(this.disabledBreakpoints);
    // Add original breakpoints
    vscode.debug.addBreakpoints(this.breakpoints);

    this.logDebugConsole("FastEdge App stopping...\n");
    this.sendResponse(response);
  }
}
