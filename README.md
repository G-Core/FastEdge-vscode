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

## Installing the extension

:construction: This extension will be added to the VS Code marketplace soon... :rocket:

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
