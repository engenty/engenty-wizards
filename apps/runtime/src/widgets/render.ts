import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Page } from "playwright-core";
import { env } from "../env.js";
import { offlineContext } from "../render/chromium.js";

export interface WidgetSize {
  width: number;
  height: number;
}

const FPS = 25;
const MAX_SECONDS = 60;

/** Exports set `wizard.mode` to "export" so the widget hides its controls and does not autoplay. */
function forExport(html: string): string {
  return html.replace(
    '<script type="application/json" id="wizard-payload">',
    '<script>window.__WIZARD_EXPORT=true</script><script type="application/json" id="wizard-payload">',
  );
}

async function withWidget<T>(
  html: string,
  size: WidgetSize,
  scale: number,
  use: (page: Page, errors: string[]) => Promise<T>,
): Promise<T> {
  const context = await offlineContext({
    viewport: { width: size.width, height: size.height },
    deviceScaleFactor: scale,
  });
  const errors: string[] = [];
  try {
    const page = await context.newPage();
    page.on("pageerror", (err) => errors.push(err.message));
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        errors.push(msg.text());
      }
    });
    await page.setContent(forExport(html), { waitUntil: "load", timeout: 30_000 });
    // A widget calls wizard.ready() after its first frame; one that never does gets 3 seconds.
    await page.evaluate(() =>
      Promise.race([(window as any).wizard?.__ready, new Promise((r) => setTimeout(r, 3000))]),
    );
    return await use(page, errors);
  } finally {
    await context.close();
  }
}

async function timelineOf(page: Page): Promise<{ duration: number; poster: number } | null> {
  return page.evaluate(() => {
    const t = (window as any).wizard?.__timeline?.();
    return t ? { duration: Number(t.duration), poster: Number(t.poster ?? 0) } : null;
  });
}

async function seek(page: Page, seconds: number) {
  await page.evaluate(async (t) => {
    (window as any).wizard.__timeline().seek(t);
    await new Promise((r) => requestAnimationFrame(() => r(null)));
  }, seconds);
}

/** Loads the widget once: does it run, and does it animate? */
export async function probeWidget(
  html: string,
  size: WidgetSize,
): Promise<{ duration: number | null; errors: string[]; png: Uint8Array }> {
  return withWidget(html, size, 1, async (page, errors) => {
    const timeline = await timelineOf(page);
    if (timeline) {
      await seek(page, timeline.poster);
    }
    const png = await page.screenshot({ type: "png" });
    return {
      duration: timeline ? Math.min(timeline.duration, MAX_SECONDS) : null,
      errors: [...new Set(errors)].slice(0, 10),
      png,
    };
  });
}

export async function widgetPng(html: string, size: WidgetSize): Promise<Uint8Array> {
  return withWidget(html, size, 2, async (page) => {
    const timeline = await timelineOf(page);
    if (timeline) {
      await seek(page, timeline.poster);
    }
    return page.screenshot({ type: "png", fullPage: true });
  });
}

export async function widgetPdf(html: string, size: WidgetSize): Promise<Uint8Array> {
  return withWidget(html, size, 1, async (page) => {
    const timeline = await timelineOf(page);
    if (timeline) {
      await seek(page, timeline.poster);
    }
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    return page.pdf({
      width: `${size.width}px`,
      height: `${Math.max(size.height, height)}px`,
      printBackground: true,
      pageRanges: "1",
    });
  });
}

let ffmpegCheck: Promise<boolean> | null = null;

export function hasFfmpeg(): Promise<boolean> {
  ffmpegCheck ??= new Promise((resolve) => {
    const p = spawn(env.ffmpegPath, ["-version"], { stdio: "ignore" });
    p.on("error", () => resolve(false));
    p.on("exit", (code) => resolve(code === 0));
  });
  return ffmpegCheck;
}

/** Steps through the widget's timeline frame by frame and encodes the frames as H.264. */
export async function widgetMp4(html: string, size: WidgetSize): Promise<Uint8Array | null> {
  if (!(await hasFfmpeg())) {
    return null;
  }
  const even = { width: size.width - (size.width % 2), height: size.height - (size.height % 2) };
  const dir = await mkdtemp(join(tmpdir(), "wizard-video-"));
  const out = join(dir, "out.mp4");
  try {
    return await withWidget(html, even, 1, async (page) => {
      const timeline = await timelineOf(page);
      if (!timeline) {
        return null;
      }
      const seconds = Math.min(timeline.duration, MAX_SECONDS);
      const ffmpeg = spawn(
        env.ffmpegPath,
        [
          "-y",
          "-loglevel",
          "error",
          "-f",
          "image2pipe",
          "-framerate",
          String(FPS),
          "-i",
          "-",
          "-c:v",
          "libx264",
          "-preset",
          "veryfast",
          "-crf",
          "20",
          "-pix_fmt",
          "yuv420p",
          "-movflags",
          "+faststart",
          out,
        ],
        { stdio: ["pipe", "ignore", "pipe"] },
      );
      let stderr = "";
      ffmpeg.stderr.on("data", (d) => {
        stderr += String(d);
      });
      const done = new Promise<void>((resolve, reject) => {
        ffmpeg.on("error", reject);
        ffmpeg.on("exit", (code) =>
          code === 0 ? resolve() : reject(new Error(`ffmpeg: ${stderr.slice(0, 300)}`)),
        );
      });
      const frames = Math.max(1, Math.round(seconds * FPS));
      for (let i = 0; i < frames; i++) {
        await seek(page, (i * seconds) / frames);
        const jpeg = await page.screenshot({ type: "jpeg", quality: 92 });
        if (!ffmpeg.stdin.write(jpeg)) {
          await new Promise((r) => ffmpeg.stdin.once("drain", r));
        }
      }
      ffmpeg.stdin.end();
      await done;
      return new Uint8Array(await readFile(out));
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
