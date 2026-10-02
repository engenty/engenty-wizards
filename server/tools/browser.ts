import { readFile } from "node:fs/promises";
import { createTool } from "@mastra/core/tools";
import type { Page } from "playwright-core";
import { z } from "zod";
import type { AssetRef } from "../../shared/run.js";
import type { StepContext } from "../engine/types.js";
import { assertPublicUrl } from "./net-guard.js";
import { attempt, clip, type FileKeeper } from "./shared.js";

const ref = (n: number) => `[data-wz-ref="${n}"]`;

/** The page as an agent reads it: its text and its interactive elements, numbered. */
export async function pageSnapshot(page: Page) {
  const data = await page.evaluate(() => {
    const els = Array.from(
      document.querySelectorAll<HTMLElement>(
        "a[href], button, input, textarea, select, [role=button], [role=link], [contenteditable=true]",
      ),
    ).filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && (el as HTMLInputElement).type !== "hidden";
    });
    for (const old of Array.from(document.querySelectorAll("[data-wz-ref]"))) {
      old.removeAttribute("data-wz-ref");
    }
    const items = els.slice(0, 120).map((el, i) => {
      el.setAttribute("data-wz-ref", String(i));
      const input = el as HTMLInputElement;
      const label =
        el.getAttribute("aria-label") ||
        input.placeholder ||
        (input.type === "password" ? "" : el.innerText || input.value) ||
        el.getAttribute("name") ||
        "";
      const tag = el.tagName.toLowerCase();
      const kind = tag === "input" ? `input(${input.type || "text"})` : tag;
      return `[${i}] ${kind} ${label.trim().replace(/\s+/g, " ").slice(0, 80)}`;
    });
    return { text: document.body?.innerText ?? "", items };
  });
  return {
    url: page.url(),
    title: await page.title(),
    text: clip(data.text, 6000),
    elements: data.items.join("\n"),
  };
}

function originOf(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.origin : null;
  } catch {
    return null;
  }
}

/** A wait that timed out is a rejection, so waits can be raced. */
function found<T>(wait: Promise<T>): Promise<T> {
  const p = wait.then((v) => v ?? Promise.reject(new Error("none")));
  p.catch(() => undefined);
  return p;
}

const settle = (page: Page) =>
  page.waitForLoadState("domcontentloaded", { timeout: 10_000 }).catch(() => undefined);

const credentialField = z.object({
  ref: z.number().describe("The field's [number] from your latest page snapshot."),
  label: z.string().min(1).max(60).describe("What the person sees, e.g. E-Mail."),
  kind: z
    .enum(["username", "password", "otp", "text"])
    .describe("password only fills a password input."),
});

type FillError = "origin_changed" | "field_missing" | "not_an_input" | "not_a_password_field";

/**
 * Types the person's values into the page. A password goes only into a password input, and
 * only while the page is still the site the person was shown. Failures are codes: a browser
 * error message could quote the value it failed to type.
 */
async function fillCredentials(
  page: Page,
  origin: string,
  fields: z.infer<typeof credentialField>[],
  values: Record<string, string>,
): Promise<{ filled: string[] } | { error: FillError | "fill_failed" }> {
  if (originOf(page.url()) !== origin) {
    return { error: "origin_changed" };
  }
  const filled: string[] = [];
  for (const [index, field] of fields.entries()) {
    const value = values[`field_${index + 1}`];
    if (typeof value !== "string" || !value) {
      continue;
    }
    const locator = page.locator(ref(field.ref)).first();
    const element = await locator
      .evaluate(
        (el) => ({ tag: el.tagName, type: (el as HTMLInputElement).type ?? "" }),
        undefined,
        {
          timeout: 5000,
        },
      )
      .catch(() => null);
    if (!element) {
      return { error: "field_missing" };
    }
    if (element.tag !== "INPUT" && element.tag !== "TEXTAREA") {
      return { error: "not_an_input" };
    }
    if (field.kind === "password" && element.type !== "password") {
      return { error: "not_a_password_field" };
    }
    try {
      await locator.fill(value, { timeout: 10_000 });
    } catch {
      return { error: "fill_failed" };
    }
    filled.push(field.label);
  }
  return { filled };
}

const NOBODY =
  "Nobody is at the keyboard for this run, so a sign-in cannot be asked for. Go on without it and report what the person has to do.";
const DECLINED =
  "The person did not sign in. Do not ask again for this site; go on without it and say in your result what is missing and what the person can do.";

