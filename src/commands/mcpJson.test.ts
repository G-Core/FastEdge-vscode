import { describe, it, expect, vi } from "vitest";

// mcpJson pulls in the vscode module graph; only the pure command builder is
// under test here.
vi.mock("vscode", () => ({ workspace: {}, window: {}, Uri: {} }));

import { apiOriginFrom, getDockerCommand } from "./mcpJson";

// ---------------------------------------------------------------------------
// CI cannot run this end to end: GitHub's windows-latest and macos-latest
// runners have no Linux-container Docker, and the MCP server is a Linux image.
// So assert the generated argv shape here, and keep "does Docker Desktop for
// Windows forward a valueless -e" on the manual pre-release checklist.
// ---------------------------------------------------------------------------

describe("getDockerCommand", () => {
  it("invokes docker directly, with no shell wrapper", () => {
    const { command, args } = getDockerCommand(false);

    expect(command).toBe("docker");
    // A bash -c / cmd /c wrapper is what spliced the workspace path into a
    // shell command string.
    expect(command).not.toMatch(/bash|sh|cmd/);
    expect(args).not.toContain("-c");
    expect(args).not.toContain("/c");
    expect(args[0]).toBe("run");
  });

  it("keeps the workspace path as one argv element", () => {
    const { args } = getDockerCommand(false);

    const volume = args[args.indexOf("-v") + 1];
    expect(volume).toBe("${workspaceFolder}:/workspace");
    // No argument is a command string carrying the path plus other words.
    expect(args.every((a) => !/\s/.test(a) || a === volume)).toBe(true);
  });

  it("forwards credentials by name, without shell expansion", () => {
    const { args } = getDockerCommand(true);

    // Bare `-e NAME` — docker reads the value from its own environment, which
    // the MCP client supplies. `$VAR` / `%VAR%` would need a shell to expand.
    expect(args).toContain("GCORE_API_KEY");
    expect(args).toContain("GCORE_API_BASE");

    // `${workspaceFolder}` is a VS Code variable, expanded by VS Code before
    // docker is launched — it is not shell syntax. Nothing else may carry a
    // shell-expandable reference.
    const shellExpansions = args.filter(
      (a) => a !== "${workspaceFolder}:/workspace" && /\$|%\w+%/.test(a),
    );
    expect(shellExpansions).toEqual([]);
  });

  it("omits the API base override unless one is configured", () => {
    expect(getDockerCommand(false).args).not.toContain("GCORE_API_BASE");
  });

  it("version file contains a bare semver tag with no v prefix", () => {
    // Tags on ghcr.io have no v prefix; mcp-server.version must be x.y.z only.
    expect(__MCP_SERVER_VERSION__).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("uses a pinned version tag, not :latest", () => {
    const { args } = getDockerCommand(false);
    const imageArg = args[args.length - 1];
    expect(imageArg).not.toContain(":latest");
    expect(imageArg).toContain(__MCP_SERVER_VERSION__);
  });

  it("is platform independent", () => {
    const original = Object.getOwnPropertyDescriptor(process, "platform")!;
    try {
      const seen = new Set<string>();
      for (const platform of ["win32", "darwin", "linux"]) {
        Object.defineProperty(process, "platform", { value: platform });
        seen.add(JSON.stringify(getDockerCommand(true)));
      }
      expect(seen.size).toBe(1);
    } finally {
      Object.defineProperty(process, "platform", original);
    }
  });
});

describe("getDockerCommand: API key vs sign-in", () => {
  const image = `ghcr.io/g-core/fastedge-mcp-server:${__MCP_SERVER_VERSION__}`;
  const keyArgs = [
    "run", "--rm", "-i", "--pull=always",
    "-v", "${workspaceFolder}:/workspace",
    "-e", "WORKSPACE_ROOT=/workspace",
    "-e", "GCORE_API_KEY",
  ];

  it("keeps the API key config exactly as before", () => {
    expect(getDockerCommand(false).args).toEqual([...keyArgs, image]);
    expect(getDockerCommand(true).args).toEqual([...keyArgs, "-e", "GCORE_API_BASE", image]);
    expect(getDockerCommand(true, false)).toEqual(getDockerCommand(true));
  });

  it("sign-in mounts the session volume read-only and passes no key", () => {
    const { args } = getDockerCommand(false, true);
    expect(args).toEqual([
      "run", "--rm", "-i", "--pull=always",
      "-v", "${workspaceFolder}:/workspace",
      "-v", "fastedge-session:/run/fastedge:ro",
      "-e", "WORKSPACE_ROOT=/workspace",
      "-e", "FASTEDGE_SESSION",
      image,
    ]);
    expect(args).not.toContain("GCORE_API_KEY");
    expect(getDockerCommand(true, true).args.slice(-3)).toEqual(["-e", "GCORE_API_BASE", image]);
  });
});

describe("apiOriginFrom", () => {
  it("emits the bare origin, trimmed and without a trailing slash", () => {
    expect(apiOriginFrom("https://api.preprod.world")).toBe("https://api.preprod.world");
    expect(apiOriginFrom("  https://api.preprod.world/ ")).toBe("https://api.preprod.world");
  });

  it.each([
    ["http://api.preprod.world", /protocol/],
    ["https://user:pass@api.preprod.world", /credentials/],
    ["https://user@api.preprod.world", /credentials/],
    ["https://api.preprod.world/v1", /only an origin/],
    ["https://api.preprod.world/?x=1", /only an origin/],
    ["https://api.preprod.world/#x", /only an origin/],
    ["https://api.preprod.world?", /only an origin/],
    ["not a url", /Invalid URL/],
  ])("refuses %s", (setting, reason) => {
    expect(() => apiOriginFrom(setting)).toThrow(reason);
  });
});
