import { Platform } from "react-native";
import { ENGENTY_FILL_OKLCH, type EngentyKind } from "../engenty/shapes";
import { oklchToHex, parseOklch } from "./oklch";

/**
 * The web's dark stage (apps/web/src/styles/app.css): every surface derives from one deep colour
 * in an engenty's hue. The app's own screens stand on cobalt, a wizard's screens on its engenty.
 */
export interface Theme {
  stage: string;
  /** Below the stage: the tab bar. */
  deep: string;
  card: string;
  paper2: string;
  paper3: string;
  line: string;
  input: string;
  ink: string;
  ink2: string;
  ink3: string;
  ink4: string;
  ember: string;
  /** Text on ember. */
  onEmber: string;
  rose: string;
}

function derive(l: number, c: number, h: number): Theme {
  const at = (dl: number, cf: number) => oklchToHex(l + dl, c * cf, h);
  return {
    stage: at(0, 1),
    deep: at(-0.05, 0.93),
    card: at(0.06, 0.95),
    paper2: at(0.1, 0.92),
    paper3: at(0.14, 0.88),
    line: at(0.16, 0.8),
    input: at(0.2, 0.75),
    ink: oklchToHex(0.97, 0.015, h),
    ink2: oklchToHex(0.9, 0.03, h),
    ink3: oklchToHex(0.8, 0.05, h),
    ink4: oklchToHex(0.68, 0.06, h),
    ember: oklchToHex(0.71, 0.19, 40),
    onEmber: oklchToHex(0.16, 0.02, h),
    rose: oklchToHex(0.82, 0.11, 20),
  };
}

/** The app's own stage, the web's default `--stage`. */
export const APP_THEME = derive(0.34, 0.14, 264);

const cache = new Map<string, Theme>();

/** A wizard's stage: its engenty's hue, deep (the web's `stageFill`). */
export function wizardTheme(kind: string | null | undefined): Theme {
  const fill = ENGENTY_FILL_OKLCH[kind as EngentyKind];
  if (!fill) {
    return APP_THEME;
  }
  let theme = cache.get(fill);
  if (!theme) {
    const [, c, h] = parseOklch(fill) ?? [0, 0.23, 262];
    theme = derive(0.34, c * 0.6, h);
    cache.set(fill, theme);
  }
  return theme;
}

/**
 * The brand font (Space Grotesk) only for the wordmark and wizard titles; everything else is the
 * system's (SF on iOS, Roboto on Android), as native apps read.
 */
export const FONT = {
  display: "SpaceGrotesk_600SemiBold",
  displayMedium: "SpaceGrotesk_500Medium",
  displayBold: "SpaceGrotesk_700Bold",
  mono: Platform.select({ ios: "Menlo", default: "monospace" }),
} as const;
