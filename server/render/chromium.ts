import { type Browser, type BrowserContext, chromium } from "playwright-core";
import { env } from "../env.js";

/**
 * One Chromium for the whole server: the engenty-browser container over CDP when
 * `BROWSER_CDP_URL` is set, else a local headless Chrome. Every user of it opens
 * its own context, so runs never share cookies or storage.
 */
let browserPromise: Promise<Browser> | null = null;

async function connect(): Promise<Browser> {
  const browser = env.browserCdpUrl
    ? await chromium.connectOverCDP(env.browserCdpUrl)
    : await chromium.launch({
        executablePath: env.chromePath,
        headless: true,
        args: ["--no-sandbox", "--disable-dev-shm-usage", "--font-render-hinting=none"],
      });
  browser.on("disconnected", () => {
    browserPromise = null;
  });
  return browser;
}

export function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = connect().catch((err) => {
      browserPromise = null;
      throw err;
    });
  }
  return browserPromise;
}

export async function newContext(
  options: Parameters<Browser["newContext"]>[0] = {},
): Promise<BrowserContext> {
  const browser = await getBrowser();
  return browser.newContext({ viewport: { width: 1280, height: 900 }, ...options });
}

/**
 * A context for rendering generated HTML: every network request is refused. The HTML is
 * self-contained by design, and nothing it runs may reach the server's network.
 */
export async function offlineContext(
  options: Parameters<Browser["newContext"]>[0] = {},
): Promise<BrowserContext> {
  const context = await newContext({ javaScriptEnabled: true, ...options });
  await context.route("**/*", (route) => route.abort("blockedbyclient"));
  return context;
}

export async function closeBrowser() {
  const b = await browserPromise?.catch(() => null);
  browserPromise = null;
  await b?.close().catch(() => undefined);
}
