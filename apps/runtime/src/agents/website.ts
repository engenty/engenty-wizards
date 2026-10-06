import type { PluginWebPage } from "@engenty-wizards/plugin-sdk";
import { webContext } from "../render/chromium.js";
import { htmlToMarkdown } from "../render/convert.js";
import { safeFetch } from "../tools/net-guard.js";

/**
 * A web page as the project assistant needs it: its text, and what it says about the brand —
 * colours from its stylesheets, logo candidates, and the pages that carry address and VAT id.
 */
export interface WebsiteReading {
  url: string;
  status: number;
  title: string;
  description: string;
  text: string;
  brand: {
    themeColor: string | null;
    /** Colours the stylesheet names (`--primary: #…`), most telling first. */
    variables: { name: string; value: string }[];
    /** The colours used most, greys last. */
    frequent: string[];
    logos: { url: string; hint: string }[];
    images: { url: string; alt: string }[];
  };
  links: { url: string; text: string }[];
}

const UA = { "user-agent": "Mozilla/5.0 (compatible; engenty-wizards/0.1)" };

const attr = (tag: string, name: string) =>
  tag
    .match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"))
    ?.slice(2)
    .find(Boolean) ?? "";

function absolute(href: string, base: string): string | null {
  try {
    const url = new URL(href.trim(), base);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function hex(value: string): string | null {
  const v = value.trim().toLowerCase();
  const short = v.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/);
  if (short) {
    return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`;
  }
  if (/^#[0-9a-f]{6}$/.test(v)) {
    return v;
  }
  if (/^#[0-9a-f]{8}$/.test(v)) {
    return v.slice(0, 7);
  }
  const rgb = v.match(/^rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})/);
  if (rgb) {
    return `#${rgb
      .slice(1, 4)
      .map((n) => Math.min(255, Number(n)).toString(16).padStart(2, "0"))
      .join("")}`;
  }
  return null;
}

/** How far a colour is from grey, 0–255. */
function chroma(color: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(color.slice(i, i + 2), 16));
  return Math.max(r, g, b) - Math.min(r, g, b);
}

function coloursOf(css: string) {
  const variables: { name: string; value: string }[] = [];
  for (const m of css.matchAll(/(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{3,8}|rgba?\([^)]*\))/g)) {
    const value = hex(m[2]);
    if (value && !variables.some((v) => v.name === m[1])) {
      variables.push({ name: m[1], value });
    }
  }
  const counts = new Map<string, number>();
  for (const m of css.matchAll(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g)) {
    const value = hex(m[0]);
    if (value) {
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
  }
  const telling = /brand|primary|accent|main|theme|secondary|highlight|cta|link/i;
  return {
    variables: variables
      .sort((a, b) => Number(telling.test(b.name)) - Number(telling.test(a.name)))
      .slice(0, 24),
    frequent: [...counts.entries()]
      .sort((a, b) => Number(chroma(b[0]) > 24) - Number(chroma(a[0]) > 24) || b[1] - a[1])
      .slice(0, 12)
      .map(([value]) => value),
  };
}

async function stylesheet(url: string, signal?: AbortSignal): Promise<string> {
  try {
    const res = await safeFetch(url, {
      headers: UA,
      signal: AbortSignal.any([AbortSignal.timeout(10_000), ...(signal ? [signal] : [])]),
    });
    return res.ok ? (await res.text()).slice(0, 400_000) : "";
  } catch {
    return "";
  }
}

/** The page as a browser shows it, for sites that write their text with scripts. */
async function rendered(url: string): Promise<string | null> {
  try {
    const context = await webContext();
    try {
      const page = await context.newPage();
      await page.goto(url, { waitUntil: "networkidle", timeout: 25_000 }).catch(() => undefined);
      return await page.content();
    } finally {
      await context.close();
    }
  } catch {
    return null;
  }
}

/** A page's HTML, drawn in a browser when it has hardly any text without its scripts. */
async function loadPage(raw: string, signal?: AbortSignal) {
  const res = await safeFetch(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`, {
    headers: UA,
    signal: AbortSignal.any([AbortSignal.timeout(20_000), ...(signal ? [signal] : [])]),
  });
  const base = res.url;
  let html = (await res.text()).slice(0, 1_500_000);
  // Hardly any text in the page as sent: it is written in the browser.
  if (res.ok && htmlToMarkdown(html).replace(/\s+/g, " ").length < 500) {
    html = ((await rendered(base)) ?? html).slice(0, 1_500_000);
  }
  return { res, base, html };
}

const tagsOf = (html: string, name: string) =>
  [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, "gi"))].map((m) => m[0]);

