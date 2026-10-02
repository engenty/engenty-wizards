import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getRequestListener } from "@hono/node-server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const dir = mkdtempSync(join(tmpdir(), "wizards-sub-"));
// A stand-in for Claude Code: it records its arguments, signs in at the MCP endpoint with the
// config it was handed, and answers in the stream-json shape.
const fake = join(dir, "claude");
writeFileSync(
  fake,
  `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
if (args[0] === "--version") { console.log("0.0.0 (fake)"); process.exit(0); }
fs.writeFileSync(${JSON.stringify(join(dir, "args.json"))}, JSON.stringify(args));
const cfg = JSON.parse(fs.readFileSync(args[args.indexOf("--mcp-config") + 1], "utf8")).mcpServers.wizards;
(async () => {
  const res = await fetch(cfg.url, {
    method: "POST",
    headers: { ...cfg.headers, "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });
  const text = await res.text();
  const tools = (text.match(/"name":"[a-z_]+"/g) || []).length;
  console.log(JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", name: "mcp__wizards__edit_wizard" }] } }));
  console.log(JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "mcp " + res.status + " tools " + (tools > 5) }] } }));
  console.log(JSON.stringify({ type: "result", is_error: false, session_id: "sess-1", result: "done" }));
})();
`,
);
chmodSync(fake, 0o755);

process.env.DATA_DIR = dir;
process.env.APP_URL = "http://localhost:5181";
process.env.CLAUDE_BIN = fake;

let server: ReturnType<typeof createServer>;

beforeAll(async () => {
  const client = await import("../server/db/client");
  await client.migrateControlDb();
  const app = (await import("../server/app")).default;
  server = createServer(getRequestListener(app.fetch));
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  // The chat's MCP config points at the port this server listens on.
  const { env } = await import("../server/env");
  (env as { port: number }).port = (server.address() as AddressInfo).port;
}, 30_000);

afterAll(() => server?.close());

describe("studio chat on the Claude subscription", () => {
  it("runs Claude Code without its own tools and lets it reach only our MCP endpoint", async () => {
    const { subscriptionTurn, subscriptionClients } = await import("../server/agents/subscription");
    expect(await subscriptionClients()).toEqual(["claude"]);
    const seen: string[] = [];
    let building = 0;
    const turn = () =>
      subscriptionTurn({
        wizardId: "w1",
        message: "Bau etwas",
        signal: new AbortController().signal,
        onText: (t) => seen.push(t),
        onActivity: (a) => seen.push(`[${a}]`),
        onBuilding: () => building++,
      });
    const first = await turn();
    expect(first).toEqual({ reply: "mcp 200 tools true", changed: true });
    expect(building).toBe(1);
    expect(seen).toContain("[Baut den Wizard um]");

    const args: string[] = JSON.parse(readFileSync(join(dir, "args.json"), "utf8"));
    expect(args[args.indexOf("--tools") + 1]).toBe("");
    expect(args).toContain("--strict-mcp-config");
    expect(args[args.indexOf("--allowedTools") + 1]).toBe("mcp__wizards");
    expect(args).not.toContain("--resume");

    // The second turn continues the conversation the client keeps.
    await turn();
    const again: string[] = JSON.parse(readFileSync(join(dir, "args.json"), "utf8"));
    expect(again[again.indexOf("--resume") + 1]).toBe("sess-1");
  }, 30_000);
});
