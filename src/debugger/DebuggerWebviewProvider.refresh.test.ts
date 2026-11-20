import { describe, it, expect, vi } from "vitest";

const panel = vi.hoisted(() => ({
  webview: { html: "", onDidReceiveMessage: () => {}, postMessage: () => {} },
  reveal: () => {},
  onDidDispose: () => {},
}));
vi.mock("vscode", () => ({
  Uri: { parse: (s: string) => ({ toString: () => s }) },
  env: { asExternalUri: async (u: unknown) => u },
  ViewColumn: { Two: 2 },
  window: { createWebviewPanel: () => panel, showErrorMessage: vi.fn() },
  workspace: {},
}));

import { DebuggerWebviewProvider } from "./DebuggerWebviewProvider";

describe("DebuggerWebviewProvider.showDebugger", () => {
  it("reloads the page for a new server on the same URL (a settings restart), not otherwise", async () => {
    let forks = 1;
    const server = {
      start: async () => {},
      getUrl: () => "http://127.0.0.1:5179",
      getForkCount: () => forks,
      getAppRoot: () => "/app",
      getToken: () => "t",
      getPort: () => 5179,
    } as any;
    const provider = new DebuggerWebviewProvider({} as any, server);
    await provider.showDebugger();

    panel.webview.html = "unchanged";
    await provider.showDebugger();
    expect(panel.webview.html).toBe("unchanged");

    forks = 2;
    await provider.showDebugger();
    expect(panel.webview.html).toContain("127.0.0.1:5179");
  });
});
