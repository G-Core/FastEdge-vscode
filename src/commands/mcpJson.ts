import * as vscode from "vscode";

import { MCPConfiguration } from "../types";

async function createMCPJson() {
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

    // Prompt user for FASTEDGE_API_KEY
    const apiKey = await vscode.window.showInputBox({
      prompt: "Enter your FastEdge API Key",
      placeHolder: "Your API key here...",
      password: true, // Hides the input for security
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
      placeHolder: "e.g., https://api.gcore.com",
      value: "https://api.gcore.com", // Default value
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
