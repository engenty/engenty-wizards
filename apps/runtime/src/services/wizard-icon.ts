import {
  ENGENTY_FILL_OKLCH,
  ENGENTY_SHADOW,
  ENGENTY_SVG,
  type EngentyKind,
} from "./engenty-shapes.js";

/**
 * The files a wizard's app icon comes as: the manifest's, the one an iPhone puts on its home
 * screen, and the favicon a bookmark keeps. `safe`: the share of the square the picture may use;
 * a maskable icon is cut to a circle, a squircle or a drop by the phone.
 */
const ICON_FILES = {
  "icon-192.png": { size: 192, safe: 1 },
  "icon-512.png": { size: 512, safe: 1 },
  "icon-maskable-512.png": { size: 512, safe: 0.72 },
  "apple-touch-icon.png": { size: 180, safe: 1 },
  "favicon.png": { size: 64, safe: 1 },
} as const;

export type IconFile = keyof typeof ICON_FILES;

export const isIconFile = (file: string): file is IconFile => Object.hasOwn(ICON_FILES, file);

/** Below this the name is noise: a favicon is the engenty alone. */
const LABEL_FROM = 128;

/** oklch as the web writes it → hex for the canvas, out-of-gamut clipped to sRGB. */
function oklchHex(l: number, c: number, h: number): string {
  const rad = (h * Math.PI) / 180;
  const a = c * Math.cos(rad);
  const b = c * Math.sin(rad);
  const l_ = (l + 0.396_337_777_4 * a + 0.215_803_757_3 * b) ** 3;
  const m_ = (l - 0.105_561_345_8 * a - 0.063_854_172_8 * b) ** 3;
  const s_ = (l - 0.089_484_177_5 * a - 1.291_485_548 * b) ** 3;
  const rgb = [
    4.076_741_662_1 * l_ - 3.307_711_591_3 * m_ + 0.230_969_929_2 * s_,
    -1.268_438_004_6 * l_ + 2.609_757_401_1 * m_ - 0.341_319_396_5 * s_,
    -0.004_196_086_3 * l_ - 0.703_418_614_7 * m_ + 1.707_614_701 * s_,
  ];
  const byte = (x: number) => {
    const v = Math.min(1, Math.max(0, x));
    const g = v <= 0.003_130_8 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
    return Math.round(g * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${rgb.map(byte).join("")}`;
}

/**
 * The ground in the engenty's hue: a pale tint, so the engenty in its own full colour stands out
 * on it, lit from above; the name in the deep shade of the dark theme's stage.
 */
function palette(kind: EngentyKind) {
  const m = ENGENTY_FILL_OKLCH[kind].match(/oklch\(([\d.]+)%\s+([\d.]+)\s+([\d.]+)\)/);
  const c = Number(m?.[2] ?? 0.23);
  const h = Number(m?.[3] ?? 262);
  return {
    top: oklchHex(0.97, c * 0.1, h),
    bottom: oklchHex(0.9, c * 0.2, h),
    ink: oklchHex(0.34, c * 0.6, h),
  };
}

/**
 * The engenty in the 120 × 120 of the shapes, `scale` of it, its feet on its shadow. A favicon is
 * the engenty alone, as large as it goes: the tab or bookmark list it sits in is the ground.
 */
function engentySvg(kind: EngentyKind, labelled: boolean, safe: number, size: number): string {
  const inner = ENGENTY_SVG[kind].replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "");
  const open = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="${size}" height="${size}">`;
  if (size < LABEL_FROM) {
    return `${open}${inner}</svg>`;
  }
  const { top, bottom } = palette(kind);
  const shadow = ENGENTY_SHADOW[kind];
  // With a name below, the engenty moves up and gives it the lower fifth.
  const scale = (labelled ? 0.74 : 0.88) * safe;
  const s = 120 * scale;
  const x = (120 - s) / 2;
  const y = labelled ? 60 - 46 * safe - 0.08 * s : (120 - s) / 2 - 1.5 * scale;
  return `${open}<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient></defs><rect width="120" height="120" fill="url(#bg)"/><g transform="translate(${x} ${y}) scale(${scale})"><ellipse cx="60" cy="${shadow.cy}" rx="${shadow.rx}" ry="4.5" fill="#000" opacity="0.14"/>${inner}</g></svg>`;
}

interface TextMeasure {
  font: string;
  measureText(text: string): { width: number };
}

/**
 * The name in capitals, as many whole words as fit; a lone long word gets a smaller font, then
 * an ellipsis. A cut never ends on a short filler word ("aus", "für").
 */
export function iconLabel(
  title: string,
  width: number,
  px: number,
  ctx: TextMeasure,
  font: (px: number) => string,
): { text: string; px: number } {
  const words = title.toLocaleUpperCase("de-DE").split(/\s+/).filter(Boolean);
  const fits = (text: string, size: number) => {
    ctx.font = font(size);
    return ctx.measureText(text).width <= width;
  };
  let kept = 0;
  while (kept < words.length && fits(words.slice(0, kept + 1).join(" "), px)) {
    kept += 1;
  }
  while (kept > 1 && kept < words.length && words[kept - 1].length <= 3) {
    kept -= 1;
  }
  if (kept > 0) {
    return { text: words.slice(0, kept).join(" "), px };
  }
  const first = words[0] ?? "";
  for (let size = px; size >= px * 0.7; size -= 1) {
    if (fits(first, size)) {
      return { text: first, px: size };
    }
  }
  const small = Math.ceil(px * 0.7);
  let cut = first;
  while (cut.length > 1 && !fits(`${cut}…`, small)) {
    cut = cut.slice(0, -1);
  }
  return { text: `${cut}…`, px: small };
}

const FONT = (px: number) =>
  `700 ${px}px Inter, "Helvetica Neue", Helvetica, Arial, "Liberation Sans", sans-serif`;

const drawn = new Map<string, Uint8Array<ArrayBuffer>>();

/**
 * A wizard's app icon: its engenty on a pale ground of its hue, the name in small capitals below. `null` where
 * the canvas cannot load (a platform without its binary); the studio's icon stands in then.
 */
export async function wizardIcon(
  file: IconFile,
  avatar: string,
  title: string,
): Promise<Uint8Array<ArrayBuffer> | null> {
  const kind: EngentyKind = Object.hasOwn(ENGENTY_SVG, avatar) ? (avatar as EngentyKind) : "round";
  const key = `${file}|${kind}|${title}`;
  const known = drawn.get(key);
  if (known) {
    return known;
  }
  const { size, safe } = ICON_FILES[file];
  const labelled = size >= LABEL_FROM && title.trim().length > 0;
  let png: Uint8Array<ArrayBuffer>;
  try {
    const { createCanvas, loadImage } = await import("@napi-rs/canvas");
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(
      await loadImage(Buffer.from(engentySvg(kind, labelled, safe, size))),
      0,
      0,
      size,
      size,
    );
    if (labelled) {
      const u = size / 120;
      const label = iconLabel(title, 94 * safe * u, Math.round(7.4 * safe * u), ctx, FONT);
      ctx.font = FONT(label.px);
      ctx.letterSpacing = `${(label.px * 0.06).toFixed(2)}px`;
      ctx.textAlign = "center";
      ctx.fillStyle = palette(kind).ink;
      ctx.fillText(label.text, size / 2, (60 + 44 * safe) * u);
    }
    png = new Uint8Array(await canvas.encode("png"));
  } catch {
    return null;
  }
  if (drawn.size >= 300) {
    drawn.delete(drawn.keys().next().value as string);
  }
  drawn.set(key, png);
  return png;
}
