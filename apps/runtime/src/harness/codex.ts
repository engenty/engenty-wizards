import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Effort, TextClass } from "@engenty-wizards/shared/definition";
import { resolveEnv, run } from "./env.js";
import {
  failureOf,
  type HarnessAnswer,
  type HarnessCall,
  HarnessModel,
  runClient,
} from "./model.js";
import type { EnvSpec, Harness, HarnessAuth } from "./types.js";

/**
 * Codex: `codex exec` answers on the ChatGPT sign-in kept in CODEX_HOME. The person's own
 * config is left out so none of their MCP servers start for a call; tools go over MCP through
 * a config override; structured output is validated by the client (`--output-schema`).
 */

export const CODEX_BIN = process.env.CODEX_BIN?.trim() || "codex";

/** "default" = the model the client picks itself; a binding `codex/<model>` names one. */
const CLASSES: Record<TextClass, string> = {
  classifier: "default",
  standard: "default",
  high: "default",
  highest: "default",
};

const spec: EnvSpec = {
  id: "codex",
  passThrough: /^CODEX_HOME$/,
  keyVars: [],
  async auth(env): Promise<HarnessAuth> {
    try {
      const { stdout, stderr } = await run(CODEX_BIN, ["login", "status"], {
        timeout: 15_000,
        env,
      });
      const text = `${stdout}\n${stderr}`;
      if (/not logged in/i.test(text)) {
        return "none";
      }
      if (/api key/i.test(text)) {
        return "api_key";
      }
      return /logged in/i.test(text) ? "subscription" : "none";
    } catch {
      return "none";
    }
  },
};

/** One line of `codex exec --json`. */
export interface CodexEvent {
  type?: string;
  item?: { type?: string; text?: string };
  usage?: {
    input_tokens?: number;
    cached_input_tokens?: number;
    cache_write_input_tokens?: number;
    output_tokens?: number;
  };
  error?: { message?: string } | string;
  message?: string;
  thread_id?: string;
}

/** The events of one run as the model call wants them: the last agent message and the usage. */
export function codexAnswer(stdout: string): {
  answer: HarnessAnswer | null;
  failure: string | null;
} {
  let text: string | null = null;
  let usage: HarnessAnswer["usage"];
  let failure: string | null = null;
  let sessionId: string | undefined;
  for (const line of stdout.split("\n")) {
    let event: CodexEvent;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    if (event.type === "thread.started") {
      sessionId = event.thread_id;
    } else if (event.type === "item.completed" && event.item?.type === "agent_message") {
      text = event.item.text ?? "";
    } else if (event.type === "turn.completed") {
      const u = event.usage ?? {};
      usage = {
        input: u.input_tokens ?? 0,
        cacheRead: u.cached_input_tokens ?? 0,
        cacheWrite: u.cache_write_input_tokens ?? 0,
        output: u.output_tokens ?? 0,
      };
    } else if (event.type === "turn.failed" || event.type === "error") {
      failure =
        typeof event.error === "string"
          ? event.error
          : (event.error?.message ?? event.message ?? "error");
    }
  }
  return {
    answer: text === null ? null : { text, usage, sessionId },
    failure,
  };
}

class CodexModel extends HarnessModel {
  readonly provider = "codex";
  protected override readonly nativeSchema = true;

  protected async invoke(call: HarnessCall): Promise<HarnessAnswer> {
    const args = [
      "exec",
      "-",
      "--json",
      "--ephemeral",
      "--skip-git-repo-check",
      "--ignore-user-config",
      "-s",
      "read-only",
      "-C",
      call.dir,
      "-c",
      'approval_policy="never"',
      "-c",
      `web_search="${call.webSearch ? "live" : "disabled"}"`,
    ];
    if (this.modelId !== "default") {
      args.push("-m", this.modelId);
    }
    if (call.effort) {
      args.push("-c", `model_reasoning_effort="${call.effort}"`);
    }
    if (call.system) {
      // A JSON string is a TOML basic string: the instructions travel as one config value.
      args.push("-c", `developer_instructions=${JSON.stringify(call.system)}`);
    }
    if (call.bridgeUrl) {
      args.push(
        "-c",
        `mcp_servers.step.url="${call.bridgeUrl}"`,
        "-c",
        "mcp_servers.step.startup_timeout_sec=30",
        "-c",
        "mcp_servers.step.tool_timeout_sec=600",
        // The tools are this runtime's own: they run without the client asking anyone.
        "-c",
        'mcp_servers.step.default_tools_approval_mode="approve"',
      );
    }
    if (call.schema) {
      const file = join(call.dir, "schema.json");
      writeFileSync(file, JSON.stringify(call.schema));
      args.push("--output-schema", file);
    }
    const { stdout, stderr, code } = await runClient(CODEX_BIN, args, {
      cwd: call.dir,
      env: (await resolveEnv(spec)).env,
      signal: call.signal,
      stdin: call.prompt,
    });
    const { answer, failure } = codexAnswer(stdout);
    if (failure || !answer) {
      throw failureOf(this.harness, failure ?? stderr.trim() ?? `exit ${code}`);
    }
    return answer;
  }
}

export const codex: Harness = {
  ...spec,
  name: "Codex",
  bin: CODEX_BIN,
  install: "npm install -g @openai/codex",
  site: "https://developers.openai.com/codex",
  classes: CLASSES,
  async version(env) {
    try {
      const { stdout } = await run(CODEX_BIN, ["--version"], { timeout: 5000, env });
      const words = stdout.trim().split(/\s+/);
      return words[words.length - 1] || null;
    } catch {
      return null;
    }
  },
  login: { args: ["login"], interactive: false },
  model: (alias: string, effort?: Effort) => new CodexModel(codex, alias || "default", effort),
  exhausted:
    "Das Kontingent des ChatGPT-Kontos, mit dem Codex angemeldet ist, ist aufgebraucht. Später noch einmal versuchen oder einen anderen Client wählen.",
};
