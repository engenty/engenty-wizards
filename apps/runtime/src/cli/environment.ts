import { delimiter, dirname, join } from "node:path";
import type { Layout } from "./home.js";

/**
 * Variables of the terminal the runtime inherits. Everything else it gets comes from the
 * install's `.env` or is set by the command line. A key or a database address that the shell
 * happens to export for another project never reaches it; in particular it never sees
 * `MANAGE_URL`, which would make it a cloud runtime.
 */
const INHERITED = new Set([
  "HOME",
  "USER",
  "LOGNAME",
  "SHELL",
  "TMPDIR",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "TERM",
  "COLORTERM",
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "NO_PROXY",
  "http_proxy",
  "https_proxy",
  "no_proxy",
  "SSL_CERT_FILE",
  "NODE_EXTRA_CA_CERTS",
  // Settings of this install somebody may give for one start: `API_PORT=8900 engenty-wizards`.
  "API_HOST",
  "APP_URL",
  "ALLOWED_HOSTS",
  "SECRETS",
  "CHROME_PATH",
  "FFMPEG_PATH",
  "OLLAMA_URL",
  "SANDBOX",
  "SANDBOX_ENABLED",
  "SANDBOX_IMAGE",
  "ACCOUNT_URL",
  "ACCOUNT_GATEWAY_URL",
  "CLOUD_URL",
]);

export function inherited(env: NodeJS.ProcessEnv): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined && (INHERITED.has(key) || key.startsWith("MODEL_"))) {
      out[key] = value;
    }
  }
  return out;
}

/**
 * The PATH of the runtime: AI clients the setup installed and the Node that runs this command
 * come first — a client installed with npm is a script that asks for `node`.
 */
export function runtimePath(paths: Layout, env: NodeJS.ProcessEnv, node = process.execPath) {
  const entries = [
    join(paths.clients, "bin"),
    dirname(node),
    ...(env.PATH ?? "").split(delimiter),
    join(env.HOME ?? "", ".local", "bin"),
  ];
  return [...new Set(entries.filter(Boolean))].join(delimiter);
}

export interface RuntimeStart {
  port: number;
  /** The origin people open. */
  url: string;
  dataDir: string;
  accessKey: string;
}

/**
 * The environment the command line starts the runtime with. `fileEnv` is the install's `.env`:
 * the runtime reads it itself, it is only looked at here so that a default does not override it.
 */
export function runtimeEnv(
  paths: Layout,
  start: RuntimeStart,
  env: NodeJS.ProcessEnv = process.env,
  fileEnv: Record<string, string> = {},
  platform: NodeJS.Platform = process.platform,
): Record<string, string> {
  const secretsGiven = env.SECRETS !== undefined || fileEnv.SECRETS !== undefined;
  return {
    ...inherited(env),
    PATH: runtimePath(paths, env),
    NODE_ENV: "production",
    API_PORT: String(start.port),
    APP_URL: start.url,
    DATA_DIR: start.dataDir,
    LOCAL_ACCESS_KEY: start.accessKey,
    // Keys entered in the settings live in the Keychain, as with the desktop app.
    ...(platform === "darwin" && !secretsGiven ? { SECRETS: "keychain" } : {}),
  };
}
