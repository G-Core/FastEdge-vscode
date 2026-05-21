import * as vscode from "vscode";
import * as os from "os";

import { MCPConfiguration } from "../types";
import { isCodespace, setupCodespaceSecret } from "./codespaceSecrets";

const DEFAULT_API_URL = "https://api.gcore.com";

function getPlatformDockerCommand(includeBaseOverride: boolean): {
  command: string;
  args: string[];
} {
  const platform = os.platform();

  if (platform === "win32") {
    // Windows - cmd, Windows-style env (%VAR%). No --user flag (Windows Docker Desktop).
    const args = [
      "/c",
      "docker",
      "run",
      "--rm",
      "-i",
      "--pull=always",
      "-v",
      "${workspaceFolder}:/workspace",
      "-e",
      "WORKSPACE_ROOT=/workspace",
      "-e",
      "GCORE_API_KEY=%GCORE_API_KEY%",
    ];
    if (includeBaseOverride) {
      args.push("-e", "GCORE_API_BASE=%GCORE_API_BASE%");
    }
    args.push("ghcr.io/g-core/fastedge-mcp-server:latest");
    return { command: "cmd", args };
  }

  // macOS and Linux - bash, Unix-style env ($VAR).
  const dockerCmd =
    'docker run --rm -i --pull=always -v "${workspaceFolder}:/workspace" -e "WORKSPACE_ROOT=/workspace" -e "GCORE_API_KEY=$GCORE_API_KEY"' +
    (includeBaseOverride ? ' -e "GCORE_API_BASE=$GCORE_API_BASE"' : "") +
    " ghcr.io/g-core/fastedge-mcp-server:latest";
  return { command: "bash", args: ["-c", dockerCmd] };
}

async function addToGitignore(workspaceFolder: vscode.WorkspaceFolder) {
  const gitignorePath = vscode.Uri.joinPath(workspaceFolder.uri, ".gitignore");
  const mcpJsonPattern = ".vscode/mcp.json";

  try {
    // Try to read existing .gitignore
    const fileData = await vscode.workspace.fs.readFile(gitignorePath);
    const gitignoreContent = Buffer.from(fileData).toString("utf8");

    // Check if the pattern already exists
    if (gitignoreContent.includes(mcpJsonPattern)) {
      vscode.window.showInformationMessage("mcp.json is already in .gitignore");
      return;
    }

    // Append the pattern to .gitignore
    const updatedContent = gitignoreContent.endsWith("\n")
      ? gitignoreContent + mcpJsonPattern + "\n"
      : gitignoreContent + "\n" + mcpJsonPattern + "\n";

    await vscode.workspace.fs.writeFile(
      gitignorePath,
      Buffer.from(updatedContent),
    );
    vscode.window.showInformationMessage(
      "Added .vscode/mcp.json to .gitignore",
    );
  } catch (error: any) {
    if (
      !(error instanceof vscode.FileSystemError) ||
      error.code !== "FileNotFound"
    ) {
      vscode.window.showErrorMessage(
        `Failed to update .gitignore: ${error?.message || error}`,
      );
      return;
    }
    // .gitignore doesn't exist, create it
    const newGitignoreContent = `# VS Code MCP configuration (contains API keys)\n${mcpJsonPattern}\n`;
    await vscode.workspace.fs.writeFile(
      gitignorePath,
      Buffer.from(newGitignoreContent),
    );
    vscode.window.showInformationMessage(
      "Created .gitignore and added .vscode/mcp.json",
    );
  }
}

