import * as vscode from "vscode";

function isCodespace(): boolean {
  return (
    process.env.CODESPACES === "true" ||
    process.env.CODESPACE_NAME !== undefined
  );
}

function getCodespaceName(): string | undefined {
  return process.env.CODESPACE_NAME;
}

async function setupCodespaceSecret(context?: vscode.ExtensionContext) {
  // Check if running in Codespace
  if (!isCodespace()) {
    vscode.window.showWarningMessage(
      "This command is only available in GitHub Codespaces. For local development, secrets are stored securely in your system keychain.",
    );
    return;
  }

  const codespace = getCodespaceName();
  console.log("Farq: -> setupCodespaceSecret -> codespace:", codespace);

  // Get default API key from VS Code secret storage if available
  let defaultApiKey = "";
  if (context?.secrets) {
    defaultApiKey = (await context.secrets.get("fastedge.apiKey")) || "";
  }

  // Check if the secret is already set in the environment
  const existingToken =
    process.env.GCORE_API_TOKEN || process.env.FASTEDGE_API_KEY;
  if (existingToken) {
    const overwrite = await vscode.window.showQuickPick(["Yes", "No"], {
      placeHolder: `GCORE_API_TOKEN is already set. Do you want to update it?`,
    });
    if (overwrite !== "Yes") {
      return;
    }
  }

  // Prompt for API token
  const apiToken = await vscode.window.showInputBox({
    prompt: "Enter your GCore API Token",
    placeHolder: defaultApiKey || "Your API token here...",
    value: defaultApiKey,
    password: true, // Mask the input
    validateInput: (value) => {
      if (!value || value.trim().length === 0) {
        return "API Token is required";
      }
      return null;
    },
  });

  if (!apiToken) {
    vscode.window.showErrorMessage("API Token is required.");
    return;
  }

  // Show progress while setting up the secret
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Setting up Codespace secret...",
      cancellable: false,
    },
    async (progress) => {
      try {
        // Use GitHub CLI to set the secret
        const { exec } = require("child_process");
        const { promisify } = require("util");
        const execAsync = promisify(exec);

        // First, check if gh CLI is available
        try {
          await execAsync("gh --version");
        } catch {
          vscode.window.showErrorMessage(
            "GitHub CLI (gh) is not available. Please install it to use this feature.\n\nAlternatively, you can set the secret manually via:\n1. GitHub repository Settings > Secrets > Codespaces\n2. Or run: gh codespace secret set GCORE_API_TOKEN",
          );
          return;
        }

        progress.report({ message: "Configuring GCORE_API_TOKEN..." });

        // Set the secret for the current codespace
        // Note: This sets it at the user level for all codespaces
        const command = `echo "${apiToken.replace(/"/g, '\\"')}" | gh codespace secret set GCORE_API_TOKEN`;

        await execAsync(command);

        // Also save to VS Code secrets for future use
        if (context?.secrets) {
          await context.secrets.store("fastedge.apiKey", apiToken);
        }

        vscode.window
          .showInformationMessage(
            "✅ GCORE_API_TOKEN configured successfully!\n\n⚠️ You need to REBUILD your Codespace for the secret to take effect.\n\nRun: Codespaces: Rebuild Container",
            "Rebuild Now",
            "Later",
          )
          .then((choice) => {
            if (choice === "Rebuild Now") {
              vscode.commands.executeCommand("workbench.action.remote.rebuild");
            }
          });
      } catch (error: any) {
        vscode.window.showErrorMessage(
          `Failed to set Codespace secret: ${error?.message || error}\n\nYou can set it manually via:\n1. GitHub repository Settings > Secrets > Codespaces\n2. Or run: gh codespace secret set GCORE_API_TOKEN`,
        );
      }
    },
  );
}

export { isCodespace, setupCodespaceSecret };
