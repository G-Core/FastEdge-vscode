import { describe, it, expect, vi } from "vitest";

vi.mock("vscode", () => ({ workspace: {}, window: {}, Uri: {}, env: {} }));

import { DebuggerWebviewProvider } from "./DebuggerWebviewProvider";

const fakeServer = {
  getPort: () => 5179,
  getToken: () => "deadbeeftoken",
  getAppRoot: () => "/app",
  getUrl: () => "http://localhost:5179",
} as any;

// getWebviewContent is private — access via cast for testing HTML output.
const html = (new DebuggerWebviewProvider({} as any, fakeServer) as any)
  .getWebviewContent("http://localhost:5179");

describe("DebuggerWebviewProvider.getWebviewContent — security properties", () => {
  it("includes a Content-Security-Policy with a per-render nonce", () => {
    expect(html).toMatch(/Content-Security-Policy/);
    expect(html).toMatch(/script-src 'nonce-[A-Za-z0-9+/=]+'/);
  });

  it("restricts frame-src to the debugger origin, not a wildcard", () => {
    expect(html).toMatch(/frame-src http:\/\/localhost:5179/);
  });

  it("never posts messages with target origin '*'", () => {
    expect(html).not.toContain("postMessage(event.data, '*')");
    expect(html).not.toContain('postMessage(event.data,"*")');
  });

  it("sets FRAME_ORIGIN to the debugger origin as a string literal", () => {
    expect(html).toContain('const FRAME_ORIGIN = "http://localhost:5179"');
  });

  it("injects the session token into the iframe src fragment", () => {
    expect(html).toContain("#token=deadbeeftoken");
  });
});
