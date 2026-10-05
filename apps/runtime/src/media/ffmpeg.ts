import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { env } from "../env.js";

let ffmpegCheck: Promise<boolean> | null = null;

export function hasFfmpeg(): Promise<boolean> {
  ffmpegCheck ??= new Promise((resolve) => {
    const p = spawn(env.ffmpegPath, ["-version"], { stdio: "ignore" });
    p.on("error", () => resolve(false));
    p.on("exit", (code) => resolve(code === 0));
  });
  return ffmpegCheck;
}

/** Runs ffmpeg to its end; what it wrote to stderr comes back either way. */
export function ffmpeg(args: string[]): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve, reject) => {
    const p = spawn(env.ffmpegPath, ["-hide_banner", ...args], {
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    p.stderr.on("data", (d) => {
      stderr = (stderr + String(d)).slice(-20_000);
    });
    p.on("error", reject);
    p.on("exit", (code) => resolve({ code: code ?? 1, stderr }));
  });
}

/** A folder for one job's files, removed when the job is over. */
export async function withTempDir<T>(use: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "wizard-media-"));
  try {
    return await use(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** What ffmpeg says about a media file: how long it is, whether it carries sound, its picture size. */
export async function probeMedia(
  path: string,
): Promise<{ seconds: number; audio: boolean; width: number; height: number }> {
  // Without an output ffmpeg prints the streams and exits with an error; the print is the answer.
  const { stderr } = await ffmpeg(["-i", path]);
  const m = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  const seconds = m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : 0;
  const size = stderr.match(/Stream #\d+:\d+.*Video:.*?, (\d{2,5})x(\d{2,5})/);
  return {
    seconds,
    audio: /Stream #\d+:\d+.*Audio:/.test(stderr),
    width: size ? Number(size[1]) : 0,
    height: size ? Number(size[2]) : 0,
  };
}

/**
 * A video no larger than `short` pixels on its short side (720 for 720p), sound kept. One that
 * fits already comes back as it is; without ffmpeg too.
 */
export async function capVideo(bytes: Uint8Array, short: number): Promise<Uint8Array> {
  if (!(await hasFfmpeg())) {
    return bytes;
  }
  return withTempDir(async (dir) => {
    const input = join(dir, "in.mp4");
    const out = join(dir, "out.mp4");
    await writeFile(input, bytes);
    const { width, height } = await probeMedia(input);
    if (!(width && height) || Math.min(width, height) <= short) {
      return bytes;
    }
    const scale = width >= height ? `scale=-2:${short}` : `scale=${short}:-2`;
    const { code } = await ffmpeg([
      "-y",
      "-loglevel",
      "error",
      "-i",
      input,
      "-vf",
      scale,
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "21",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "copy",
      "-movflags",
      "+faststart",
      out,
    ]);
    return code === 0 ? new Uint8Array(await readFile(out)) : bytes;
  });
}

/**
 * Any audio as MP3 — what every phone and browser plays — with `tags` written into the file
 * (ID3). An MP3 is not encoded again, only tagged. `null` without ffmpeg.
 */
export async function toMp3(
  bytes: Uint8Array,
  ext: string,
  tags: Record<string, string> = {},
): Promise<Uint8Array | null> {
  if (!(await hasFfmpeg())) {
    return null;
  }
  return withTempDir(async (dir) => {
    const input = join(dir, `in.${ext}`);
    const out = join(dir, "out.mp3");
    await writeFile(input, bytes);
    const { code } = await ffmpeg([
      "-y",
      "-loglevel",
      "error",
      "-i",
      input,
      ...(ext === "mp3" ? ["-codec:a", "copy"] : ["-codec:a", "libmp3lame", "-q:a", "3"]),
      "-id3v2_version",
      "3",
      ...Object.entries(tags).flatMap(([key, value]) => ["-metadata", `${key}=${value}`]),
      out,
    ]);
    return code === 0 ? new Uint8Array(await readFile(out)) : null;
  });
}
