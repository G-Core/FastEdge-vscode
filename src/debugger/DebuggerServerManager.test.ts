import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHash } from "crypto";

const settings = vi.hoisted(() => ({ inspect: { globalValue: undefined, workspaceValue: undefined } as Record<string, unknown> }));
const showWarningMessage = vi.hoisted(() => vi.fn());
const workspace = vi.hoisted(() => ({
  isTrusted: true,
  getConfiguration: () => ({ inspect: () => settings.inspect }),
}));
vi.mock("vscode", () => ({
  workspace,
  window: { showErrorMessage: vi.fn(), showWarningMessage },
}));

const readFileSyncMock = vi.fn(() => "5179");
vi.mock("fs", () => ({
  existsSync: () => true,
  readFileSync: (...args: any[]) => (readFileSyncMock as any)(...args),
  unlinkSync: vi.fn(),
}));

// Capture the fork env without actually spawning a process.
const forkMock = vi.fn();
const servers: any[] = [];
const lastServer = () => servers[servers.length - 1];
vi.mock("child_process", () => ({
  fork: (...args: any[]) => {
    forkMock(...args);
    const handlers: Record<string, (arg: unknown) => void> = {};
    const emitter = {
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: vi.fn((event: string, handler: (arg: unknown) => void) => (handlers[event] = handler)),
      handlers,
      connected: true,
      send: vi.fn(),
      killed: false,
      kill: vi.fn(),
      once: (event: string, cb: () => void) => event === "exit" && cb(),
    };
    servers.push(emitter);
    return emitter;
  },
  execFile: vi.fn(),
}));

import { DebuggerServerManager } from "./DebuggerServerManager";

/** Build the port file content the server would write: PORT:sha256(token) */
function portFileFor(manager: DebuggerServerManager, port = 5179): string {
  return `${port}:${createHash("sha256").update(manager.getToken()).digest("hex")}`;
}

// ── isHealthyOnPort — unauthenticated /health probe ──────────────────────────

