import type { EngentyKind } from "./colors";

export const GOOSE_HELMET_KINDS = [
  "round",
  "dome",
  "drop",
] as const satisfies readonly EngentyKind[];
export type GooseHelmetKind = (typeof GOOSE_HELMET_KINDS)[number];

export function isGooseHelmetKind(kind: EngentyKind): kind is GooseHelmetKind {
  return GOOSE_HELMET_KINDS.some((candidate) => candidate === kind);
}

// Fit the same rigid shell around each silhouette without flattening its depth.
export const GOOSE_HELMET_FIT: Record<
  GooseHelmetKind,
  {
    width: number;
    height: number;
    depth: number;
    offsetY: number;
  }
> = {
  round: { width: 1, height: 1, depth: 1, offsetY: 0 },
  dome: {
    width: 0.93,
    height: 1.03,
    depth: 0.94,
    offsetY: -3,
  },
  drop: {
    width: 0.88,
    height: 1.05,
    depth: 0.9,
    offsetY: -5,
  },
};
