import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

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
const num = (key: string, fallback: number): number => {
  const v = Number(process.env[key]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
};

export const env = {
  production: process.env.NODE_ENV === "production",
  port: num("API_PORT", 8891),
  /** The origin people open, e.g. https://wizards.localhost — auth callbacks and links use it. */
  appUrl: str("APP_URL", "http://localhost:5181").replace(/\/$/, ""),
  dataDir: resolve(str("DATA_DIR", "data")),
  databaseUrl: str("DATABASE_URL", ""),
  databaseAuthToken: str("DATABASE_AUTH_TOKEN"),
  authSecret: str("BETTER_AUTH_SECRET", "dev-only-secret-change-me-dev-only-secret"),
  devLogin: process.env.NODE_ENV !== "production" && str("DEV_LOGIN") === "1",
  devEmail: str("DEV_LOGIN_EMAIL", "dev@wizards.local"),

  google: { id: str("GOOGLE_CLIENT_ID"), secret: str("GOOGLE_CLIENT_SECRET") },
  github: { id: str("GITHUB_CLIENT_ID"), secret: str("GITHUB_CLIENT_SECRET") },
  microsoft: { id: str("MICROSOFT_CLIENT_ID"), secret: str("MICROSOFT_CLIENT_SECRET") },

  aiGatewayKey: str("AI_GATEWAY_API_KEY"),
  openaiKey: str("OPENAI_API_KEY"),
  anthropicKey: str("ANTHROPIC_API_KEY"),

  models: {
    architect: str("MODEL_ARCHITECT", "anthropic/claude-sonnet-5.5"),
    smart: str("MODEL_SMART", "anthropic/claude-sonnet-5.5"),
    fast: str("MODEL_FAST", "anthropic/claude-haiku-4.5"),
    image: str("MODEL_IMAGE", "google/gemini-3.1-flash-image"),
    video: str("MODEL_VIDEO", "google/veo-3.1-fast-generate-001"),
  },

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
  sandboxImage: str("SANDBOX_IMAGE", "engenty-sandbox:latest"),
  sandboxEnabled: str("SANDBOX_ENABLED", "1") === "1",

  stripe: {
    secret: str("STRIPE_SECRET_KEY"),
    webhookSecret: str("STRIPE_WEBHOOK_SECRET"),
    pricePro: str("STRIPE_PRICE_PRO"),
    priceTopup: str("STRIPE_PRICE_TOPUP"),
  },
  turnstile: { siteKey: str("TURNSTILE_SITE_KEY"), secret: str("TURNSTILE_SECRET_KEY") },

  credits: {
    freeMonthly: num("CREDITS_FREE_MONTHLY", 500),
    proMonthly: num("CREDITS_PRO_MONTHLY", 3000),
    topup: num("CREDITS_TOPUP", 2000),
  },
  limits: {
    visitorRunsPerHour: num("LIMIT_VISITOR_RUNS_PER_HOUR", 6),
    defaultDailyRuns: num("LIMIT_DEFAULT_DAILY_RUNS", 50),
    /** End-user runs (no account) and their shared links are deleted after this many days. */
    resultTtlDays: num("RESULT_TTL_DAYS", 7),
  },
};

if (env.production) {
  const missing = ["BETTER_AUTH_SECRET", "APP_URL"].filter((k) => !process.env[k]?.trim());
  if (missing.length) {
    throw new Error(`Missing required environment in production: ${missing.join(", ")}`);
  }
}

export type Env = typeof env;
