import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHash } from "crypto";

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

/** Build the port file content the server would write: PORT:sha256(token) */
function portFileFor(manager: DebuggerServerManager, port = 5179): string {
  return `${port}:${createHash("sha256").update(manager.getToken()).digest("hex")}`;
}

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

  it("probes /health on 127.0.0.1 (not localhost)", async () => {
    (globalThis.fetch as any).mockResolvedValue({ ok: true });
    const manager = new DebuggerServerManager("/ext", "/app");
    (manager as any).port = 5179;
    await (manager as any).isHealthy();
    const url: string = (globalThis.fetch as any).mock.calls[0][0];
    expect(url).toContain("127.0.0.1");
    expect(url).toContain("/health");
  });
});

// ── readPortFile — input validation ──────────────────────────────────────────

describe("readPortFile — input validation", () => {
  it("accepts a valid port with correct token hash", () => {
    const m = new DebuggerServerManager("/ext", "/app");
    readFileSyncMock.mockReturnValue(portFileFor(m));
    expect((m as any).readPortFile()).toBe(5179);
  });

  it("accepts port 1 (min valid)", () => {
    const m = new DebuggerServerManager("/ext", "/app");
    readFileSyncMock.mockReturnValue(portFileFor(m, 1));
    expect((m as any).readPortFile()).toBe(1);
  });

  it("accepts port 65535 (max valid)", () => {
    const m = new DebuggerServerManager("/ext", "/app");
    readFileSyncMock.mockReturnValue(portFileFor(m, 65535));
    expect((m as any).readPortFile()).toBe(65535);
  });

  it("rejects legacy plain port format (no token hash)", () => {
    readFileSyncMock.mockReturnValue("5179");
    expect((new DebuggerServerManager("/ext", "/app") as any).readPortFile()).toBeNull();
  });

  it("rejects wrong token hash", () => {
    readFileSyncMock.mockReturnValue("5179:wronghash");
    expect((new DebuggerServerManager("/ext", "/app") as any).readPortFile()).toBeNull();
  });

  it("rejects port 0 even with correct hash", () => {
    const m = new DebuggerServerManager("/ext", "/app");
    readFileSyncMock.mockReturnValue(portFileFor(m, 0));
    expect((m as any).readPortFile()).toBeNull();
  });

  it("rejects port above 65535 even with correct hash", () => {
    const m = new DebuggerServerManager("/ext", "/app");
    readFileSyncMock.mockReturnValue(portFileFor(m, 65536));
    expect((m as any).readPortFile()).toBeNull();
  });
});

// ── fork env in Codespaces ────────────────────────────────────────────────────

describe("DebuggerServerManager — fork env in Codespaces", () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    forkMock.mockClear();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.unstubAllGlobals();
  });

  function setupForSpawn(manager: DebuggerServerManager) {
    // No port file initially → adoption skipped → fork runs.
    // After fork, waitForPortFile() polls readPortFile() + isHealthyOnPort():
    // set mock to the correct PORT:HASH format so it resolves on the first poll.
    readFileSyncMock.mockImplementationOnce(() => { throw new Error("ENOENT"); });
    readFileSyncMock.mockReturnValue(portFileFor(manager));
  }

  it("sets FASTEDGE_EXPECTED_HOST when GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN is set", async () => {
    process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN = "app.github.dev";
    const manager = new DebuggerServerManager("/ext", "/workspace");
    setupForSpawn(manager);

    await manager.start();

    expect(forkMock).toHaveBeenCalled();
    const forkEnv = forkMock.mock.calls[0][2].env as Record<string, string>;
    expect(forkEnv.FASTEDGE_EXPECTED_HOST).toBe("app.github.dev");
  });

  it("omits FASTEDGE_EXPECTED_HOST when GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN is not set", async () => {
    delete process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN;
    const manager = new DebuggerServerManager("/ext", "/workspace");
    setupForSpawn(manager);

    await manager.start();

    expect(forkMock).toHaveBeenCalled();
    const forkEnv = forkMock.mock.calls[0][2].env as Record<string, string>;
    expect(forkEnv.FASTEDGE_EXPECTED_HOST).toBeUndefined();
  });
});
