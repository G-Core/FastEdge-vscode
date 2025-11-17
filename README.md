# FastEdge VSCode Extension

This is a VS Code extension which enables the running of Gcore/FastEdge binaries via the debug interface within the VS Code editor.

At present this Extension supports both Rust and Javascript.

<div>
  <img width=50px src="https://www.rust-lang.org/logos/rust-logo-64x64.png">&nbsp;
  <img width=50px src="https://raw.githubusercontent.com/github/explore/80688e429a7d4ef2fca1e82350fe8e3517d3494d/topics/javascript/javascript.png">&nbsp;
</div>

## ✨ New Feature 🚀

The latest version now supplies a new command: `FastEdge (Generate mcp.json)`

This will prompt you for required information, followed by inserting the "FastEdge Assistant" MCP Server into your workspace.

For more information on this MCP Server see [here](https://github.com/G-Core/FastEdge-mcp-server)

## How it works

Under the hood this extension compiles your code into a wasm binary using the associated language's build tools:

The specific SDK's can be found here:

[FastEdge-sdk-rust](https://github.com/G-Core/FastEdge-sdk-rust) <br>
[FastEdge-sdk-js](https://github.com/G-Core/FastEdge-sdk-js)

Having completed compilation it then serves the running application at http://localhost:8181

This is done using our application runner based from [FastEdge-run](https://github.com/G-Core/FastEdge-lib).

**Note** To view which version of the FastEdge-run your extension is using.

1. Open the Command Palette (Ctrl+Shift+P or Cmd+Shift+P on macOS).
2. Type Preferences: Open Settings (UI) and select it.
3. In the Settings UI, search for FastEdge or navigate to the section for your extension.
4. You should see the cliVersion setting displayed as read-only.

## Prerequisites

In order for this extension to compile and run any code, you will need to have the basic compilation tools installed for your given language.

Examples:

- Rust: `rustup target add wasm32-wasip1`
- Javascript: `npm install --save-dev @gcoredev/fastedge-sdk-js`

More detail can be found in the SDK documentation above. 👆

## Installing the extension

This extension can be installed from the Visual Studio Marketplace. [FastEdge Launcher](https://marketplace.visualstudio.com/items?itemName=G-CoreLabsSA.fastedge)

It is also possible to install from source: [Releases](https://github.com/G-Core/FastEdge-vscode/releases)

## Running your first application

Having previously installed the extension you are now able to configure and run a given project by simply pressing `F5` within VS Code. <br>

Alternatively you can use the Command Palette (Ctrl+Shift+P): `Debug: Start Debug`

When running this for the first time in any project, you will want to create a `.vscode/launch.json` with the specific configuration settings for your application.

#### Example:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "FastEdge App Runner: Launch",
      "type": "fastedge",
      "request": "launch",
      "env": {
        // This is how to set environment variables for the running application
        "example-name": "example-value"
      }
    }
  ]
}
```

The easiest way to do this is to let the extension create it for you, from the default settings provided by the extension.

Simply run Command Palette (Ctrl+Shift+P): `Debug: FastEdge (Generate launch.json)`.

This will create the `.vscode` directory in your project and add a `launch.json` with the basic required configuration to run.

When running `Start Debug` (F5) from vs code you should see `Serving on http://localhost:8181` in your "Debug Console" window.

## Commands

This extension also provides two commands within the Command Palette (Ctrl+Shift+P)

- Debug: FastEdge App (Current File)
- Debug: FastEdge App (Workspace)

These behave slightly differently given the specific language and build tools.

#### Rust

- Debug: FastEdge App (Current File)

  This will use the current "Active text editor" location as the cwd when it attempts to `cargo build`

- Debug: FastEdge App (Workspace)

  This will use VS Codes open Workspace as the cwd when it attempts to `cargo build`

Both these commands will use the associated `cargo.toml` to configure the target build location for your binary output.

#### Javascript

- Debug: FastEdge App (Current File)

  This will use the current "Active text editor" as the entrypoint for `fastedge-build <input> <output>`

- Debug: FastEdge App (Workspace)

  This will use VS Codes open Workspace as the cwd, where it will then read the top level `package.json` for the "main" entrypoint.

As the javascript build tool `fastedge-build` requires an output location for you compiled binary.
This is set by default to your workspace `.vscode/bin/debugger.wasm`

## Runtime Arguments

Providing `Environment Variables`, `Secrets`, `Request Headers` and `Response Headers` can all be achieved from editing your `.vscode/launch.json`.

Alternatively you can provide these same arguments by creating `.env` files and setting the VS Code extension to import them.

Please be aware that if you are adding **sensitive** information to these files, they should be added to your `.gitignore` file.

e.g.

```
# VSCode workspace
.vscode/

# dotenv files
.env
.env.*

```

For more information on how this extension locates and uses dotenv files, see [here](https://github.com/G-Core/FastEdge-vscode/blob/main/DOTENV.md)
