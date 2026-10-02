import { anthropic } from "@ai-sdk/anthropic";
import { createTool } from "@mastra/core/tools";
import { MCPClient } from "@mastra/mcp";
import { z } from "zod";
import type { AgentStep } from "../../shared/definition.js";
import type { AssetRef } from "../../shared/run.js";
import { isTextMime } from "../../shared/workspace.js";
import type { StepContext } from "../engine/types.js";
import { env } from "../env.js";
import { generateImageMedia } from "../media/generate.js";
import { gatewayTools } from "../models.js";
import { htmlToMarkdown } from "../render/convert.js";
import { snapshotFile } from "../services/files.js";
import { assertPublicUrl, safeFetch } from "./net-guard.js";

const TEXT_LIMIT = 8000;

function clip(s: string, limit = TEXT_LIMIT): string {
  return s.length > limit ? `${s.slice(0, limit)}\n…[truncated ${s.length - limit} chars]` : s;
}

export interface StepTools {
  tools: Record<string, any>;
  /** Assets the tools made during the step (screenshots, images, exported files). */
  assets: AssetRef[];
  close(): Promise<void>;
}

/** The tools an agent step may use: exactly what its definition allowlists. */
export async function buildStepTools(
  step: AgentStep,
  ctx: StepContext,
  modelRef: string,
): Promise<StepTools> {
  const tools: Record<string, any> = {};
  const assets: AssetRef[] = [];
  const allowed = new Set(step.tools);
  let mcp: MCPClient | null = null;

  if (allowed.has("web_search")) {
    const vendor = modelRef.replace(/^[a-z]+:/, "").split("/")[0];
    const gw = gatewayTools();
    if (vendor === "anthropic") {
      tools.web_search = anthropic.tools.webSearch_20250305({ maxUses: 8 });
    } else if (gw) {
      tools.web_search = gw.perplexitySearch({ maxResults: 8 });
    }
  }

  if (allowed.has("web_fetch") || allowed.has("web_search")) {
    tools.web_fetch = createTool({
      id: "web_fetch",
      description: "Fetch a public web page or file and return its readable text (Markdown).",
      inputSchema: z.object({ url: z.string().describe("Absolute http(s) URL") }),
      execute: async ({ url }) => {
        const safe = await assertPublicUrl(url);
        await ctx.emit("tool", `Liest ${safe.hostname}`);
        const res = await safeFetch(safe.toString(), {
          signal: AbortSignal.any([ctx.signal, AbortSignal.timeout(20_000)]),
          headers: { "user-agent": "Mozilla/5.0 (compatible; engenty-wizards/0.1)" },
        });
        const type = res.headers.get("content-type") ?? "";
        const body = await res.text();
        const text = type.includes("html") ? htmlToMarkdown(body) : body;
        return { status: res.status, url: res.url, content: clip(text) };
      },
    });
  }

  if (allowed.has("http")) {
    tools.http_request = createTool({
      id: "http_request",
      description: "Call a public HTTP API. Use for REST endpoints the instructions name.",
      inputSchema: z.object({
        method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).default("GET"),
        url: z.string(),
        headers: z.record(z.string(), z.string()).optional(),
        json: z.unknown().optional().describe("JSON body"),
      }),
      execute: async ({ method, url, headers, json }) => {
        const safe = await assertPublicUrl(url);
        await ctx.emit("tool", `${method} ${safe.hostname}${safe.pathname}`);
        const res = await safeFetch(safe.toString(), {
          method,
          signal: AbortSignal.any([ctx.signal, AbortSignal.timeout(30_000)]),
          headers: {
            ...(json !== undefined ? { "content-type": "application/json" } : {}),
            ...headers,
          },
          body: json !== undefined ? JSON.stringify(json) : undefined,
        });
        return { status: res.status, body: clip(await res.text(), 8000) };
      },
    });
  }

  if (allowed.has("browser")) {
    const snapshot = async () => {
      const page = await ctx.resources.browserPage();
      const data = await page.evaluate(() => {
        const els = Array.from(
          document.querySelectorAll<HTMLElement>(
            "a[href], button, input, textarea, select, [role=button], [role=link], [contenteditable=true]",
          ),
        ).filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        });
        const items = els.slice(0, 80).map((el, i) => {
          el.setAttribute("data-wz-ref", String(i));
          const label =
            el.getAttribute("aria-label") ||
            (el as HTMLInputElement).placeholder ||
            el.innerText ||
            (el as HTMLInputElement).value ||
            el.getAttribute("name") ||
            "";
          return `[${i}] ${el.tagName.toLowerCase()} ${label.trim().replace(/\s+/g, " ").slice(0, 80)}`;
        });
        return { text: document.body?.innerText ?? "", items };
      });
      return {
        url: page.url(),
        title: await page.title(),
        text: clip(data.text, 8000),
        elements: data.items.join("\n"),
      };
    };
    tools.browser_open = createTool({
      id: "browser_open",
      description:
        "Open a URL in the browser and return its text plus numbered interactive elements.",
      inputSchema: z.object({ url: z.string() }),
      execute: async ({ url }) => {
        const safe = await assertPublicUrl(url);
        await ctx.emit("tool", `Öffnet ${safe.hostname}`);
        const page = await ctx.resources.browserPage();
        await page.goto(safe.toString(), { waitUntil: "domcontentloaded", timeout: 30_000 });
        await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => undefined);
        return snapshot();
      },
    });
    tools.browser_click = createTool({
      id: "browser_click",
      description: "Click an element by its [number] from the last snapshot.",
      inputSchema: z.object({ ref: z.number() }),
      execute: async ({ ref }) => {
        const page = await ctx.resources.browserPage();
        await ctx.emit("tool", "Klickt im Browser");
        await page.locator(`[data-wz-ref="${ref}"]`).first().click({ timeout: 10_000 });
        await page.waitForLoadState("domcontentloaded", { timeout: 10_000 }).catch(() => undefined);
        if (page.url()) {
          await assertPublicUrl(page.url());
        }
        return snapshot();
      },
    });
    tools.browser_type = createTool({
      id: "browser_type",
      description: "Type text into an input by its [number]; set submit to press Enter afterwards.",
      inputSchema: z.object({ ref: z.number(), text: z.string(), submit: z.boolean().optional() }),
      execute: async ({ ref, text, submit }) => {
        const page = await ctx.resources.browserPage();
        await ctx.emit("tool", "Tippt im Browser");
        const el = page.locator(`[data-wz-ref="${ref}"]`).first();
        await el.fill(text, { timeout: 10_000 });
        if (submit) {
          await el.press("Enter");
          await page
            .waitForLoadState("domcontentloaded", { timeout: 10_000 })
            .catch(() => undefined);
        }
        return snapshot();
      },
    });
    tools.browser_screenshot = createTool({
      id: "browser_screenshot",
      description: "Save a screenshot of the current page as a result image for the person.",
      inputSchema: z.object({ name: z.string().optional() }),
      execute: async ({ name }) => {
        const page = await ctx.resources.browserPage();
        const png = await page.screenshot({ type: "png" });
        const ref = await ctx.saveAsset({
          kind: "image",
          mime: "image/png",
          name: name ?? "screenshot.png",
          data: png,
        });
        assets.push(ref);
        return { saved: true, assetId: ref.id };
      },
    });
  }

  if (allowed.has("sandbox") && env.sandboxEnabled) {
    tools.run_command = createTool({
      id: "run_command",
      description:
        "Run a shell command in a private Linux sandbox (python3, node, bun, uv, jq, curl). Working directory /workspace.",
      inputSchema: z.object({ command: z.string(), timeoutSeconds: z.number().optional() }),
      execute: async ({ command, timeoutSeconds }) => {
        await ctx.emit("tool", `Führt aus: ${command.slice(0, 80)}`);
        const sandbox = await ctx.resources.sandboxHandle();
        const result = await sandbox.executeCommand!(command, [], {
          timeout: Math.min((timeoutSeconds ?? 120) * 1000, 600_000),
        });
        return {
          exitCode: result.exitCode,
          stdout: clip(result.stdout, 8000),
          stderr: clip(result.stderr, 4000),
        };
      },
    });
    tools.export_file = createTool({
      id: "export_file",
      description:
        "Hand a file from the sandbox to the person as a result (e.g. a chart PNG, a CSV).",
      inputSchema: z.object({
        path: z.string(),
        mime: z.string().describe("e.g. image/png, text/csv"),
      }),
      execute: async ({ path, mime }) => {
        const sandbox = await ctx.resources.sandboxHandle();
        const result = await sandbox.executeCommand!(`base64 -w0 ${JSON.stringify(path)}`, []);
        if (result.exitCode !== 0) {
          return { error: result.stderr || "file not found" };
        }
        const bytes = Buffer.from(result.stdout.trim(), "base64");
        const ref = await ctx.saveAsset({
          kind: mime.startsWith("image/") ? "image" : "file",
          mime,
          name: path.split("/").pop() ?? "file",
          data: bytes,
        });
        assets.push(ref);
        return { saved: true, assetId: ref.id };
      },
    });
  }

  if (allowed.has("image")) {
    tools.generate_image = createTool({
      id: "generate_image",
      description: "Draw an image from a detailed visual prompt. The image is shown to the person.",
      inputSchema: z.object({
        prompt: z.string(),
        aspectRatio: z.enum(["1:1", "16:9", "9:16", "4:5", "3:2", "2:3"]).optional(),
      }),
      execute: async ({ prompt, aspectRatio }) => {
        await ctx.emit("tool", "Zeichnet ein Bild");
        const media = await generateImageMedia({
          model: env.models.image,
          prompt,
          aspectRatio,
          abortSignal: ctx.signal,
        });
        await ctx.chargeUsd(media.costUsd, "image");
        const ref = await ctx.saveAsset({
          kind: "image",
          mime: media.mime,
          name: "image.png",
          data: media.bytes,
        });
        assets.push(ref);
        return { saved: true, assetId: ref.id };
      },
    });
  }

  // The wizard's workspace (reference data, price lists, templates) is always readable.
  if (ctx.files.length) {
    tools.read_workspace_file = createTool({
      id: "read_workspace_file",
      description: `Read a file from the wizard's workspace. Files: ${ctx.files
        .slice(0, 60)
        .map((f) => f.path)
        .join(", ")}`,
      inputSchema: z.object({ path: z.string() }),
      execute: async ({ path }) => {
        const found = await snapshotFile(ctx.files, path);
        if (!found) {
          return { error: `No file ${path}` };
        }
        return isTextMime(found.file.mime)
          ? { path, text: clip(found.data.toString("utf8"), 40_000) }
          : { path, mime: found.file.mime, size: found.file.size, note: "binary file" };
      },
    });
  }

  const servers = ctx.project.mcpServers.filter((s) => step.mcp?.includes(s.id));
  if (servers.length) {
    mcp = new MCPClient({
      id: `run-${ctx.runId}-${step.id}`,
      servers: Object.fromEntries(
        servers.map((s) => [
          s.id,
          { url: new URL(s.url), requestInit: { headers: s.headers ?? {} }, timeout: 60_000 },
        ]),
      ),
    });
    try {
      Object.assign(tools, await mcp.listTools());
      await ctx.emit("tool", `Verbunden mit ${servers.map((s) => s.name).join(", ")}`);
    } catch (err) {
      await ctx.emit("info", `MCP-Server nicht erreichbar: ${(err as Error).message}`);
    }
  }

  return {
    tools,
    assets,
    close: async () => {
      await mcp?.disconnect().catch(() => undefined);
    },
  };
}
