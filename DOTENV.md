# DotEnv Files

As each VS Code workspace has only **one** `.vscode/launch.json` shared by all folders/files. It can become tedious to keep editing this file to provide:

- Environment Variables
- Secrets
- Request Headers
- Response Headers

For this reason the extension provides the ability to enable the use of `dotenv` files.

Within the `launch.json` you can set `dotenv: true`

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "dotenv": true
    }
  ]
}
```

This will activate the usage of `dotenv` files when running applications.

### Default behaviour

By default it will look for the closest `.env` file within your workspace, starting from the build location, i.e. the application you are debugging.

It will walk up the directory structure checking each level for valid dotenv files only stopping when it finds some or reaches the top of the workspace.

### Using a path

Alternatively you can provide a path for which it will use to look for specific dotenv files.

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "dotenv": "./some/location"
    }
  ]
}
```

If using a relative path, like above, it will always be relative of the workspace, **NOT** the build/debugging location.

## Providing Variables

As this extension is using [FastEdge-run](https://github.com/G-Core/FastEdge-lib) under the hood, all it is doing is collating dotenv files and providing them as arguments to the `fastedge-run` command.

For this reason setting variables in different places will have differing levels of importance.

i.e. `.vscode/launch.json` variables are the top-level. They will overwrite anything defined within a dotenv file.

#### Heirarchy:

```
launch.json
  └─ .env
      └─ .env.variables
      └─ .env.secrets
      └─ .env.req_headers
      └─ .env.rsp_headers
```

The use of `.env.{type}` is purely optional, and only recommended if you have particularly large sets of arguments.

Within the `.env` file you can specify which type of arument you are providing by prefixing the name with:

- `FASTEDGE_VAR_ENV_` - for environment variables
- `FASTEDGE_VAR_SECRET_` - for secrets
- `FASTEDGE_VAR_REQ_HEADER_` - for request headers
- `FASTEDGE_VAR_RSP_HEADER_` - for response headers

## Examples

For more help on usage:

- [Rust example](https://github.com/G-Core/FastEdge-vscode/tree/main/exampleFolder/rust-project/src/dotenv)
- [Javascript example](https://github.com/G-Core/FastEdge-vscode/tree/main/exampleFolder/js-project/src/dotenvFiles)