describe("isHealthyOnPort — unauthenticated /health probe", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    forkMock.mockClear();
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("returns true (reuse) when server responds 200 OK", async () => {
    (globalThis.fetch as any).mockResolvedValue({ ok: true });
    const manager = new DebuggerServerManager("/ext", "/app");
    (manager as any).port = 5179;
    expect(await (manager as any).isHealthy()).toBe(true);
  });

  it("returns false (spawn fresh) when server responds non-OK", async () => {
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

  it("passes the workspace root and the app root", async () => {
    const manager = new DebuggerServerManager("/ext", "/ws/apps/convert", "/ws");
    setupForSpawn(manager);

    await manager.start();

    const forkEnv = forkMock.mock.calls[0][2].env as Record<string, string>;
    expect(forkEnv.WORKSPACE_PATH).toBe("/ws");
    expect(forkEnv.FASTEDGE_APP_ROOT).toBe("/ws/apps/convert");
  });

  it("without a workspace root, both roots are the app root", async () => {
    const manager = new DebuggerServerManager("/ext", "/workspace");
    setupForSpawn(manager);

    await manager.start();

    const forkEnv = forkMock.mock.calls[0][2].env as Record<string, string>;
    expect(forkEnv.WORKSPACE_PATH).toBe("/workspace");
    expect(forkEnv.FASTEDGE_APP_ROOT).toBe("/workspace");
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

// ── allowed folders ──────────────────────────────────────────────────────────

describe("DebuggerServerManager — allowed folders", () => {
  beforeEach(() => {
    forkMock.mockClear();
    showWarningMessage.mockReset();
    workspace.isTrusted = true;
    settings.inspect = { globalValue: undefined, workspaceValue: undefined };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
  });
  afterEach(() => vi.unstubAllGlobals());

  async function start(): Promise<Record<string, string>> {
    const manager = new DebuggerServerManager("/ext", "/ws");
    readFileSyncMock.mockImplementationOnce(() => { throw new Error("ENOENT"); });
    readFileSyncMock.mockReturnValue(portFileFor(manager));
    await manager.start();
    return forkMock.mock.calls[0][2].env;
  }

  it("passes the user setting, never a workspace's value", async () => {
    settings.inspect = { globalValue: ["/lib/wasm", "~/apps"], workspaceValue: ["/etc"] };
    const folders = JSON.parse((await start()).FASTEDGE_ALLOWED_FOLDERS);
    expect(folders).toEqual(["/lib/wasm", require("path").join(require("os").homedir(), "apps")]);
  });

  it("passes none when only a workspace sets it, or in Restricted Mode", async () => {
    settings.inspect = { globalValue: undefined, workspaceValue: ["/etc"] };
    expect((await start()).FASTEDGE_ALLOWED_FOLDERS).toBe("[]");
    forkMock.mockClear();
    workspace.isTrusted = false;
    settings.inspect = { globalValue: ["/lib/wasm"] };
    expect((await start()).FASTEDGE_ALLOWED_FOLDERS).toBe("[]");
  });

  it("asks the user in a modal dialog and sends the answer back to the server", async () => {
    await start();
    const server = lastServer();
    showWarningMessage.mockResolvedValueOnce("Allow for this session");
    server.handlers.message({ type: "fastedge:approve-folder", id: "a1", folder: "/lib/wasm" });
    await vi.waitFor(() => expect(server.send).toHaveBeenCalledWith({ type: "fastedge:folder-approval", id: "a1", approved: true }));
    expect(showWarningMessage.mock.calls[0][0]).toContain("/lib/wasm");
    expect(showWarningMessage.mock.calls[0][1]).toMatchObject({ modal: true });

    showWarningMessage.mockResolvedValueOnce(undefined); // dismissed
    server.handlers.message({ type: "fastedge:approve-folder", id: "a2", folder: "/other" });
    await vi.waitFor(() => expect(server.send).toHaveBeenCalledWith({ type: "fastedge:folder-approval", id: "a2", approved: false }));
  });

  it("ignores other messages", async () => {
    await start();
    lastServer().handlers.message({ type: "something-else", id: "x", folder: "/lib" });
    lastServer().handlers.message({ type: "fastedge:approve-folder", folder: 42 });
    lastServer().handlers.message({ type: "fastedge:approve-folder", id: "", folder: "/lib" });
    lastServer().handlers.message({ type: "fastedge:approve-folder", id: "x", folder: " " });
    expect(showWarningMessage).not.toHaveBeenCalled();
  });

  it("reuses the server while the setting is unchanged, and starts a new one when it changes", async () => {
    settings.inspect = { globalValue: ["/lib/wasm"] };
    const manager = new DebuggerServerManager("/ext", "/ws");
    readFileSyncMock.mockImplementationOnce(() => { throw new Error("ENOENT"); });
    readFileSyncMock.mockReturnValue(portFileFor(manager));
    await manager.start();
    await manager.start();
    expect(forkMock).toHaveBeenCalledTimes(1);

    settings.inspect = { globalValue: ["/lib/wasm", "/other"] };
    readFileSyncMock.mockImplementationOnce(() => { throw new Error("ENOENT"); }); // stop() removed the port file
    await manager.start();
    expect(forkMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(forkMock.mock.calls[1][2].env.FASTEDGE_ALLOWED_FOLDERS)).toEqual(["/lib/wasm", "/other"]);

    // The first server exits late (after a forced stop): the new one stays managed.
    servers[servers.length - 2].handlers.exit(null, "SIGKILL");
    expect(manager.isRunning()).toBe(true);
  });

  it("a start while another is starting waits for it, even after the setting changed", async () => {
    settings.inspect = { globalValue: ["/lib/wasm"] };
    const manager = new DebuggerServerManager("/ext", "/ws");
    readFileSyncMock.mockImplementationOnce(() => { throw new Error("ENOENT"); });
    readFileSyncMock.mockReturnValue(portFileFor(manager));
    const first = manager.start();
    settings.inspect = { globalValue: ["/lib/wasm", "/other"] };
    await Promise.all([first, manager.start()]);
    expect(forkMock).toHaveBeenCalledTimes(1);
    expect(lastServer().kill).not.toHaveBeenCalled();
  });
});
