const esbuild = require("esbuild");

const isProduction = process.argv.includes("--prod");
const isWatching = process.argv.includes("--watch");

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
    logLevel: "info",
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
