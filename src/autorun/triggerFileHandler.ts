import * as vscode from "vscode";

/*
USAGE EXAMPLE FOR TRIGGER FILE (.vscode/.fastedge-run-command):
----------------------------------------
Simple command (no args):
fastedge.setup-codespace-secret

OR JSON format with args:
{
  "command": "fastedge.setup-codespace-secret",
  "args": ["optionalArg1", 42]
}
----------------------------------------
See ALLOWED_COMMANDS below for the full list of commands that can be
triggered this way.
echo "fastedge.setup-codespace-secret" > .vscode/.fastedge-run-command
*/

/**
 * Trigger file configuration
 */
const TRIGGER_FILE_PATH = ".vscode/.fastedge-run-command";

/**
 * Allowlist of commands that can be executed via trigger file.
 *
 * The trigger file lives in the workspace, so anything listed here can be
 * invoked without a click by whatever wrote it. Keep it to commands an actual
 * producer needs: the only one is the devcontainer bootstrap in
 * fastedge-codespace, which writes "fastedge.setup-codespace-secret" and then
 * polls for the secret to appear.
 *
 * Deliberately removed: the build commands (they reach the compilers with
 * workspace-controlled input), generate-mcp-json (writes credentials to disk),
 * reloadWindow (no producer; a reload loop is a denial of service), and
 * generate-launch-json (never a registered command — the real id is
 * fastedge.init-workspace).
 */
const ALLOWED_COMMANDS = ["fastedge.setup-codespace-secret"];

/**
 * Command structure for JSON format
 */
interface CommandTrigger {
  command: string;
  args?: unknown[];
}

/**
 * Initialize the trigger file handler
 * Watches for a trigger file that can auto-execute allowed commands on startup
 */
export function initializeTriggerFileHandler(
  context: vscode.ExtensionContext,
): void {
  const outputChannel = vscode.window.createOutputChannel("FastEdge Autorun");
  context.subscriptions.push(outputChannel);

  // Watch for future trigger files only in the root .vscode directory
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) {
    return;
  }

  for (const folder of workspaceFolders) {
    const pattern = new vscode.RelativePattern(folder, TRIGGER_FILE_PATH);
    const watcher = vscode.workspace.createFileSystemWatcher(pattern);

    watcher.onDidCreate(async (uri) => {
      await executeTriggerFile(uri, outputChannel);
    });

    watcher.onDidChange(async (uri) => {
      await executeTriggerFile(uri, outputChannel);
    });

    context.subscriptions.push(watcher);
  }
}

/**
 * Execute command from trigger file
 */
async function executeTriggerFile(
  uri: vscode.Uri,
  outputChannel: vscode.OutputChannel,
): Promise<void> {
  try {
    outputChannel.appendLine(`\nProcessing trigger file: ${uri.fsPath}`);

    // Read file content
    const content = await vscode.workspace.fs.readFile(uri);
    const contentStr = content.toString().trim();

    if (!contentStr) {
      outputChannel.appendLine("Trigger file is empty, ignoring");
      await vscode.workspace.fs.delete(uri);
      return;
    }

    // Parse command (supports both string and JSON format)
    let commandId: string;
    let commandArgs: any[] | undefined;

    try {
      const parsed: CommandTrigger = JSON.parse(contentStr);
      commandId = parsed.command;
      commandArgs = parsed.args;
      outputChannel.appendLine(
        `Parsed JSON command: ${commandId} with args: ${JSON.stringify(commandArgs)}`,
      );
    } catch {
      // Not JSON, treat as simple command string
      commandId = contentStr;
      outputChannel.appendLine(`Parsed simple command: ${commandId}`);
    }

    // Validate command is in allowlist
    if (!ALLOWED_COMMANDS.includes(commandId)) {
      const errorMsg = `Command '${commandId}' is not in the allowlist. Allowed commands: ${ALLOWED_COMMANDS.join(", ")}`;
      outputChannel.appendLine(`ERROR: ${errorMsg}`);
      vscode.window.showErrorMessage(`FastEdge Autorun: ${errorMsg}`);
      await vscode.workspace.fs.delete(uri);
      return;
    }

    // Execute command with timeout protection
    outputChannel.appendLine(`Executing command: ${commandId}`);
    let timeoutHandle: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutHandle = setTimeout(
        () => reject(new Error("Command execution timeout")),
        30000,
      );
    });

    const executePromise = commandArgs
      ? vscode.commands.executeCommand(commandId, ...commandArgs)
      : vscode.commands.executeCommand(commandId);

    try {
      await Promise.race([executePromise, timeoutPromise]);
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
    }

    outputChannel.appendLine(`✓ Command executed successfully: ${commandId}`);
    vscode.window.showInformationMessage(
      `FastEdge: Auto-executed '${commandId}'`,
    );

    // Delete trigger file after successful execution
    await vscode.workspace.fs.delete(uri);
    outputChannel.appendLine(`Deleted trigger file: ${uri.fsPath}`);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    outputChannel.appendLine(
      `ERROR: Failed to execute trigger file: ${errorMsg}`,
    );
    vscode.window.showErrorMessage(`FastEdge Autorun failed: ${errorMsg}`);

    // Still try to delete the file to prevent retry loops
    try {
      await vscode.workspace.fs.delete(uri);
      outputChannel.appendLine(`Deleted trigger file after error`);
    } catch (deleteError) {
      outputChannel.appendLine(
        `WARNING: Could not delete trigger file: ${deleteError}`,
      );
    }
  }
}
