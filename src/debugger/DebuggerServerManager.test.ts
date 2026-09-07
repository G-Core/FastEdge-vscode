import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("vscode", () => ({
  workspace: { isTrusted: true },
  window: { showErrorMessage: vi.fn() },
}));

const readFileSyncMock = vi.fn(() => "5179");
vi.mock("fs", () => ({
  existsSync: () => true,
  readFileSync: (...args: any[]) => (readFileSyncMock as any)(...args),
  unlinkSync: vi.fn(),
}));

// Capture the fork env without actually spawning a process.
const forkMock = vi.fn();
vi.mock("child_process", () => ({
  fork: (...args: any[]) => {
    forkMock(...args);
    const emitter = {
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: vi.fn(),
      killed: false,
      kill: vi.fn(),
    };
    return emitter;
  },
  execFile: vi.fn(),
}));

import { DebuggerServerManager } from "./DebuggerServerManager";

// ── isHealthyOnPort — token-authenticated probe ───────────────────────────────

describe("isHealthyOnPort — token-authenticated probe", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    forkMock.mockClear();
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("returns true (reuse) when server responds 200 — accepts our token", async () => {
    (globalThis.fetch as any).mockResolvedValue({ ok: true });
    const manager = new DebuggerServerManager("/ext", "/app");
    (manager as any).port = 5179;
    expect(await (manager as any).isHealthy()).toBe(true);
  });

  it("returns false (spawn fresh) when server responds 401 — alien token", async () => {
    (globalThis.fetch as any).mockResolvedValue({ ok: false, status: 401 });
    const manager = new DebuggerServerManager("/ext", "/app");
    (manager as any).port = 5179;
    expect(await (manager as any).isHealthy()).toBe(false);
  });

  it("probes /api/client-count on 127.0.0.1 (not localhost)", async () => {
    (globalThis.fetch as any).mockResolvedValue({ ok: true });
    const manager = new DebuggerServerManager("/ext", "/app");
    (manager as any).port = 5179;
    await (manager as any).isHealthy();
    const url: string = (globalThis.fetch as any).mock.calls[0][0];
    expect(url).toContain("127.0.0.1");
    expect(url).toContain("/api/client-count");
  });
});

// ── readPortFile — input validation ──────────────────────────────────────────

describe("readPortFile — input validation", () => {
  // fs module is already mocked; override readFileSync per test.
  function stubPort(value: string) {
    readFileSyncMock.mockReturnValue(value);
  }

  it("accepts a valid port", () => {
    stubPort("5179");
    expect((new DebuggerServerManager("/ext", "/app") as any).readPortFile()).toBe(5179);
  });

  it("rejects junk suffix (e.g. '5179junk')", () => {
    stubPort("5179junk");
    expect((new DebuggerServerManager("/ext", "/app") as any).readPortFile()).toBeNull();
  });

  it("rejects port 0", () => {
    stubPort("0");
    expect((new DebuggerServerManager("/ext", "/app") as any).readPortFile()).toBeNull();
  });

  it("rejects negative port string", () => {
    stubPort("-1");
    expect((new DebuggerServerManager("/ext", "/app") as any).readPortFile()).toBeNull();
  });

  it("rejects port above 65535", () => {
    stubPort("65536");
    expect((new DebuggerServerManager("/ext", "/app") as any).readPortFile()).toBeNull();
  });

  it("accepts 65535 (max valid)", () => {
    stubPort("65535");
    expect((new DebuggerServerManager("/ext", "/app") as any).readPortFile()).toBe(65535);
  });

  it("accepts 1 (min valid)", () => {
    stubPort("1");
    expect((new DebuggerServerManager("/ext", "/app") as any).readPortFile()).toBe(1);
  });
});

// ── fork env in Codespaces ────────────────────────────────────────────────────

describe("DebuggerServerManager — fork env in Codespaces", () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    forkMock.mockClear();
    readFileSyncMock.mockReturnValue("5179");
    // First fetch returns 401 so reuse is skipped; subsequent calls return 200
    // so waitForPortFile() resolves promptly instead of running for 30 s.
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 401 })
      .mockResolvedValue({ ok: true }));
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.unstubAllGlobals();
  });

  it("sets FASTEDGE_EXPECTED_HOST when GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN is set", async () => {
    process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN = "app.github.dev";
    const manager = new DebuggerServerManager("/ext", "/workspace");

    await manager.start();

    expect(forkMock).toHaveBeenCalled();
    const forkEnv = forkMock.mock.calls[0][2].env as Record<string, string>;
    expect(forkEnv.FASTEDGE_EXPECTED_HOST).toBe("app.github.dev");
  });

  it("omits FASTEDGE_EXPECTED_HOST when GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN is not set", async () => {
    delete process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN;
    const manager = new DebuggerServerManager("/ext", "/workspace");

    await manager.start();

    expect(forkMock).toHaveBeenCalled();
    const forkEnv = forkMock.mock.calls[0][2].env as Record<string, string>;
    expect(forkEnv.FASTEDGE_EXPECTED_HOST).toBeUndefined();
  });
});