export function browserTools(ctx: StepContext, assets: AssetRef[], files: FileKeeper) {
  const page = () => ctx.resources.browserPage();
  const tools: Record<string, any> = {};

  tools.browser_open = createTool({
    id: "browser_open",
    description:
      "Open a URL in the browser and return its text plus numbered interactive elements. Sites the person signed in to on an earlier run may still be signed in.",
    inputSchema: z.object({ url: z.string() }),
    execute: ({ url }) =>
      attempt(async () => {
        const safe = await assertPublicUrl(url);
        await ctx.emit("tool", `Öffnet ${safe.hostname}`);
        const p = await page();
        await p.goto(safe.toString(), { waitUntil: "domcontentloaded", timeout: 30_000 });
        await p.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => undefined);
        return pageSnapshot(p);
      }),
  });

  tools.browser_click = createTool({
    id: "browser_click",
    description: "Click an element by its [number] from the last snapshot.",
    inputSchema: z.object({ ref: z.number() }),
    execute: ({ ref: n }) =>
      attempt(async () => {
        const p = await page();
        await ctx.emit("tool", "Klickt im Browser");
        const popup = p
          .context()
          .waitForEvent("page", { timeout: 3000 })
          .catch(() => null);
        await p.locator(ref(n)).first().click({ timeout: 10_000 });
        const opened = await popup;
        if (opened) {
          ctx.resources.adopt(opened);
          await settle(opened);
          return pageSnapshot(opened);
        }
        await settle(p);
        return pageSnapshot(p);
      }),
  });

  tools.browser_type = createTool({
    id: "browser_type",
    description:
      "Type text into an input by its [number]; set submit to press Enter afterwards. Never for passwords or codes — those the person enters through browser_request_credentials.",
    inputSchema: z.object({ ref: z.number(), text: z.string(), submit: z.boolean().optional() }),
    execute: ({ ref: n, text, submit }) =>
      attempt(async () => {
        const p = await page();
        await ctx.emit("tool", "Tippt im Browser");
        const el = p.locator(ref(n)).first();
        await el.fill(text, { timeout: 10_000 });
        if (submit) {
          await el.press("Enter");
          await settle(p);
        }
        return pageSnapshot(p);
      }),
  });

  tools.browser_screenshot = createTool({
    id: "browser_screenshot",
    description:
      "Look at the current page: returns a picture of it to you. Use it when the text snapshot is not enough (charts, a layout you cannot make sense of, a captcha or cookie wall). Set save to also hand the picture to the person as part of the result.",
    inputSchema: z.object({ save: z.boolean().optional(), name: z.string().optional() }),
    execute: ({ save, name }) =>
      attempt(async () => {
        const p = await page();
        await ctx.emit("tool", "Sieht sich die Seite an");
        const png = await p.screenshot({ type: "png" });
        let saved: string | undefined;
        if (save) {
          const asset = await ctx.saveAsset({
            kind: "image",
            mime: "image/png",
            name: name ?? "screenshot.png",
            data: png,
          });
          assets.push(asset);
          saved = asset.id;
        }
        return { url: p.url(), saved, screenshot: Buffer.from(png).toString("base64") };
      }),
    toModelOutput: (out: any) => {
      if (!out?.screenshot) {
        return { type: "json", value: out };
      }
      const { screenshot, ...rest } = out;
      return {
        type: "content",
        value: [
          { type: "text", text: JSON.stringify(rest) },
          { type: "image-data", data: screenshot, mediaType: "image/png" },
        ],
      };
    },
  });

  const handOver = async (input: {
    reason: string;
    fields: z.infer<typeof credentialField>[];
    submitRef?: number;
  }) => {
    const p = await page();
    const origin = originOf(p.url());
    if (!origin) {
      return { error: "no_site", note: "Open the site's sign-in page first." };
    }
    for (const field of input.fields) {
      if (!(await p.locator(ref(field.ref)).count())) {
        return {
          error: "fields_not_found",
          note: `[${field.ref}] is not on the page any more. Open or re-read the page and ask again with its numbers.`,
        };
      }
    }
    await ctx.emit("tool", `Wartet auf deine Anmeldung bei ${new URL(origin).hostname}`);
    const answer = await ctx.ask({
      kind: "login",
      reason: input.reason,
      site: { host: new URL(origin).hostname, title: await p.title() },
      fields: input.fields.map((f, i) => ({
        id: `field_${i + 1}`,
        label: f.label,
        secret: f.kind === "password",
      })),
    });
    if (!answer) {
      return { status: "needs_person", note: NOBODY };
    }
    if (answer.type === "skip" || answer.type === "timeout") {
      return { status: "declined", note: DECLINED };
    }
    // The person may have gone on in a tab the site opened.
    const current = ctx.resources.openPage() ?? p;
    let note = "The person signed in on the page themselves.";
    if (answer.type === "fill") {
      const result = await fillCredentials(current, origin, input.fields, answer.values);
      if ("error" in result) {
        return {
          error: result.error,
          note: "Nothing you can read was entered. Re-read the page and ask again with its current numbers.",
        };
      }
      if (result.filled.length && input.submitRef !== undefined) {
        await current
          .locator(ref(input.submitRef))
          .first()
          .click({ timeout: 10_000 })
          .catch(() => undefined);
      }
      await settle(current);
      await current.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => undefined);
      note = `The person entered ${result.filled.join(", ")} straight into the page${input.submitRef !== undefined ? " and it was submitted" : ""}. You do not see what they typed and must not try to read it back.`;
    }
    if (answer.remember) {
      await ctx.resources.keepSession().catch(() => undefined);
    }
    return { status: "done", note, page: await pageSnapshot(current) };
  };

  tools.browser_request_credentials = createTool({
    id: "browser_request_credentials",
    description:
      "THE way to get a login into a page: ask the person to enter a username, e-mail, password or one-time code into fields on your current page, WITHOUT you seeing it. The person gets a picture of the page, the site's address and a form; what they type goes straight into the page, never to you. Give each field's [number] from your latest snapshot, and submit_ref to press the sign-in or next button afterwards. A login spread over several pages (e-mail, then password, then code) is one call per page. WAITS for the person. Never ask for a password any other way.",
    inputSchema: z.object({
      reason: z
        .string()
        .min(1)
        .max(300)
        .describe("One sentence for the person, in their language: which site and why."),
      fields: z.array(credentialField).min(1).max(4),
      submit_ref: z
        .number()
        .optional()
        .describe("[number] of the button to press once the fields are filled."),
    }),
    execute: ({ reason, fields, submit_ref }) =>
      attempt(() => handOver({ reason, fields, submitRef: submit_ref })),
  });

  tools.browser_request_user = createTool({
    id: "browser_request_user",
    description:
      "Hand the page to the person for something no form can do: a captcha, 'continue with Google', a passkey, a cookie wall you cannot get past. They click and type in a picture of the page and say when they are done. For a plain login form use browser_request_credentials instead. WAITS for the person.",
    inputSchema: z.object({
      reason: z
        .string()
        .min(1)
        .max(300)
        .describe("One sentence for the person, in their language: what to do on the page."),
    }),
    execute: ({ reason }) => attempt(() => handOver({ reason, fields: [] })),
  });

  tools.browser_download = createTool({
    id: "browser_download",
    description:
      "Download a file (an invoice PDF, an export) with the browser's sign-in and keep it: click the element with this [number], or fetch this URL. The file is stored under `path` in the wizard's files and added to this step's result.",
    inputSchema: z.object({
      ref: z.number().optional().describe("[number] of the download link or button."),
      url: z.string().optional().describe("Direct URL of the file, instead of ref."),
      path: z
        .string()
        .describe("Where to keep it, e.g. invoices/2026-09/2026-09-03_Notion_INV-123.pdf"),
      source: z.string().optional().describe("Where it came from, in words, for the person."),
    }),
    execute: ({ ref: n, url, path, source }) =>
      attempt(async () => {
        const p = await page();
        await ctx.emit("tool", `Lädt ${path.split("/").pop()} herunter`);
        let data: Buffer;
        let mime: string | undefined;
        if (url) {
          const safe = await assertPublicUrl(new URL(url, p.url()).toString());
          const res = await p.context().request.get(safe.toString(), { timeout: 60_000 });
          if (!res.ok()) {
            return { error: `The server answered ${res.status()}.` };
          }
          data = await res.body();
          mime = res.headers()["content-type"]?.split(";")[0];
        } else if (n !== undefined) {
          // A click may start a download, open the file in a new tab, or both.
          const download = found(p.waitForEvent("download", { timeout: 12_000 }));
          const popup = found(p.context().waitForEvent("page", { timeout: 5000 }));
          await p.locator(ref(n)).first().click({ timeout: 10_000 });
          const opened = await Promise.race([popup, download.then(() => null)]).catch(() => null);
          const got = await Promise.any([
            download,
            ...(opened ? [found(opened.waitForEvent("download", { timeout: 8000 }))] : []),
          ]).catch(() => null);
          if (got) {
            data = await readFile(await got.path());
            await opened?.close().catch(() => undefined);
          } else {
            // No download event: the click opened the file in a tab (a PDF viewer).
            const target = opened ?? p;
            await settle(target);
            const res = await p.context().request.get(target.url(), { timeout: 60_000 });
            mime = res.headers()["content-type"]?.split(";")[0];
            if (!res.ok() || mime === "text/html") {
              await opened?.close().catch(() => undefined);
              return {
                error: "The click did not give a file.",
                page: await pageSnapshot(p),
              };
            }
            data = await res.body();
            await opened?.close().catch(() => undefined);
          }
        } else {
          return { error: "Give ref or url." };
        }
        if (mime === "text/html") {
          return { error: "That is a web page, not a file — you may not be signed in." };
        }
        const kept = await files.keep(path, data, {
          mime,
          source: source ?? `Download von ${new URL(p.url()).hostname}`,
        });
        return { saved: kept.path, mime: kept.mime, size: kept.size };
      }),
  });

  return tools;
}
