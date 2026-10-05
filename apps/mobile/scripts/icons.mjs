/**
 * Writes the app's icons and splash from the design canvas's app icon: the amber drop on the
 * blue gradient. Run after the drop changes: node scripts/icons.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const here = dirname(fileURLToPath(import.meta.url));
const assets = join(here, "../assets");
const shapes = readFileSync(join(here, "../src/engenty/shapes.ts"), "utf8");
/** The drop's inner SVG, as scripts/engenty-shapes.tsx wrote it. */
const drop = JSON.parse(shapes.match(/"drop": ("<svg.*?<\/svg>")/)[1])
  .replace(/^<svg[^>]*>/, "")
  .replace(/<\/svg>$/, "");

const gradient = `<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2f6eea"/><stop offset="1" stop-color="#0b40bf"/></linearGradient></defs>`;

/** The drop at `scale` of the canvas, centred, with its ground shadow. */
const mark = (scale, color) => {
  const s = 120 * scale;
  const x = (120 - s) / 2;
  const y = (120 - s) / 2 - 1.5 * scale;
  const body = color
    ? drop
        .replace(/fill="#[0-9a-f]+"/g, `fill="${color}"`)
        .replace(/stroke="#[0-9a-f]+"/g, `stroke="${color}"`)
    : drop;
  return `<g transform="translate(${x} ${y}) scale(${scale})">${color ? "" : '<ellipse cx="60" cy="106" rx="24" ry="4.5" fill="#000" opacity="0.2"/>'}${body}</g>`;
};

const svg = (inner, background = true) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="1024" height="1024">${gradient}${background ? '<rect width="120" height="120" fill="url(#bg)"/>' : ""}${inner}</svg>`,
  );

const write = (input, name, size = 1024) =>
  sharp(input).resize(size, size).png().toFile(join(assets, name));

await write(svg(mark(0.88)), "icon.png");
// Android draws the background itself and masks the foreground to its own shape (66 % safe zone).
await write(svg(mark(0.62), false), "android-icon-foreground.png");
await write(svg(""), "android-icon-background.png");
await write(svg(mark(0.62, "#ffffff"), false), "android-icon-monochrome.png");
await write(svg(mark(1), false), "splash-icon.png");
await write(svg(mark(0.88)), "favicon.png", 48);
console.log("wrote assets/");
