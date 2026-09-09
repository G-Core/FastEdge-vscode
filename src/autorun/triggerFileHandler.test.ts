import { describe, it, expect, vi, beforeEach } from "vitest";

// Mocks must be declared with vi.hoisted() so they're available inside the
// vi.mock factory, which Vitest hoists above all import statements.
const mocks = vi.hoisted(() => ({
  state: { isTrusted: true },
  executeCommand: vi.fn().mockResolvedValue(undefined),
  showWarningMessage: vi.fn(),
  delete: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn(),
}));

vi.mock("vscode", () => ({
  workspace: {
    get isTrusted() { return mocks.state.isTrusted; },
    fs: { readFile: mocks.readFile, delete: mocks.delete },
  },
  window: {
    showWarningMessage: mocks.showWarningMessage,
    showErrorMessage: vi.fn(),
    showInformationMessage: vi.fn(),
  },
  commands: { executeCommand: mocks.executeCommand },
}));

import { executeTriggerFile } from "./triggerFileHandler";

const fakeUri = { fsPath: "/ws/.vscode/.fastedge-run-command" } as any;
const fakeOutput = { appendLine: vi.fn() } as any;
const allowedCommand = "fastedge.setup-codespace-secret";

beforeEach(() => {
  mocks.state.isTrusted = true;
  vi.clearAllMocks();
  mocks.readFile.mockResolvedValue(Buffer.from(allowedCommand));
  mocks.delete.mockResolvedValue(undefined);
  mocks.executeCommand.mockResolvedValue(undefined);
});

describe("executeTriggerFile — security guards", () => {
  it("skips executeCommand in an untrusted workspace", async () => {
    mocks.state.isTrusted = false;
    await executeTriggerFile(fakeUri, fakeOutput);
    expect(mocks.executeCommand).not.toHaveBeenCalled();
    expect(mocks.delete).toHaveBeenCalled(); // cleans up the trigger file
  });

  it("skips executeCommand when the user dismisses the confirmation", async () => {
    mocks.showWarningMessage.mockResolvedValue("Ignore");
    await executeTriggerFile(fakeUri, fakeOutput);
    expect(mocks.executeCommand).not.toHaveBeenCalled();
    expect(mocks.delete).toHaveBeenCalled();
  });

  it("runs the command when trusted and user confirms, without workspace-supplied args", async () => {
    // File carries args — they must NOT be forwarded to executeCommand.
    mocks.readFile.mockResolvedValue(
      Buffer.from(JSON.stringify({ command: allowedCommand, args: ["injected-arg"] })),
    );
    mocks.showWarningMessage.mockResolvedValue("Run");

    await executeTriggerFile(fakeUri, fakeOutput);

    expect(mocks.executeCommand).toHaveBeenCalledTimes(1);
    expect(mocks.executeCommand).toHaveBeenCalledWith(allowedCommand);
    // Confirm args were not spread in — call must have exactly one argument.
    expect(mocks.executeCommand.mock.calls[0]).toHaveLength(1);
  });
});
