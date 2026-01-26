import * as vscode from "vscode";
import { exec, spawn } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

function isCodespace(): boolean {
  return (
    process.env.CODESPACES === "true" ||
    process.env.CODESPACE_NAME !== undefined
  );
}

function hasGitHubCLI(): Promise<boolean> {
  return execAsync("gh --version")
    .then(() => true)
    .catch(() => false);
}

async function hasExistingCodespaceSecret(name: string): Promise<boolean> {
  try {
    // Get a list of current user codespace secrets
    const command = `gh secret list --app codespaces --user --json name`;
    const { stdout } = await execAsync(command);
    const secrets = JSON.parse(stdout);
    return secrets.some((secret: any) => secret.name === name);
  } catch (error) {
    console.error("Error trying to access available secrets", error);
    return true;
  }
}

/**
 * Gets the current repository owner and name.
 * Returns in the format "owner/repo" or null if not available.
 *
 * In Codespaces, uses GITHUB_REPOSITORY env var which works even with template repos.
 * Falls back to parsing git remote URL for non-Codespace environments.
 */
async function getCurrentRepository(): Promise<string | null> {
  // In Codespaces, GITHUB_REPOSITORY is always set to the actual repository
  // This works correctly even when created from a template
  if (process.env.GITHUB_REPOSITORY) {
    return process.env.GITHUB_REPOSITORY;
  }

  // Fallback: try to parse git remote URL
  try {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      return null;
    }

    const { stdout } = await execAsync("git config --get remote.origin.url", {
      cwd: workspaceFolder.uri.fsPath,
    });

    const remoteUrl = stdout.trim();

    // Parse GitHub remote URL (supports both HTTPS and SSH formats)
    // HTTPS: https://github.com/owner/repo.git
    // SSH: git@github.com:owner/repo.git
    const httpsMatch = remoteUrl.match(
      /github\.com[/:]([\w-]+)\/([\w-]+?)(\.git)?$/,
    );
    if (httpsMatch) {
      return `${httpsMatch[1]}/${httpsMatch[2]}`;
    }

    return null;
  } catch (error) {
    console.error("Error getting current repository", error);
    return null;
  }
}

/**
 * Securely sets a GitHub Codespace secret using gh CLI.
 * Passes the secret via stdin to avoid shell injection and process listing exposure.
 */
async function setCodespaceSecret(
  secretName: string,
  secretValue: string,
  repository?: string,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const args = ["secret", "set", secretName, "--app", "codespaces", "--user"];

    // Add repository restriction if provided
    if (repository) {
      args.push("--repos", repository);
    }

    const ghProcess = spawn("gh", args, {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stderr = "";
    ghProcess.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    ghProcess.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`gh command failed with code ${code}: ${stderr}`));
      }
    });

    ghProcess.on("error", reject);

    // Write secret to stdin and close it
    ghProcess.stdin?.write(secretValue);
    ghProcess.stdin?.end();
  });
}

async function setupCodespaceSecret(context?: vscode.ExtensionContext) {
  // Check if running in Codespace
  if (!isCodespace()) {
    vscode.window.showWarningMessage(
      "This command is only available in GitHub Codespaces. For local development, secrets are stored securely in your system keychain.",
    );
    return;
  }

  // Get default API key from VS Code secret storage if available
  let defaultApiKey = "";
  if (context?.secrets) {
    defaultApiKey = (await context.secrets.get("fastedge.apiKey")) || "";
  }

  const hasCli = await hasGitHubCLI();
  if (!hasCli) {
    vscode.window.showErrorMessage(
      "GitHub CLI (gh) is not available. Please install it to use this feature.\n\nAlternatively, you can set the secret manually via:\n1. GitHub repository Settings > Secrets > Codespaces\n2. Or run: gh codespace secret set GCORE_API_TOKEN",
    );
    return;
  }

  // Check if the secret is already set in the environment
  const existingToken = await hasExistingCodespaceSecret("GCORE_API_TOKEN");
  if (existingToken) {
    const overwrite = await vscode.window.showQuickPick(["No", "Yes"], {
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
        progress.report({ message: "Configuring GCORE_API_TOKEN..." });

        // Get current repository to grant access
        const currentRepo = await getCurrentRepository();

        // Set the secret for the current codespace securely
        // Note: This sets it at the user level and grants access to the current repository
        await setCodespaceSecret(
          "GCORE_API_TOKEN",
          apiToken,
          currentRepo ?? undefined,
        );

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