/** A `<meta>` by its name or property. */
function metaOf(html: string, key: string): string {
  const tag = tagsOf(html, "meta").find((t) =>
    [attr(t, "name"), attr(t, "property")].some((v) => v.toLowerCase() === key),
  );
  return tag ? attr(tag, "content") : "";
}

const titleOf = (html: string) =>
  html
    .match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
    .replace(/\s+/g, " ")
    .trim() ?? "";

/** The text of a link, as a reader sees it. */
const linkText = (inner: string) =>
  inner
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);

/**
 * A page for a plugin (`server.web.read`): its whole text as Markdown and every link, as against
 * `readWebsite`, which picks what the assistant needs of a company's site.
 */
export async function readPage(raw: string, signal?: AbortSignal): Promise<PluginWebPage> {
  const { res, base, html } = await loadPage(raw, signal);
  const links: { url: string; text: string }[] = [];
  for (const m of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const url = absolute(attr(`<a ${m[1]}>`, "href"), base)?.replace(/#.*$/, "");
    if (url && !links.some((l) => l.url === url) && links.length < 2000) {
      links.push({ url, text: linkText(m[2]) });
    }
  }
  return {
    url: base,
    status: res.status,
    etag: res.headers.get("etag"),
    lastModified: res.headers.get("last-modified"),
    title: titleOf(html),
    description: metaOf(html, "description") || metaOf(html, "og:description"),
    text: htmlToMarkdown(html).slice(0, 400_000),
    links,
  };
}

export async function readWebsite(raw: string, signal?: AbortSignal): Promise<WebsiteReading> {
  const { res, base, html } = await loadPage(raw, signal);
  const tags = (name: string) => tagsOf(html, name);
  const meta = (key: string) => metaOf(html, key);

  const logos: { url: string; hint: string }[] = [];
  const addLogo = (href: string, hint: string) => {
    const url = absolute(href, base);
    if (url && !logos.some((l) => l.url === url)) {
      logos.push({ url, hint });
    }
  };
  const images: { url: string; alt: string }[] = [];
  for (const tag of tags("img")) {
    const src = attr(tag, "src") || attr(tag, "data-src");
    const alt = attr(tag, "alt");
    if (!src || src.startsWith("data:")) {
      continue;
    }
    if (/logo/i.test(`${src} ${alt} ${attr(tag, "class")} ${attr(tag, "id")}`)) {
      addLogo(src, `image on the page${alt ? `, alt "${alt}"` : ""}`);
    } else {
      const url = absolute(src, base);
      if (url && images.length < 12 && !images.some((i) => i.url === url)) {
        images.push({ url, alt });
      }
    }
  }
  for (const tag of tags("link")) {
    const rel = attr(tag, "rel").toLowerCase();
    if (/apple-touch-icon|mask-icon|(^|\s)icon/.test(rel)) {
      addLogo(attr(tag, "href"), `${rel} ${attr(tag, "sizes")}`.trim());
    }
  }
  const og = meta("og:image");
  if (og) {
    const url = absolute(og, base);
    if (url) {
      images.unshift({ url, alt: "share image (og:image)" });
    }
  }

  const sheets = tags("link")
    .filter((t) => /stylesheet/i.test(attr(t, "rel")))
    .map((t) => absolute(attr(t, "href"), base))
    .filter((u): u is string => Boolean(u))
    .slice(0, 4);
  const inline = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]);
  const styled = [...html.matchAll(/\bstyle\s*=\s*"([^"]*)"/gi)].map((m) => m[1]);
  const css = [
    ...inline,
    ...styled,
    ...(await Promise.all(sheets.map((s) => stylesheet(s, signal)))),
  ].join("\n");

  const host = new URL(base).hostname;
  const links: { url: string; text: string }[] = [];
  for (const m of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const url = absolute(attr(`<a ${m[1]}>`, "href"), base);
    const text = linkText(m[2]).slice(0, 60);
    if (
      url &&
      new URL(url).hostname === host &&
      /impressum|imprint|kontakt|contact|about|ueber|über|team|legal|unternehmen|company/i.test(
        `${url} ${text}`,
      ) &&
      !links.some((l) => l.url === url)
    ) {
      links.push({ url, text });
    }
  }

  const text = htmlToMarkdown(html);
  return {
    url: base,
    status: res.status,
    title: html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1].trim() ?? "",
    description: meta("description") || meta("og:description"),
    text:
      text.length > 9000
        ? `${text.slice(0, 9000)}\n…[${text.length - 9000} more characters]`
        : text,
    brand: {
      themeColor: hex(meta("theme-color")),
      ...coloursOf(css),
      logos: logos.slice(0, 10),
      images,
    },
    links: links.slice(0, 10),
  };
}
