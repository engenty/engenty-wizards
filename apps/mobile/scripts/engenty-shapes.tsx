/**
 * Writes src/engenty/shapes.ts: the web's flat engenties (apps/web/src/engenty/engenty.tsx) as
 * still SVG, first frame of each idle morph, oklch turned into hex. The runtime draws a wizard's
 * app icon from the same shapes: apps/runtime/src/services/engenty-shapes.ts, with each kind's
 * ground shadow. Run it after the web's engenties change:
 *
 *   pnpm --filter @engenty-wizards/web exec tsx ../mobile/scripts/engenty-shapes.tsx
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ENGENTY_FILL, ENGENTY_KIND_FILL, ENGENTY_KINDS } from "../../web/src/engenty/colors";
import { ENGENTY_SHADOW, Engenty } from "../../web/src/engenty/engenty";
import { cssToHex } from "../src/theme/oklch";

const here = dirname(fileURLToPath(import.meta.url));

/** `var(--x, oklch(…))` → the fallback, then hex. */
const color = (value: string) => cssToHex(value.replace(/^var\(--[\w-]+,\s*(.+)\)$/, "$1"));

function still(svg: string): string {
  return (
    svg
      // The idle morph's first frame becomes the shape's own `d`.
      .replace(
        /<path([^>]*)><animate attributeName="d"[^>]*values="([^";]+)[^"]*"[^>]*><\/animate>/g,
        '<path$1 d="$2">',
      )
      // A path that has a `d` of its own keeps it.
      .replace(/ d="([^"]*)"([^>]*) d="[^"]*"/g, ' d="$1"$2')
      .replace(/<animate[^>]*><\/animate>/g, "")
      // No ground shadow: the app draws engenties straight on the stage.
      .replace(/<ellipse class="e-shadow"[^>]*><\/ellipse>/, "")
      .replace(/ (class|data-[\w-]+|aria-hidden|style|overflow)="[^"]*"/g, "")
      .replace(/(fill|stroke)="([^"]+)"/g, (_, attr, value) => `${attr}="${color(value)}"`)
      .replace(/^<svg[^>]*>/, '<svg viewBox="0 0 120 120">')
  );
}

const shapes = Object.fromEntries(
  ENGENTY_KINDS.map((kind) => [
    kind,
    still(renderToStaticMarkup(createElement(Engenty, { kind, animated: false, size: 120 }))),
  ]),
);
const fills = Object.fromEntries(
  ENGENTY_KINDS.map((kind) => [kind, ENGENTY_FILL[ENGENTY_KIND_FILL[kind]]]),
);

const shapesModule = (
  script: string,
) => `// Written by ${script} from apps/web/src/engenty — do not edit by hand.

export type EngentyKind = ${ENGENTY_KINDS.map((k) => JSON.stringify(k)).join(" | ")};

export const ENGENTY_KINDS: EngentyKind[] = ${JSON.stringify(ENGENTY_KINDS)};

/** Each kind's fill in oklch, as the web writes it: the stage of a wizard takes its hue. */
export const ENGENTY_FILL_OKLCH: Record<EngentyKind, string> = ${JSON.stringify(
  Object.fromEntries(
    Object.entries(fills).map(([k, v]) => [k, v.replace(/^var\(--[\w-]+,\s*(.+)\)$/, "$1")]),
  ),
  null,
  2,
)};

/** Still SVG, 120 × 120. */
export const ENGENTY_SVG: Record<EngentyKind, string> = ${JSON.stringify(shapes, null, 2)};
`;

writeFileSync(join(here, "../src/engenty/shapes.ts"), shapesModule("scripts/engenty-shapes.tsx"));
console.log("wrote src/engenty/shapes.ts");

const shadows = Object.fromEntries(
  ENGENTY_KINDS.map((kind) => [kind, { cy: ENGENTY_SHADOW[kind].cy, rx: ENGENTY_SHADOW[kind].rx }]),
);
writeFileSync(
  join(here, "../../runtime/src/services/engenty-shapes.ts"),
  `${shapesModule("apps/mobile/scripts/engenty-shapes.tsx")}
/** The line each kind stands on (\`cy\`) and its shadow's half width, in the same 120 × 120. */
export const ENGENTY_SHADOW: Record<EngentyKind, { cy: number; rx: number }> = ${JSON.stringify(shadows, null, 2)};
`,
);
console.log("wrote apps/runtime/src/services/engenty-shapes.ts");
