import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("vscode", () => ({ workspace: {}, window: {}, Uri: {}, env: {} }));

import { DebuggerWebviewProvider } from "./DebuggerWebviewProvider";

const fakeServer = {
  getToken: () => "deadbeeftoken",
  getUrl: () => "http://127.0.0.1:5179",
} as any;

function stubFetch(loadResponse: { status: number; body: unknown }) {
  const calls: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const body = url.endsWith("/api/client-count") ? { count: 1 } : loadResponse.body;
    const status = url.endsWith("/api/client-count") ? 200 : loadResponse.status;
    return new Response(JSON.stringify(body), { status });
  });
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe("DebuggerWebviewProvider.loadResource", () => {
  it("loads the resource file through the server, once the page is connected", async () => {
    const calls = stubFetch({ status: 200, body: { ok: true } });

    await new DebuggerWebviewProvider({} as any, fakeServer).loadResource("/w/.fastedge-debug/r.test.json");

    const load = calls.find((c) => c.url.endsWith("/api/resource/load"))!;
    expect(calls[0].url).toMatch(/\/api\/client-count$/);
    expect(load.init?.method).toBe("POST");
    expect((load.init?.headers as Record<string, string>)["x-fastedge-token"]).toBe("deadbeeftoken");
    expect(JSON.parse(load.init?.body as string)).toEqual({ configPath: "/w/.fastedge-debug/r.test.json" });
  });

  it("throws the server's error", async () => {
    stubFetch({ status: 500, body: { ok: false, error: "rules[0].match is not a valid regex" } });

    await expect(
      new DebuggerWebviewProvider({} as any, fakeServer).loadResource("/w/r.test.json"),
    ).rejects.toThrow("rules[0].match is not a valid regex");
  });
});
