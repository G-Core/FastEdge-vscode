const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

const isProduction = process.argv.includes("--prod");
const isWatching = process.argv.includes("--watch");

// Read the pinned MCP server image version from the version file.
// A future CI job can update this file on MCP server release.
const mcpServerVersion = fs
  .readFileSync(path.join(__dirname, "../mcp-server.version"), "utf8")
  .trim();

async function main() {
  const ctx = await esbuild.context({
    entryPoints: ["./src/extension.ts"],
    bundle: true,
    format: "cjs",
    minify: isProduction,
    sourcemap: !isProduction,
    sourcesContent: false,
    platform: "node",
    outfile: `./dist/extension.js`,
    external: ["vscode"],
    mainFields: ["module", "main"],
    logLevel: "info",
    define: {
      __MCP_SERVER_VERSION__: JSON.stringify(mcpServerVersion),
    },
    plugins: [
      /* add to the end of plugins array */
      esbuildProblemMatcherPlugin,
    ],
  });
  if (isWatching) {
    await ctx.watch();
  } else {
    await ctx.rebuild();
    await ctx.dispose();
  }
}

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
  name: "esbuild-problem-matcher",

  setup(build) {
    build.onStart(() => {
      console.log("[watch] build started");
    });
    build.onEnd((result) => {
      result.errors.forEach(({ text, location }) => {
        console.error(`✘ [ERROR] ${text}`);
        console.error(
          `    ${location.file}:${location.line}:${location.column}:`
        );
      });
      console.log("[watch] build finished");
    });
  },
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
