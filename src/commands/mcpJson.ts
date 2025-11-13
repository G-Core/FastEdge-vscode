import * as vscode from "vscode";

import { MCPConfiguration } from "../types";

const DEFAULT_API_URL = "https://api.gcore.com";

async function createMCPJson(context?: vscode.ExtensionContext) {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (workspaceFolder) {
    const mcpJsonPath = vscode.Uri.joinPath(
      workspaceFolder.uri,
      ".vscode",
      "mcp.json"
    );

    let existingMCPJson = {} as MCPConfiguration;
    try {
      const fileData = await vscode.workspace.fs.readFile(mcpJsonPath);
      const mcpJsonContent = Buffer.from(fileData).toString("utf8");
      existingMCPJson = JSON.parse(mcpJsonContent);
    } catch {
      /* Do nothing - just means there is not an existing mcp.json */
    }

    if (existingMCPJson.servers?.hasOwnProperty("fastedge-assistant")) {
      vscode.window.showInformationMessage(
        "mcp.json already contains 'fastedge-assistant' server configuration."
      );
      return;
    }

    // Get existing configuration values as defaults
    const config = vscode.workspace.getConfiguration("fastedge");
    const defaultApiUrl = config.get<string>("apiUrl") || DEFAULT_API_URL;

    // Get API key from secure storage (VS Code's secret storage)
    let defaultApiKey = "";
    if (context?.secrets) {
      defaultApiKey = (await context.secrets.get("fastedge.apiKey")) || "";
    }

    // Prompt user for FASTEDGE_API_KEY
    const apiKey = await vscode.window.showInputBox({
      prompt: "Enter your FastEdge API Key",
      placeHolder: defaultApiKey || "Your API key here...",
      value: defaultApiKey, // Pre-fill with saved value
      validateInput: (value) => {
        if (!value || value.trim().length === 0) {
          return "API Key is required";
        }
        return null;
      },
    });

    if (!apiKey) {
      vscode.window.showErrorMessage(
        "API Key is required to configure MCP server."
      );
      return;
    }

    // Prompt user for FASTEDGE_API_URL
    const apiUrl = await vscode.window.showInputBox({
      prompt: "Enter your FastEdge API URL",
      placeHolder: `e.g., ${DEFAULT_API_URL}`,
      value: defaultApiUrl, // Pre-fill with saved value
      validateInput: (value) => {
        if (!value || value.trim().length === 0) {
          return "API URL is required";
        }
        try {
          new URL(value);
          return null;
        } catch {
          return "Please enter a valid URL";
        }
      },
    });

    if (!apiUrl) {
      vscode.window.showErrorMessage(
        "API URL is required to configure MCP server."
      );
      return;
    }

    // Check if values have changed and ask user if they want to save them as defaults
    const apiKeyChanged = apiKey !== defaultApiKey;
    const apiUrlChanged = apiUrl !== defaultApiUrl;

    if (apiKeyChanged || apiUrlChanged) {
      const saveAsDefaults = await vscode.window.showQuickPick(["Yes", "No"], {
        placeHolder: "Save these values as defaults for future use?",
        canPickMany: false,
      });

      if (saveAsDefaults === "Yes") {
        // Save API key securely using VS Code's secret storage
        if (apiKeyChanged && context?.secrets) {
          await context.secrets.store("fastedge.apiKey", apiKey);
        }
        // Save API URL in regular configuration (not sensitive)
        if (apiUrlChanged) {
          await config.update(
            "apiUrl",
            apiUrl,
            vscode.ConfigurationTarget.Global
          );
        }
        vscode.window.showInformationMessage(
          "Default values updated successfully."
        );
      }
    }

    const mcpJsonContent = {
      servers: {
        ...existingMCPJson.servers,
        "fastedge-assistant": {
          type: "stdio",
          command: "bash",
          args: [
            "-c",
            'docker run --user $(id -u):$(id -g) --rm -i -v "$WORKSPACE_ROOT:/workspace" -e "WORKSPACE_ROOT=/workspace" -e "FASTEDGE_API_KEY=$FASTEDGE_API_KEY" -e "FASTEDGE_API_URL=$FASTEDGE_API_URL" ghcr.io/g-core/fastedge-mcp-server:latest',
          ],
          env: {
            WORKSPACE_ROOT: "${workspaceFolder}",
            FASTEDGE_API_KEY: apiKey,
            FASTEDGE_API_URL: apiUrl,
          },
        },
      },
    };
    await vscode.workspace.fs.writeFile(
      mcpJsonPath,
      Buffer.from(JSON.stringify(mcpJsonContent, null, 2))
    );
    vscode.window.showInformationMessage(
      "Generated mcp.json with default settings."
    );
  } else {
    vscode.window.showErrorMessage("No workspace folder available.");
  }
}

export { createMCPJson };
