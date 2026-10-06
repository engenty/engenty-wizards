import { basePath } from "../env.js";

/** Uploads stay small; a clip from the phone's camera is the one thing that needs more room. */
export function uploadLimit(mime: string): number {
  return mime.startsWith("video/") ? 40_000_000 : 15_000_000;
}

/** `version`: the published one, so a new engenty or name reaches icons a phone has kept. */
export function wizardManifest(token: string, title: string, description: string, version = 0) {
  const start = `${basePath}/w/${token}`;
  const icon = (file: string) =>
    `${basePath}/api/public/wizards/${token}/icons/${file}?v=${version}`;
  return {
    id: start,
    name: title,
    short_name: title.length > 14 ? `${title.slice(0, 13).trimEnd()}…` : title,
    description,
    start_url: start,
    scope: `${basePath}/`,
    display: "standalone",
    background_color: "#faf8f5",
    theme_color: "#faf8f5",
    icons: [
      { src: icon("icon-192.png"), sizes: "192x192", type: "image/png", purpose: "any" },
      { src: icon("icon-512.png"), sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: icon("icon-maskable-512.png"),
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}

/**
 * One byte range of a file, as phones ask for audio and video: Safari plays a clip only from a
 * server that answers ranges. `null` = no (usable) range asked, send it whole.
 */
export function byteRange(header: string | undefined, size: number) {
  const m = header?.match(/^bytes=(\d*)-(\d*)$/);
  if (!m || (!m[1] && !m[2]) || size === 0) {
    return null;
  }
  const start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
  const end = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
  return start > end || start >= size ? ("unsatisfiable" as const) : { start, end };
}
