// What an agent step reads of a page, against a real Chromium: a cookie banner's controls come
// first, a value the person typed is never read out, and a click on something the banner covers
// is refused with the banner's name. Skips where no Chrome is installed.
import { existsSync } from "node:fs";
import type { Browser, Page } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  MARK_FOCUSED_PERSONAL,
  PAGE_SCRIPT,
  PERSONAL,
  type PageView,
  targetScript,
} from "../../src/browser/snapshot.js";

const CHROME_PATHS = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
];
const chromePath =
  process.env.ENGENTY_TEST_CHROME_PATH ?? CHROME_PATHS.find((p) => existsSync(p));

const links = Array.from({ length: 200 }, (_, i) => `<a href="#${i}">Link ${i}</a>`).join(" ");
const HTML = `<!doctype html><html><head><title>Shop</title></head><body>
<nav>${links}</nav>
<input id="search" aria-label="Suche" value="lego">
<input id="email" aria-label="E-Mail">
<input id="pw" type="password" aria-label="Passwort">
<select id="sort" aria-label="Sortieren"><option>Relevanz</option><option>Preis</option></select>
<button id="buy">Kaufen</button>
<div id="onetrust-banner-sdk" style="position:fixed;inset:auto 0 0 0;height:100vh;background:#fff">
  <p>Deine Privatsphäre</p>
  <button>Alle zulassen</button><button>Nur notwendige</button>
</div>
</body></html>`;

describe.skipIf(!chromePath)("an agent step's reading of a page", () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    const { chromium } = await import("playwright-core");
    browser = await chromium.launch({ executablePath: chromePath, headless: true });
    page = await browser.newPage({ viewport: { height: 800, width: 1200 } });
    await page.setContent(HTML);
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
  });

  const read = () => page.evaluate<PageView>(PAGE_SCRIPT);

  it("lists the banner first, past a long page", async () => {
    const view = await read();
    expect(view.items.slice(0, 2).map((i) => [i.label, i.dialog])).toEqual([
      ["Alle zulassen", true],
      ["Nur notwendige", true],
    ]);
    expect(view.omitted).toBeGreaterThan(0);
  });

  it("refuses a click on what the banner covers, and names it", async () => {
    const view = await read();
    const buy = view.items.find((i) => i.label === "Kaufen");
    // Past the cut of 150 controls: read the id the page handed out anyway.
    const ref =
      buy?.ref ??
      (await page.evaluate<number>(
        `(() => { ${PAGE_SCRIPT}; const c=window.__jevFast; for (const [id,e] of c.nodes) if (e.id==='buy') return id; return -1; })()`,
      ));
    const target = await page.evaluate<{ error?: string; by?: string }>(targetScript(ref));
    expect(target.error).toBe("covered");
    expect(target.by).toContain("Privatsphäre");
  });

  it("never reads out what the person typed, nor a password", async () => {
    await page.evaluate(
      `document.getElementById('onetrust-banner-sdk').remove(); document.querySelector('nav').remove()`,
    );
    await page.focus("#email");
    await page.evaluate(MARK_FOCUSED_PERSONAL);
    await page.keyboard.type("ada@example.test");
    await page.fill("#pw", "secret");
    const view = await page.evaluate<PageView>(PAGE_SCRIPT);
    const byLabel = (label: string) => view.items.find((i) => i.label === label);
    expect(byLabel("Suche")?.value).toBe("lego");
    expect(byLabel("E-Mail")?.value).toBe(PERSONAL);
    expect(byLabel("Passwort")).toMatchObject({ kind: "password", value: PERSONAL });
    expect(byLabel("Sortieren")).toMatchObject({
      kind: "select",
      value: "Relevanz",
      options: ["Relevanz", "Preis"],
    });
    expect(JSON.stringify(view)).not.toContain("ada@example.test");
    expect(JSON.stringify(view)).not.toContain("secret");
  });
});
