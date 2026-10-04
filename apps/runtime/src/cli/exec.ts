import { spawn } from "node:child_process";
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

export interface Logged {
  code: number;
  /** The end of what the command printed. */
  tail: string;
}

/**
 * Runs a command; what it prints goes line by line to `onLine` and into the log file.
 * Never rejects for a command that fails: the caller reads `code`.
 */
export function runLogged(
  command: string,
  args: string[],
  options: {
    env?: NodeJS.ProcessEnv;
    cwd?: string;
    logFile?: string;
    onLine?: (line: string) => void;
  } = {},
): Promise<Logged> {
  const { logFile, onLine } = options;
  if (logFile) {
    mkdirSync(dirname(logFile), { recursive: true });
    appendFileSync(logFile, `\n$ ${command} ${args.join(" ")}\n`);
  }
  return new Promise((resolve) => {
    let tail = "";
    let pending = "";
    const take = (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      tail = (tail + text).slice(-4000);
      if (logFile) {
        appendFileSync(logFile, text);
      }
      pending += text;
      const lines = pending.split(/\r?\n|\r/);
      pending = lines.pop() ?? "";
      for (const line of lines) {
        if (line.trim()) {
          onLine?.(line);
        }
      }
    };
    const child = spawn(command, args, {
      env: options.env,
      cwd: options.cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.on("data", take);
    child.stderr.on("data", take);
    child.on("error", (error) => {
      tail = `${tail}\n${error.message}`.trim();
      resolve({ code: 127, tail });
    });
    child.on("close", (code) => resolve({ code: code ?? 1, tail: tail.trim() }));
  });
}
