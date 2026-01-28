import * as vscode from "vscode";

/*
USAGE EXAMPLE FOR TRIGGER FILE (.vscode/.fastedge-run-command):
----------------------------------------
Simple command (no args):
fastedge.generate-launch-json

OR JSON format with args:
{
  "command": "fastedge.generate-mcp-json",
  "args": ["optionalArg1", 42]
}
----------------------------------------
e.g. to auto-generate launch.json on startup.
echo "fastedge.generate-launch-json" > .vscode/.fastedge-run-command
*/

/**
 * Trigger file configuration
 */
const TRIGGER_FILE_PATH = ".vscode/.fastedge-run-command";

/**
 * Allowlist of commands that can be executed via trigger file
 * This is a security measure to prevent arbitrary command execution
 */
const ALLOWED_COMMANDS = [
  "fastedge.setup-codespace-secret",
  "fastedge.generate-launch-json",
  "fastedge.generate-mcp-json",
  "fastedge.run-file",
  "fastedge.run-workspace",
];

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
 * Check for existing trigger file on activation
 */
async function checkForTriggerFile(
  outputChannel: vscode.OutputChannel,
): Promise<void> {
  const workspaceFolders = vscode.workspace.workspaceFolders;

  if (!workspaceFolders || workspaceFolders.length === 0) {
    outputChannel.appendLine(
      "No workspace folder found, skipping trigger file check",
    );
    return;
  }

  // Check first workspace folder (most common case)
  const triggerPath = vscode.Uri.joinPath(
    workspaceFolders[0].uri,
    TRIGGER_FILE_PATH,
  );

  try {
    await vscode.workspace.fs.stat(triggerPath);
    outputChannel.appendLine(`Found trigger file at: ${triggerPath.fsPath}`);
    await executeTriggerFile(triggerPath, outputChannel);
  } catch {
    // File doesn't exist, that's fine
    outputChannel.appendLine("No trigger file found on activation");
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
    outputChannel.show(true);

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
