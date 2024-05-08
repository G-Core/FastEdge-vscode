# FastEdge VSCode Extension

This is a VS Code extension which enables the running of Gcore/FastEdge binaries via the debug interface within the VS Code editor.

At present this Extension supports both Rust and Javascript.

<div>
  <img width=50px src="https://www.rust-lang.org/logos/rust-logo-64x64.png">&nbsp;
  <img width=50px src="https://raw.githubusercontent.com/github/explore/80688e429a7d4ef2fca1e82350fe8e3517d3494d/topics/javascript/javascript.png">&nbsp;
</div>

## How it works

Under the hood this extension compiles your code into a wasm binary using the associated language's build tools:

The specific SDK's can be found here:

[FastEdge-sdk-rust](https://github.com/G-Core/FastEdge-sdk-rust) <br>
[FastEdge-sdk-js](https://github.com/G-Core/FastEdge-sdk-js)

Having completed compilation it then serves the running application at http://localhost:8181

This is done using our application runner based from [FastEdge-cli](https://github.com/G-Core/FastEdge/tree/main/cli).

## Prerequisites

In order for this extension to compile and run any code, you will need to have the basic compilation tools installed for your given language.

Examples:

- Rust: `rustup target add wasm32-wasi`
- Javascript: `npm install --save-dev @gcoredev/fastedge-sdk-js`

More detail can be found in the SDK documentation above. 👆

## Installing the extension

🚧 This extension will be added to the VS Code marketplace soon... 🚀

In the meantime, it is possible to install from source:

1. Clone the repo

```sh
git clone git@github.com:G-Core/FastEdge-vscode.git
```

2. Setup Node environment

```sh
cd FastEdge-vscode && npm i
```

3. Build your OS specific extension using the Makefile

```sh
make
```

4. Install the extension

```sh
make install
```

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

Simply run Command Palette (Ctrl+Shift+P): `Debug: Add Configuration...` and select the `FastEdge App Runner` extension as the source.

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

  This will use the current "Active text editor" as the entrypoint for `componetize-cli <input> <output>`

- Debug: FastEdge App (Workspace)

  This will use VS Codes open Workspace as the cwd, where it will then read the top level `package.json` for the "main" entrypoint.

As the javascript build tool `componetize-cli` requires an output location for you compiled binary.
This is set by default to your workspace `.vscode/bin/ext.wasm`
