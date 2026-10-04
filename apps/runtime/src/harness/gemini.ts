import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
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
 * Gemini CLI: headless it answers on the Google sign-in it cached, or on a key from the shell.
 * The system prompt replaces its own (GEMINI_SYSTEM_MD); tools go over MCP through a project
 * settings file in the call's folder, with its built-in tools switched off; the answer is asked
 * for as JSON where a schema is wanted.
 */

export const GEMINI_BIN = process.env.GEMINI_BIN?.trim() || "gemini";

const CLASSES: Record<TextClass, string> = {
  classifier: "gemini-2.5-flash-lite",
  standard: "gemini-2.5-flash",
  high: "gemini-2.5-pro",
  highest: "gemini-2.5-pro",
};

/** Where the client keeps its state: its own home, else the person's. */
const geminiHome = (env: NodeJS.ProcessEnv) =>
  env.GEMINI_CLI_HOME?.trim() || join(env.HOME || homedir(), ".gemini");

const spec: EnvSpec = {
  id: "gemini",
  passThrough:
    /^(GEMINI_API_KEY|GOOGLE_API_KEY|GOOGLE_CLOUD_PROJECT|GOOGLE_CLOUD_LOCATION|GOOGLE_APPLICATION_CREDENTIALS|GOOGLE_GENAI_USE_VERTEXAI|GOOGLE_GENAI_USE_GCA|GEMINI_CLI_HOME)$/,
  keyVars: ["GEMINI_API_KEY", "GOOGLE_API_KEY", "GOOGLE_GENAI_USE_VERTEXAI"],
  // The client has no status command: a key in the environment, else the sign-in it cached.
  async auth(env): Promise<HarnessAuth> {
    if (env.GEMINI_API_KEY || env.GOOGLE_API_KEY || env.GOOGLE_GENAI_USE_VERTEXAI) {
      return "api_key";
    }
    return existsSync(join(geminiHome(env), "oauth_creds.json")) ? "subscription" : "none";
  },
};

/** What `gemini -o json` prints. */
export interface GeminiResult {
  session_id?: string;
  response?: string;
  stats?: {
    models?: Record<
      string,
      { tokens?: { prompt?: number; candidates?: number; cached?: number; total?: number } }
    >;
  };
  error?: { type?: string; message?: string; code?: number };
}

/** The client's output as the model call wants it; the lines it logs before the JSON are skipped. */
export function geminiAnswer(stdout: string): GeminiResult | null {
  const at = stdout.search(/^\{/m);
  if (at < 0) {
    return null;
  }
  try {
    return JSON.parse(stdout.slice(at)) as GeminiResult;
  } catch {
    return null;
  }
}

class GeminiModel extends HarnessModel {
  readonly provider = "gemini-cli";

  protected async invoke(call: HarnessCall): Promise<HarnessAnswer> {
    const { env, auth } = await resolveEnv(spec);
    const systemFile = join(call.dir, "system.md");
    writeFileSync(systemFile, call.system || "You are a helpful assistant.");
    const core: string[] = [];
    if (call.webSearch) {
      core.push("google_web_search");
    }
    if (call.files.length) {
      core.push("read_file");
    }
    mkdirSync(join(call.dir, ".gemini"), { recursive: true });
    writeFileSync(
      join(call.dir, ".gemini", "settings.json"),
      JSON.stringify({
        mcpServers: call.bridgeUrl
          ? { step: { httpUrl: call.bridgeUrl, trust: true, timeout: 600_000 } }
          : {},
        tools: { core },
      }),
    );
    const args = [
      "-o",
      "json",
      "-m",
      this.modelId,
      "--approval-mode",
      "yolo",
      "--allowed-mcp-server-names",
      call.bridgeUrl ? "step" : "none",
    ];
    const { stdout, stderr, code } = await runClient(GEMINI_BIN, args, {
      cwd: call.dir,
      env: {
        ...env,
        GEMINI_SYSTEM_MD: systemFile,
        NO_COLOR: "1",
        ...(auth === "subscription" ? { GOOGLE_GENAI_USE_GCA: "true" } : {}),
      },
      signal: call.signal,
      stdin: call.prompt,
    });
    const result = geminiAnswer(stdout);
    if (!result) {
      throw failureOf(this.harness, stderr.trim() || `exit ${code}`);
    }
    if (result.error) {
      throw failureOf(
        this.harness,
        result.error.code === 41 ? "not logged in" : (result.error.message ?? "error"),
      );
    }
    let input = 0;
    let cacheRead = 0;
    let output = 0;
    for (const model of Object.values(result.stats?.models ?? {})) {
      input += model.tokens?.prompt ?? 0;
      cacheRead += model.tokens?.cached ?? 0;
      output += model.tokens?.candidates ?? 0;
    }
    return {
      text: result.response ?? "",
      usage: { input, cacheRead, output },
      sessionId: result.session_id,
    };
  }
}

export const gemini: Harness = {
  ...spec,
  name: "Gemini CLI",
  bin: GEMINI_BIN,
  classes: CLASSES,
  async version(env) {
    try {
      const { stdout } = await run(GEMINI_BIN, ["--version"], { timeout: 10_000, env });
      return stdout.trim().split("\n").pop()?.trim() || null;
    } catch {
      return null;
    }
  },
  // No login command: the client's own app asks for the sign-in when it has none.
  login: { args: [], interactive: true },
  model: (alias: string, effort?: Effort) =>
    new GeminiModel(gemini, alias || CLASSES.standard, effort),
};
