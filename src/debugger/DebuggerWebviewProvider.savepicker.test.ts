import { describe, it, expect, vi, beforeEach } from "vitest";

// ── hoist mocks so vi.mock factory can reference them ─────────────────────────
const {
  postMessageMock,
  onDidReceiveMessageMock,
  onDidDisposeMock,
  showSaveDialogMock,
  writeFileMock,
} = vi.hoisted(() => ({
  postMessageMock: vi.fn(),
  onDidReceiveMessageMock: vi.fn(),
  onDidDisposeMock: vi.fn(),
  showSaveDialogMock: vi.fn(),
  writeFileMock: vi.fn(),
}));

vi.mock("vscode", () => ({
  window: {
    showSaveDialog: showSaveDialogMock,
    showErrorMessage: vi.fn(),
    showWarningMessage: vi.fn(),
    showInformationMessage: vi.fn(),
    createWebviewPanel: vi.fn(() => ({
      webview: {
        html: "",
        postMessage: postMessageMock,
        onDidReceiveMessage: onDidReceiveMessageMock,
        options: {},
        asWebviewUri: (u: any) => u,
      },
      onDidDispose: onDidDisposeMock,
      reveal: vi.fn(),
    })),
  },
  workspace: {
    fs: { writeFile: writeFileMock },
  },
  Uri: {
    parse: (s: string) => ({ scheme: new URL(s).protocol.replace(":", ""), toString: () => s }),
    file: (p: string) => ({ fsPath: p, toString: () => `file://${p}` }),
  },
  ViewColumn: { One: 1 },
  env: {
    openExternal: vi.fn(),
    asExternalUri: vi.fn((uri: any) => Promise.resolve(uri)),
  },
}));

import { DebuggerWebviewProvider } from "./DebuggerWebviewProvider";

const fakeServer = {
  start: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn().mockResolvedValue(undefined),
  isRunning: vi.fn(() => false),
  getPort: () => 5179,
  getToken: () => "tok",
  getAppRoot: () => "/project",
  getUrl: () => "http://localhost:5179",
} as any;

const fakeContext = { subscriptions: [] } as any;

describe("DebuggerWebviewProvider — openSavePicker handler", () => {
  let handler: (msg: any) => Promise<void>;

  beforeEach(async () => {
    vi.clearAllMocks();
    onDidReceiveMessageMock.mockImplementation((cb: any) => { handler = cb; });
    onDidDisposeMock.mockImplementation(() => {});

    const provider = new DebuggerWebviewProvider(fakeContext, fakeServer);
    await provider.showDebugger();
  });

  it("writes the file and replies saved:true when user picks a path", async () => {
    const pickedUri = { fsPath: "/project/.fastedge-debug/fastedge-config.test.json" };
    showSaveDialogMock.mockResolvedValue(pickedUri);
    writeFileMock.mockResolvedValue(undefined);

    await handler({ type: "openSavePicker", config: '{"envVars":{}}' });

    expect(writeFileMock).toHaveBeenCalledWith(
      pickedUri,
      Buffer.from('{"envVars":{}}')
    );
    expect(postMessageMock).toHaveBeenCalledWith({
      type: "savePickerResult",
      path: pickedUri.fsPath,
      saved: true,
    });
  });

  it("replies saved:false when user cancels the dialog", async () => {
    showSaveDialogMock.mockResolvedValue(undefined); // cancelled

    await handler({ type: "openSavePicker", config: "{}" });

    expect(writeFileMock).not.toHaveBeenCalled();
    expect(postMessageMock).toHaveBeenCalledWith({
      type: "savePickerResult",
      path: null,
      saved: false,
    });
  });

  it("replies saved:false when writeFile throws", async () => {
    const pickedUri = { fsPath: "/project/cfg.json" };
    showSaveDialogMock.mockResolvedValue(pickedUri);
    writeFileMock.mockRejectedValue(new Error("disk full"));

    await handler({ type: "openSavePicker", config: "{}" });

    expect(postMessageMock).toHaveBeenCalledWith({
      type: "savePickerResult",
      path: null,
      saved: false,
    });
  });
});
