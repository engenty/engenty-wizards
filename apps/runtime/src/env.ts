import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

/** Load `.env.local` then `.env` without overriding the real environment. */
function loadEnvFiles() {
  for (const name of [".env.local", ".env"]) {
    const path = resolve(process.cwd(), name);
    if (!existsSync(path)) {
      continue;
    }
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!match || process.env[match[1]] !== undefined) {
        continue;
      }
      process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, "$2");
    }
  }
}
loadEnvFiles();

const str = (key: string, fallback = ""): string => process.env[key]?.trim() || fallback;

/**
 * Without `SANDBOX`: Docker when the sandbox image is on this machine, else agentOS when its
 * packages are installed (a checkout has them, the image and the desktop app do not), else none.
 * The image is not published, so a fresh install would otherwise offer a tool that cannot start.
 */
function sandboxEngine(image: string): "docker" | "agentos" | "off" {
  const engine = str("SANDBOX");
  if (str("SANDBOX_ENABLED", "1") !== "1" || engine === "off") {
    return "off";
  }
  if (engine) {
    return engine === "agentos" ? "agentos" : "docker";
  }
  if (dockerHasImage(image)) {
    return "docker";
  }
  return agentOsInstalled() ? "agentos" : "off";
}

function dockerHasImage(image: string): boolean {
  try {
    execFileSync("docker", ["image", "inspect", image], { stdio: "ignore", timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/** agentOS ships its sidecar for macOS and Linux on arm64 and x64 only. */
function agentOsInstalled(): boolean {
  if (!["darwin", "linux"].includes(process.platform) || !["arm64", "x64"].includes(process.arch)) {
    return false;
  }
  try {
    import.meta.resolve("@rivet-dev/agentos-core");
    return true;
  } catch {
    return false;
  }
}
const num = (key: string, fallback: number): number => {
  const v = Number(process.env[key]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
};

const dataDir = resolve(str("DATA_DIR", "data"));

/**
 * Signs cookies and links and derives the store's encryption key. A runtime that runs alone
 * makes its own once and keeps it in the data folder.
 */
function appSecret(): string {
  const given = str("APP_SECRET");
  if (given) {
    return given;
  }
  mkdirSync(dataDir, { recursive: true });
  const file = join(dataDir, "secret");
  if (!existsSync(file)) {
    writeFileSync(file, randomBytes(32).toString("hex"), { mode: 0o600 });
  }
  return readFileSync(file, "utf8").trim();
}

const manageUrl = str("MANAGE_URL").replace(/\/$/, "");
const port = num("API_PORT", 8891);
/** From source the Vite dev server on :5181 serves the pages; built, this server does. */
const fromSource = import.meta.url.endsWith(".ts");
const sandboxImage = str("SANDBOX_IMAGE", "engenty-sandbox:latest");

export const env = {
  production: process.env.NODE_ENV === "production",
  port,
  /** Listen address; a runtime that runs alone stays on the loopback interface. */
  host: str("API_HOST", manageUrl ? "0.0.0.0" : "127.0.0.1"),
  /** The origin people open, e.g. https://wizards.localhost — auth callbacks and links use it. */
  appUrl: str("APP_URL", fromSource ? "http://localhost:5181" : `http://localhost:${port}`).replace(
    /\/$/,
    "",
  ),
  /**
   * Where a signed-out visitor of the start page is sent instead of the sign-in, e.g. a landing
   * page while sign-up is closed. The sign-in stays at /sign-in. Empty: the start page signs in.
   */
  signedOutUrl: str("SIGNED_OUT_URL"),
  /** More host names this server answers under, besides APP_URL's and the loopback names. */
  allowedHosts: str("ALLOWED_HOSTS")
    .split(",")
    .map((h) => h.trim())
    .filter(Boolean),
  dataDir,
  /** The control database; empty = a libSQL file in the data folder. */
  databaseUrl: str("DATABASE_URL", ""),
  databaseAuthToken: str("DATABASE_AUTH_TOKEN"),
  /** Tenant databases on a libSQL server: `{tenant}` is replaced by the tenant id. Empty = files. */
  tenantDbUrlTemplate: str("TENANT_DB_URL_TEMPLATE"),
  tenantDbAuthToken: str("TENANT_DB_AUTH_TOKEN", str("DATABASE_AUTH_TOKEN")),
  authSecret: appSecret(),
  /** Where OAuth providers send people back after connecting an account; default <APP_URL>/api/connect/callback. */
  connectRedirectUrl: str("CONNECT_REDIRECT_URL"),
  /** Encrypts connected accounts and kept browser sessions; falls back to the app secret. */
  storeKey: str("STORE_ENC_KEY"),
  devLogin: process.env.NODE_ENV !== "production" && str("DEV_LOGIN") === "1",

  /**
   * The Manage-App this runtime belongs to. Set = people sign in there, tenants come from its
   * tokens and model calls go through its gateway. Empty = the runtime runs alone with one tenant.
   */
  manage: {
    url: manageUrl,
    gatewayUrl: str("GATEWAY_URL").replace(/\/$/, ""),
    clientId: str("MANAGE_CLIENT_ID"),
    clientSecret: str("MANAGE_CLIENT_SECRET"),
    /** Authenticates this runtime at the Manage-App and the gateway, and the Manage-App here. */
    serviceKey: str("MANAGE_SERVICE_KEY"),
  },
  /**
   * A runtime that runs alone answers the studio only with a cookie, set by opening
   * `/api/local/enter?k=<key>` once. The desktop app passes the key; else one is printed at start.
   */
  local: {
    accessKey: str("LOCAL_ACCESS_KEY"),
    /** The Manage-App a local runtime links an account to (credits, publishing). */
    accountUrl: str("ACCOUNT_URL", "https://account.engenty.ai").replace(/\/$/, ""),
    gatewayUrl: str("ACCOUNT_GATEWAY_URL", "https://gateway.engenty.ai").replace(/\/$/, ""),
    /** The cloud runtime "publish to the cloud" sends wizards to. */
    cloudUrl: str("CLOUD_URL", "https://engenty.ai").replace(/\/$/, ""),
  },

  aiGatewayKey: str("AI_GATEWAY_API_KEY"),
  openaiKey: str("OPENAI_API_KEY"),
  anthropicKey: str("ANTHROPIC_API_KEY"),
  ollamaUrl: str("OLLAMA_URL", "http://127.0.0.1:11434/v1"),

  /** What each model class runs on when this runtime resolves classes itself (own keys, Ollama). */
  models: {
    classifier: str("MODEL_CLASSIFIER", "anthropic/claude-haiku-4.5"),
    standard: str("MODEL_STANDARD", "anthropic/claude-haiku-4.5"),
    high: str("MODEL_HIGH", "anthropic/claude-sonnet-5.5"),
    highest: str("MODEL_HIGHEST", "anthropic/claude-sonnet-5.5"),
    image: str("MODEL_IMAGE", "google/gemini-3.1-flash-image"),
    video: str("MODEL_VIDEO", "google/veo-3.1-fast-generate-001"),
    audio: str("MODEL_AUDIO", "google/gemini-3.5-flash-lite"),
  },

  /**
   * Reverse geocoder for location fields (Nominatim's `/reverse`); unset = coordinates only,
   * nothing about where a person stands leaves this server.
   */
  geocoderUrl: str("GEOCODER_URL"),
  /** CDP endpoint of a Chromium (the engenty-browser image); else a local Chrome is launched. */
  browserCdpUrl: str("BROWSER_CDP_URL"),
  chromePath: str(
    "CHROME_PATH",
    process.platform === "darwin"
      ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
      : "/usr/bin/chromium",
  ),
  /** Encodes widget animations to MP4; without it widgets offer no video. */
  ffmpegPath: str("FFMPEG_PATH", "ffmpeg"),
  /** What runs an agent's shell and code: a Docker container, an agentOS VM, or nothing. */
  sandbox: sandboxEngine(sandboxImage),
  sandboxImage,

  /** Assets and workspace files in an S3-compatible bucket (R2); empty = the data folder. */
  s3: {
    endpoint: str("S3_ENDPOINT").replace(/\/$/, ""),
    bucket: str("S3_BUCKET"),
    region: str("S3_REGION", "auto"),
    accessKeyId: str("S3_ACCESS_KEY_ID"),
    secretAccessKey: str("S3_SECRET_ACCESS_KEY"),
  },

  turnstile: { siteKey: str("TURNSTILE_SITE_KEY"), secret: str("TURNSTILE_SECRET_KEY") },

  limits: {
    visitorRunsPerHour: num("LIMIT_VISITOR_RUNS_PER_HOUR", 6),
    defaultDailyRuns: num("LIMIT_DEFAULT_DAILY_RUNS", 50),
    /** Runs of one tenant that work at the same time; the Manage-App can set another number per tenant. */
    concurrentRuns: num("LIMIT_CONCURRENT_RUNS", 4),
    /** End-user runs (no account) and their shared links are deleted after this many days. */
    resultTtlDays: num("RESULT_TTL_DAYS", 7),
    /** What a wizard keeps for a person (lists, files, accounts) goes when unused this long. */
    storeTtlDays: num("STORE_TTL_DAYS", 400),
  },
};

/**
 * The path APP_URL ends in: `/wizards` for https://example.com/wizards, empty for an origin alone. The proxy
 * may strip it or not, so the server takes both; what it writes into a cookie or a redirect
 * carries it.
 */
export const basePath = new URL(env.appUrl).pathname.replace(/\/+$/, "");

if (env.production) {
  const required = [
    "APP_URL",
    ...(manageUrl ? ["APP_SECRET", "MANAGE_SERVICE_KEY", "MANAGE_CLIENT_ID"] : []),
  ];
  const missing = required.filter((k) => !process.env[k]?.trim());
  if (missing.length) {
    throw new Error(`Missing required environment in production: ${missing.join(", ")}`);
  }
}

export type Env = typeof env;
