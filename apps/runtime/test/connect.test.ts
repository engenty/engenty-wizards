import { describe, expect, it } from "vitest";
import {
  jsonHasServer,
  processRunning,
  serverCommand,
  tomlHasServer,
  withJsonServer,
  withoutJsonServer,
  withoutTomlServer,
  withoutYamlExtension,
  withTomlServer,
  withYamlExtension,
  yamlHasExtension,
} from "../src/cli/connect.js";
import { layout } from "../src/cli/home.js";
import { messagesOf } from "../src/cli/mcp.js";

const server = { command: "/Users/a b/.engenty/wizards/bin/engenty-wizards", args: ["mcp"] };

describe("an AI app's JSON config", () => {
  it("gets the server next to the ones it has, and loses only it again", () => {
    const before = JSON.stringify({
      theme: "dark",
      mcpServers: { other: { command: "other" } },
    });
    const after = withJsonServer(before, ["mcpServers"], server)!;
    expect(JSON.parse(after)).toEqual({
      theme: "dark",
      mcpServers: { other: { command: "other" }, "engenty-wizards": server },
    });
    expect(jsonHasServer(after, ["mcpServers"])).toBe(true);
    const removed = withoutJsonServer(after, ["mcpServers"])!;
    expect(JSON.parse(removed)).toEqual(JSON.parse(before));
  });

  it("is made when there is none, at a nested place too", () => {
    expect(JSON.parse(withJsonServer(null, ["mcp", "servers"], server)!)).toEqual({
      mcp: { servers: { "engenty-wizards": server } },
    });
  });

  it("is left alone when it is not plain JSON", () => {
    expect(withJsonServer('{ // mine\n "servers": {} }', ["servers"], server)).toBeNull();
  });
});

describe("Codex's config.toml", () => {
  const before = `model = "gpt-5"

[mcp_servers.other]
command = "other"

[mcp_servers.engenty-wizards]
command = "old"
args = ["mcp"]

[mcp_servers.engenty-wizards.env]
X = "1"

[profiles.fast]
model = "mini"
`;

  it("replaces an older entry of ours and keeps everything else", () => {
    const after = withTomlServer(before, server);
    expect(after).toContain('[mcp_servers.other]\ncommand = "other"');
    expect(after).toContain('[profiles.fast]\nmodel = "mini"');
    expect(after).not.toContain('command = "old"');
    expect(after).not.toContain("engenty-wizards.env");
    expect(after).toContain(
      `[mcp_servers.engenty-wizards]\ncommand = "/Users/a b/.engenty/wizards/bin/engenty-wizards"\nargs = ["mcp"]`,
    );
    expect(tomlHasServer(after)).toBe(true);
    expect(tomlHasServer(withoutTomlServer(after))).toBe(false);
  });

  it("starts one", () => {
    expect(withTomlServer(null, server)).toMatch(/^\[mcp_servers\.engenty-wizards\]\n/);
  });
});

describe("Goose's config.yaml", () => {
  it("puts the extension below extensions:, once", () => {
    const before = "GOOSE_PROVIDER: openai\nextensions:\n  developer:\n    enabled: true\n";
    const once = withYamlExtension(before, server);
    const twice = withYamlExtension(once, server);
    expect(twice).toBe(once);
    expect(once).toContain("extensions:\n  engenty-wizards:\n    name: engenty-wizards");
    expect(once).toContain("  developer:\n    enabled: true");
    expect(yamlHasExtension(once)).toBe(true);
    expect(withoutYamlExtension(once)).toBe(before);
  });

  it("adds extensions: when there is none", () => {
    expect(withYamlExtension("GOOSE_PROVIDER: openai\n", server)).toMatch(
      /^GOOSE_PROVIDER: openai\nextensions:\n {2}engenty-wizards:/,
    );
  });
});

describe("the command an app starts", () => {
  it("is this copy's Node and script when wizards.sh did not install it", () => {
    expect(serverCommand(layout(), "/repo/bin/engenty-wizards.mjs")).toEqual({
      command: process.execPath,
      args: ["/repo/bin/engenty-wizards.mjs", "mcp"],
    });
  });

  it("names the install's home when it is not ~/.engenty", () => {
    const moved = serverCommand(layout("/srv/preview/wizards"), "/repo/bin/engenty-wizards.mjs");
    expect(moved.env).toEqual({ ENGENTY_HOME: "/srv/preview" });
    expect(withTomlServer(null, moved)).toContain('env = { ENGENTY_HOME = "/srv/preview" }');
    expect(withYamlExtension(null, moved)).toContain('    envs:\n      ENGENTY_HOME: "/srv/preview"');
  });
});

describe("an app that writes its config while it runs", () => {
  const desktop = {
    darwin: /\/Claude\.app\/Contents\/MacOS\/Claude$/m,
    win32: /^"?Claude\.exe"?,/im,
  };
  it("is seen running by its main process, not by its helpers", () => {
    const helpers =
      "/Applications/Claude.app/Contents/Helpers/chrome-native-host\n/Applications/Claude.app/Contents/Frameworks/Claude Helper.app/Contents/MacOS/Claude Helper\n";
    expect(processRunning(desktop, "darwin", () => helpers)).toBe(false);
    expect(
      processRunning(desktop, "darwin", () => `${helpers}/Applications/Claude.app/Contents/MacOS/Claude\n`),
    ).toBe(true);
    expect(processRunning(desktop, "win32", () => '"Claude.exe","4242","Console"\n')).toBe(true);
  });

  it("counts as not running where it cannot be told", () => {
    expect(processRunning(desktop, "linux", () => "Claude")).toBe(false);
    expect(
      processRunning(desktop, "darwin", () => {
        throw new Error("no ps");
      }),
    ).toBe(false);
  });
});

describe("what `engenty-wizards mcp` hands back", () => {
  it("reads a JSON answer and a server-sent stream", () => {
    const answer = { jsonrpc: "2.0", id: 1, result: {} };
    expect(messagesOf("application/json", JSON.stringify(answer))).toEqual([answer]);
    expect(
      messagesOf(
        "text/event-stream",
        `event: message\ndata: ${JSON.stringify(answer)}\n\nevent: message\ndata: ${JSON.stringify({ ...answer, id: 2 })}\n\n`,
      ).map((m) => m.id),
    ).toEqual([1, 2]);
    expect(messagesOf("application/json", "")).toEqual([]);
  });
});