async function createMCPJson(context?: vscode.ExtensionContext) {
  /*
  // Create output channel for debugging
  const outputChannel = vscode.window.createOutputChannel("FastEdge Extension Debugging");
  outputChannel.show(); // Make it visible immediately
  outputChannel.appendLine("[DEBUG] Add this kind of line throughout, rather than console.log()");
  */

  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (workspaceFolder) {
    const mcpJsonPath = vscode.Uri.joinPath(
      workspaceFolder.uri,
      ".vscode",
      "mcp.json",
    );

    let existingMCPJson = {} as MCPConfiguration;
    let existingRawContent: string | null = null;
    try {
      const fileData = await vscode.workspace.fs.readFile(mcpJsonPath);
      existingRawContent = Buffer.from(fileData).toString("utf8");
    } catch (error: any) {
      if (
        !(error instanceof vscode.FileSystemError) ||
        error.code !== "FileNotFound"
      ) {
        vscode.window.showErrorMessage(
          `Failed to read .vscode/mcp.json: ${error?.message || error}`,
        );
        return;
      }
      /* File doesn't exist - OK, we'll create a new one */
    }

    if (existingRawContent !== null) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(existingRawContent);
      } catch (error: any) {
        // File exists but is not valid JSON (e.g., trailing comma, comments).
        // Do NOT overwrite — tell the user to fix it manually.
        vscode.window.showErrorMessage(
          `Existing .vscode/mcp.json could not be parsed as JSON (${error?.message || error}). Please fix or remove the file before running this command.`,
        );
        return;
      }
      if (
        parsed === null ||
        typeof parsed !== "object" ||
        Array.isArray(parsed)
      ) {
        vscode.window.showErrorMessage(
          "Existing .vscode/mcp.json is not a JSON object. Please fix or remove the file before running this command.",
        );
        return;
      }
      const servers = (parsed as { servers?: unknown }).servers;
      if (
        servers !== undefined &&
        (servers === null ||
          typeof servers !== "object" ||
          Array.isArray(servers))
      ) {
        vscode.window.showErrorMessage(
          "Existing .vscode/mcp.json has a 'servers' field that is not an object. Please fix or remove the file before running this command.",
        );
        return;
      }
      existingMCPJson = parsed as MCPConfiguration;
    }

    if (
      existingMCPJson.servers &&
      Object.prototype.hasOwnProperty.call(
        existingMCPJson.servers,
        "fastedge-assistant",
      )
    ) {
      vscode.window.showInformationMessage(
        "mcp.json already contains 'fastedge-assistant' server configuration.",
      );
      return;
    }

    // Get existing configuration values as defaults.
    // The API URL is no longer prompted. The `fastedge.apiUrl` setting acts as an
    // advanced override: when set to anything other than the baked-in default
    // (https://api.gcore.com), it is emitted as GCORE_API_BASE so the MCP server
    // points at preprod/staging. Otherwise the image's baked default is used.
    const config = vscode.workspace.getConfiguration("fastedge");
    const configuredApiUrl = config.get<string>("apiUrl") || "";
    let apiBaseOverride = "";
    if (configuredApiUrl && configuredApiUrl !== DEFAULT_API_URL) {
      try {
        const parsedUrl = new URL(configuredApiUrl);
        if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
          throw new Error(`Unsupported protocol: ${parsedUrl.protocol}`);
        }
        apiBaseOverride = configuredApiUrl;
      } catch (error: any) {
        vscode.window.showErrorMessage(
          `Invalid fastedge.apiUrl setting: "${configuredApiUrl}" is not a valid http(s) URL (${error?.message || error}). Update the setting or remove it to use the default.`,
        );
        return;
      }
    }

    // Get API key from secure storage (VS Code's secret storage)
    const envApiKeyPlaceholder = "${env:GCORE_API_KEY}";
    let defaultApiKey = "";
    if (context?.secrets) {
      defaultApiKey = (await context.secrets.get("fastedge.apiKey")) || "";
    }

    // Check if running in Codespace and if secret is set
    const inCodespace = isCodespace();
    let usePlainMCPToken = true;
    if (inCodespace) {
      const useSecretSetup = await vscode.window.showInformationMessage(
        "🌐 Codespace Detected\n\nFor better security in Codespaces, we recommend using environment variables instead of storing API keys in mcp.json.\n\nWould you like to set up GCORE_API_KEY as a Codespace secret?",
        { modal: true },
        "Set Up Secret",
        "Continue with mcp.json",
        "Cancel",
      );

      if (useSecretSetup === "Cancel") {
        return;
      } else if (useSecretSetup === "Set Up Secret") {
        await setupCodespaceSecret(context);
        usePlainMCPToken = false;
        defaultApiKey = envApiKeyPlaceholder;
      }
    }

    let apiKey: string | undefined = defaultApiKey;

    if (usePlainMCPToken) {
      const securityNotice =
        "🔐 Security Notice\n\nThis will create an mcp.json file containing your API credentials.\n\nThe file will be created in .vscode/mcp.json and should not be committed to version control.";

      // Security notice before proceeding - using modal dialog for prominence
      const proceed = await vscode.window.showInformationMessage(
        securityNotice,
        { modal: true },
        "Continue",
        "Cancel",
      );

      if (proceed !== "Continue") {
        return;
      }

      // Prompt user for FASTEDGE_API_KEY
      apiKey = await vscode.window.showInputBox({
        prompt: "Enter your FastEdge API Key",
        placeHolder: defaultApiKey || "Your API key here...",
        value: defaultApiKey, // Pre-fill with saved value
        validateInput: (value) => {
          if (!value || value.trim().length === 0) {
            return "API Key is required";
          }
          return;
        },
      });

      if (!apiKey) {
        vscode.window.showErrorMessage(
          "API Key is required to configure MCP server.",
        );
        return;
      }
    }

    // API URL is no longer prompted (see apiBaseOverride above).

    // Offer to remember the API key when it differs from the stored default.
    const apiKeyChanged = apiKey !== defaultApiKey;

    if (apiKeyChanged) {
      const saveAsDefault = await vscode.window.showQuickPick(["Yes", "No"], {
        placeHolder: "Save this API key as the default for future use?",
        canPickMany: false,
      });

      if (saveAsDefault === "Yes" && context?.secrets) {
        await context.secrets.store("fastedge.apiKey", apiKey);
        vscode.window.showInformationMessage(
          "Default API key updated successfully.",
        );
      }
    }

    // Get platform-specific Docker command
    const dockerConfig = getPlatformDockerCommand(Boolean(apiBaseOverride));
    const platformName =
      os.platform() === "win32"
        ? "Windows"
        : os.platform() === "darwin"
          ? "macOS"
          : "Linux";

    const mcpJsonContent = {
      ...existingMCPJson,
      servers: {
        ...existingMCPJson.servers,
        "fastedge-assistant": {
          type: "stdio",
          command: dockerConfig.command,
          args: dockerConfig.args,
          env: {
            GCORE_API_KEY: apiKey,
            ...(apiBaseOverride ? { GCORE_API_BASE: apiBaseOverride } : {}),
          },
        },
      },
    };

    try {
      await vscode.workspace.fs.writeFile(
        mcpJsonPath,
        Buffer.from(JSON.stringify(mcpJsonContent, null, 2)),
      );
    } catch (error: any) {
      vscode.window.showErrorMessage(
        `Failed to write mcp.json: ${error?.message || error}`,
      );
      return;
    }

    // Security warning about the generated file - using modal dialog for prominence
    const securityWarning = await vscode.window.showInformationMessage(
      "⚠️ Security Notice\n\nThe generated mcp.json could possibly contain your API key in plain text.\n\nEnsure this file is not committed to version control.",
      { modal: true },
      "Add to .gitignore",
      "I'll handle it manually",
      "Show me the file",
    );

    if (securityWarning === "Add to .gitignore") {
      await addToGitignore(workspaceFolder);
    } else if (securityWarning === "Show me the file") {
      // Open the generated file for user review
      const document = await vscode.workspace.openTextDocument(mcpJsonPath);
      await vscode.window.showTextDocument(document);
    }

    vscode.window.showInformationMessage(
      `Generated mcp.json with ${platformName} configuration.`,
    );
  } else {
    vscode.window.showErrorMessage("No workspace folder available.");
  }
}

export { createMCPJson };
