import { describe, it, expect, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { rustConfigWasiTarget } from "./rustConfig";

// ---------------------------------------------------------------------------
// The value this returns becomes the `--target=` argument passed to cargo, so
// every FastEdge Rust app shape needs to land on the right target. Cheap to
// cover exhaustively here; the integration suite then proves two of these
// actually build.
// ---------------------------------------------------------------------------

const noop = () => {};
let tmpRoots: string[] = [];

afterEach(() => {
  tmpRoots.forEach((d) => fs.rmSync(d, { recursive: true, force: true }));
  tmpRoots = [];
});

function mkProject(cargoToml: string, cargoConfig?: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fastedge-rustcfg-"));
  tmpRoots.push(root);
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.writeFileSync(path.join(root, "Cargo.toml"), cargoToml);
  if (cargoConfig !== undefined) {
    fs.mkdirSync(path.join(root, ".cargo"), { recursive: true });
    fs.writeFileSync(path.join(root, ".cargo", "config.toml"), cargoConfig);
  }
  return path.join(root, "src", "lib.rs");
}

const HTTP_BASIC = '[package]\nname="x"\n\n[dependencies]\nfastedge = "0.4"\nanyhow = "1"\n';
const HTTP_WASI = '[package]\nname="x"\n\n[dependencies]\nwstd = "0.6"\nanyhow = "1"\n';
const CDN_PROXY_WASM = '[package]\nname="x"\n\n[dependencies]\nproxy-wasm = "0.2"\n';

describe("rustConfigWasiTarget", () => {
  it("infers wasip1 for an HTTP app using the fastedge crate", () => {
    expect(rustConfigWasiTarget(noop, mkProject(HTTP_BASIC))).toBe("wasm32-wasip1");
  });

  it("infers wasip2 for an HTTP app using wstd", () => {
    expect(rustConfigWasiTarget(noop, mkProject(HTTP_WASI))).toBe("wasm32-wasip2");
  });

  it("infers wasip2 when a wasi app also depends on fastedge", () => {
    const mixed = '[package]\nname="x"\n\n[dependencies]\nwstd = "0.6"\nfastedge = "0.4"\n';
    expect(rustConfigWasiTarget(noop, mkProject(mixed))).toBe("wasm32-wasip2");
  });

  it("infers wasip1 for a CDN proxy-wasm app", () => {
    expect(rustConfigWasiTarget(noop, mkProject(CDN_PROXY_WASM))).toBe("wasm32-wasip1");
  });

  it("lets an explicit .cargo/config.toml target win over inference", () => {
    const target = rustConfigWasiTarget(
      noop,
      mkProject(HTTP_WASI, '[build]\ntarget = "wasm32-wasip1"\n'),
    );
    expect(target).toBe("wasm32-wasip1");
  });

  it("honours a custom target from .cargo/config.toml", () => {
    // Not restricted to a wasip1/wasip2 allowlist: cargo supports custom
    // targets, and an argv array makes the string inert regardless.
    const target = rustConfigWasiTarget(
      noop,
      mkProject(HTTP_BASIC, '[build]\ntarget = "my-custom-target"\n'),
    );
    expect(target).toBe("my-custom-target");
  });

  it("falls back to wasip1 when Cargo.toml is unparseable", () => {
    expect(rustConfigWasiTarget(noop, mkProject("not [valid toml"))).toBe(
      "wasm32-wasip1",
    );
  });

  it("falls back to inference when .cargo/config.toml is unparseable", () => {
    expect(rustConfigWasiTarget(noop, mkProject(HTTP_WASI, "not [valid"))).toBe(
      "wasm32-wasip2",
    );
  });
});
