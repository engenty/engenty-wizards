import { format } from "node:util";

/**
 * The last lines this process printed, kept in memory so an installation can be looked at from
 * afar (docs/plans/remote-debug.md): the console is hooked, every line still goes where it
 * went, and a copy stays here with secrets taken out. A restart starts the ring over.
 */
export type Level = "debug" | "info" | "warn" | "error";

export interface LogLine {
  /** Counts up per process; `since` asks for what came after a line. */
  id: number;
  at: number;
  level: Level;
  text: string;
}

const RANK: Record<Level, number> = { debug: 0, info: 1, warn: 2, error: 3 };
const KEEP = Number(process.env.LOG_KEEP) || 3000;
const LINE_MAX = 4000;

/** When this process started. */
export const startedAt = Date.now();

const lines: LogLine[] = [];
let next = 1;

/** What never leaves a process in a log line: keys, tokens, one-time links, passwords. */
const SECRETS: [RegExp, string][] = [
  [/(Bearer\s+)[A-Za-z0-9._~+/=-]{8,}/gi, "$1[redacted]"],
  [/\bwz_[A-Za-z0-9_-]{6,}/g, "wz_[redacted]"],
  [/\b(sk|rk|pk)-[A-Za-z0-9_-]{8,}/g, "$1-[redacted]"],
  [/\bAIza[0-9A-Za-z_-]{20,}/g, "AIza[redacted]"],
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, "[jwt]"],
  [/([?&](?:k|t|rt|token|key|secret|code|password|api_?key)=)[^&\s"'<>]+/gi, "$1[redacted]"],
  [
    /((?:secret|password|passwd|token|api[_-]?key|authorization|refresh_token|access_token)["']?\s*[:=]\s*["']?)[^\s,"'}]{6,}/gi,
    "$1[redacted]",
  ],
];

export function redact(text: string): string {
  let out = text;
  for (const [pattern, replacement] of SECRETS) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

function push(level: Level, args: unknown[]) {
  const text = redact(format(...args)).slice(0, LINE_MAX);
  lines.push({ id: next++, at: Date.now(), level, text });
  if (lines.length > KEEP) {
    lines.splice(0, lines.length - KEEP);
  }
}

/** Keeps a line without printing it. */
export function note(level: Level, text: string) {
  push(level, [text]);
}

export interface TailQuery {
  /** Lines after this id. */
  since?: number;
  /** Lines at or after this time (ms). */
  after?: number;
  /** At most this many, the newest; default 200, at most 2000. */
  limit?: number;
  /** This level and up. */
  level?: Level;
  /** Lines containing this text, case-insensitive. */
  q?: string;
}

export function tail(query: TailQuery = {}): LogLine[] {
  const limit = Math.min(Math.max(1, query.limit ?? 200), 2000);
  const rank = RANK[query.level ?? "debug"] ?? 0;
  const needle = query.q?.trim().toLowerCase();
  const out: LogLine[] = [];
  for (let i = lines.length - 1; i >= 0 && out.length < limit; i--) {
    const line = lines[i];
    if (query.since !== undefined && line.id <= query.since) {
      break;
    }
    if (query.after !== undefined && line.at < query.after) {
      break;
    }
    if (RANK[line.level] < rank) {
      continue;
    }
    if (needle && !line.text.toLowerCase().includes(needle)) {
      continue;
    }
    out.push(line);
  }
  return out.reverse();
}

/** How many lines the ring holds and the id of the newest. */
export function logState(): { lines: number; newest: number; keeps: number } {
  return { lines: lines.length, newest: next - 1, keeps: KEEP };
}

/** Reads a query string's values as a tail query. */
export function tailQuery(get: (key: string) => string | undefined): TailQuery {
  const int = (key: string) => {
    const v = Number(get(key));
    return Number.isSafeInteger(v) && v >= 0 ? v : undefined;
  };
  const level = get("level");
  return {
    since: int("since"),
    after: int("after"),
    limit: int("limit"),
    level: level && level in RANK ? (level as Level) : undefined,
    q: get("q")?.slice(0, 200) || undefined,
  };
}

let hooked = false;

/** Hooks the console once: each method still prints, and keeps a copy here. */
export function hookConsole() {
  if (hooked) {
    return;
  }
  hooked = true;
  const methods: [keyof Console & ("log" | "info" | "debug" | "warn" | "error"), Level][] = [
    ["debug", "debug"],
    ["log", "info"],
    ["info", "info"],
    ["warn", "warn"],
    ["error", "error"],
  ];
  for (const [method, level] of methods) {
    const original = console[method].bind(console);
    console[method] = (...args: unknown[]) => {
      push(level, args);
      original(...args);
    };
  }
  process.on("warning", (warning) => {
    push("warn", [`${warning.name}: ${warning.message}`]);
  });
}
