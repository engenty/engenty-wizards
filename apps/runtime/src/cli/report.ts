import { readFileSync } from "node:fs";
import { join } from "node:path";
import { LOCAL_MCP_HEADER, mintLocalTicket } from "../auth/local-ticket.js";
import type { LogLine } from "../log.js";
import { command, type Layout } from "./home.js";
import { runningRuntime, settings } from "./start.js";
import { bad, dim, ok } from "./ui.js";

/**
 * `wizards logs` shows the last lines the running runtime printed; `wizards report` sends its
 * status, model settings and those lines to the linked account, where an operator reads them
 * (docs/plans/remote-debug.md). Both talk to the running process, signed with the data folder's
 * secret as `wizards mcp` does; neither sends anything by itself.
 */

function readSecret(paths: Layout, dataDir: string): string | null {
  const given = process.env.APP_SECRET?.trim() || settings(paths).fileEnv.APP_SECRET?.trim();
  if (given) {
    return given;
  }
  try {
    return readFileSync(join(dataDir, "secret"), "utf8").trim();
  } catch {
    return null;
  }
}

async function ask(
  paths: Layout,
  method: "GET" | "POST",
  path: string,
): Promise<{ status: number; body: Record<string, unknown> } | string> {
  const { dataDir } = settings(paths);
  const running = await runningRuntime(dataDir);
  if (!running) {
    return `engenty wizards is not running. Start it with \`${command()} start\` first.`;
  }
  const secret = readSecret(paths, dataDir);
  if (!secret) {
    return "The data folder's secret could not be read.";
  }
  const res = await fetch(`http://127.0.0.1:${running.port}/api/local/debug${path}`, {
    method,
    headers: { [LOCAL_MCP_HEADER]: mintLocalTicket(secret, Date.now(), "local-debug") },
    signal: AbortSignal.timeout(30_000),
  });
  return {
    status: res.status,
    body: (await res.json().catch(() => ({}))) as Record<string, unknown>,
  };
}

/** The last lines of the running runtime; `value` may name how many (default 100). */
export async function logsCommand(paths: Layout, value: string): Promise<number> {
  const limit = Math.min(Math.max(1, Number(value) || 100), 2000);
  const answer = await ask(paths, "GET", `/logs?limit=${limit}`);
  if (typeof answer === "string") {
    console.error(answer);
    return 1;
  }
  const lines = (answer.body.lines as LogLine[] | undefined) ?? [];
  for (const line of lines) {
    const at = new Date(line.at).toISOString().slice(11, 19);
    const level = line.level === "info" ? "     " : line.level.padEnd(5);
    console.log(`${dim(at)} ${level} ${line.text}`);
  }
  if (!lines.length) {
    console.log(dim("Nothing printed yet."));
  }
  return 0;
}

export async function reportCommand(paths: Layout): Promise<number> {
  console.log(dim("Sending status, model settings (no keys) and the last log lines …"));
  const answer = await ask(paths, "POST", "/report");
  if (typeof answer === "string") {
    console.error(answer);
    return 1;
  }
  if (answer.status === 409) {
    console.error(
      `${bad} This install is linked to no account. Link one in the studio under Settings → Account, then send again.`,
    );
    return 1;
  }
  if (answer.status !== 200) {
    console.error(`${bad} ${answer.body.error ?? `The runtime answered ${answer.status}.`}`);
    return 1;
  }
  console.log(
    `${ok} Report ${answer.body.id} is at ${answer.body.to}. Name it when you ask for help.`,
  );
  return 0;
}
