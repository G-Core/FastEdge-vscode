import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";

import { MCPConfiguration } from "../types";
import { isCodespace, setupCodespaceSecret } from "./codespaceSecrets";

const DEFAULT_API_URL = "https://api.gcore.com";

/**
 * Build the docker invocation for the generated mcp.json.
 *
 * Docker is launched directly with an argv array on every platform — no
 * `bash -c` / `cmd /c` wrapper. The wrapper meant the workspace path was
 * spliced into a shell command string, so a path containing shell syntax
 * changed what ran. It also required per-platform variable expansion
 * (`$VAR` / `%VAR%`); a bare `-e NAME` makes docker forward the value from
 * its own environment instead, which the MCP client supplies via the "env"
 * block below.
 */
function getDockerCommand(includeBaseOverride: boolean): {
  command: string;
  args: string[];
} {
  const args = [
    "run",
    "--rm",
    "-i",
    "--pull=always",
    "-v",
    "${workspaceFolder}:/workspace",
    "-e",
    "WORKSPACE_ROOT=/workspace",
    "-e",
    "GCORE_API_KEY",
  ];
  if (includeBaseOverride) {
    args.push("-e", "GCORE_API_BASE");
  }
  // Version is read from mcp-server.version at build time and injected by esbuild.
  // Update that file (not this line) when the MCP server releases a new version.
  args.push(`ghcr.io/g-core/fastedge-mcp-server:${__MCP_SERVER_VERSION__}`);
  return { command: "docker", args };
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
        password: true, // Mask input — mirrors setupCodespaceSecret behavior
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

    const dockerConfig = getDockerCommand(Boolean(apiBaseOverride));

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
      const jsonStr = JSON.stringify(mcpJsonContent, null, 2);
      if (mcpJsonPath.scheme === "file") {
        // Verify the .vscode parent directory is not a symlink pointing outside the workspace.
        const vscodeDirPath = path.dirname(mcpJsonPath.fsPath);
        try {
          const realParent = fs.realpathSync(vscodeDirPath);
          const realRoot = fs.realpathSync(workspaceFolder.uri.fsPath);
          if (realParent !== realRoot && !realParent.startsWith(realRoot + path.sep)) {
            vscode.window.showErrorMessage(
              "Cannot write mcp.json: .vscode directory is a symlink outside the workspace.",
            );
            return;
          }
        } catch {
          // Directory doesn't exist yet — no symlink possible
        }
        // Ensure .vscode/ exists before opening the file (O_CREAT does not create parents).
        fs.mkdirSync(vscodeDirPath, { recursive: true });
        // O_NOFOLLOW atomically rejects any symlink at the file path itself,
        // eliminating the TOCTOU window that lstat+unlink+write has. On Windows
        // (where O_NOFOLLOW is unavailable) fall back to an explicit lstat check.
        // The lstat path has a narrow TOCTOU window, but a static malicious workspace
        // cannot exploit it without active intervention between the check and the open.
        const O_NOFOLLOW: number = (fs.constants.O_NOFOLLOW as number | undefined) ?? 0;
        if (O_NOFOLLOW === 0) {
          try {
            if (fs.lstatSync(mcpJsonPath.fsPath).isSymbolicLink()) {
              vscode.window.showErrorMessage(
                "Cannot write mcp.json: the file is a symbolic link.",
              );
              return;
            }
          } catch { /* file does not exist — OK */ }
        }
        // For new files, mode 0o600 applies immediately.
        // For pre-existing files, fchmodSync on the fd locks down permissions before
        // any credentials are written, closing the race that post-write chmod has.
        const fd = fs.openSync(
          mcpJsonPath.fsPath,
          fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_TRUNC | O_NOFOLLOW,
          0o600,
        );
        try {
          fs.fchmodSync(fd, 0o600);
          fs.writeFileSync(fd, jsonStr);
        } finally { fs.closeSync(fd); }
      } else {
        // Remote workspace (vscode-remote, Codespaces, etc.) — Node's fs.lstat
        // targets the local host, not the remote; use VS Code's virtual FS API to
        // check for symlinks on the parent directory and target file before writing.
        // Use readDirectory() (lstat semantics) rather than stat() (which follows
        // symlinks and throws FileNotFound for dangling ones) so that both live and
        // dangling symlinks on the .vscode dir and on mcp.json itself are detected.
        const vscodeDirUri = vscode.Uri.joinPath(workspaceFolder.uri, ".vscode");
        try {
          const workspaceEntries = await vscode.workspace.fs.readDirectory(workspaceFolder.uri);
          for (const [name, type] of workspaceEntries) {
            if (name.toLowerCase() === ".vscode" && (type & vscode.FileType.SymbolicLink)) {
              vscode.window.showErrorMessage(
                "Cannot write mcp.json: .vscode directory is a symbolic link.",
              );
              return;
            }
          }
        } catch { /* workspace root not readable — proceed */ }
        try {
          const vscodeDirEntries = await vscode.workspace.fs.readDirectory(vscodeDirUri);
          for (const [name, type] of vscodeDirEntries) {
            if (name.toLowerCase() === "mcp.json" && (type & vscode.FileType.SymbolicLink)) {
              vscode.window.showErrorMessage(
                "Cannot write mcp.json: mcp.json is a symbolic link.",
              );
              return;
            }
          }
        } catch { /* .vscode doesn't exist yet — no symlink possible */ }
        // Ensure .vscode/ exists (writeFile does not create parent directories).
        try {
          await vscode.workspace.fs.createDirectory(vscodeDirUri);
        } catch { /* already exists — OK */ }
        // Remote workspace permissions are best-effort (Node's fs.chmod targets local host).
        await vscode.workspace.fs.writeFile(mcpJsonPath, Buffer.from(jsonStr));
      }
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
      "Generated mcp.json.",
    );
  } else {
    vscode.window.showErrorMessage("No workspace folder available.");
  }
}

export { createMCPJson, getDockerCommand };
