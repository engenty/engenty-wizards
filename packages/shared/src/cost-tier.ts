/**
 * How heavy a run of a wizard is on credits, so a link can be shared as widely as it can carry.
 * 1 credit is 1 cent. Thresholds are per run, on the estimate (`RunEstimate.credits`):
 *
 * - light: at most 2 credits – text on the Standard class with a widget or surface for the
 *   result. 10,000 runs cost at most 200 euros; a new account's 500 credits carry 250 runs.
 * - medium: at most 25 credits – one or two images, a web research, a document on High.
 * - heavy: more – video, voice, browser work, many images. Never let it run at scale on the
 *   owner's credits.
 */
export type CostTier = "light" | "medium" | "heavy";

export const COST_TIER_MAX: Record<Exclude<CostTier, "heavy">, number> = {
  light: 2,
  medium: 25,
};

export function costTier(creditsPerRun: number): CostTier {
  if (creditsPerRun <= COST_TIER_MAX.light) {
    return "light";
  }
  return creditsPerRun <= COST_TIER_MAX.medium ? "medium" : "heavy";
}

/** How many runs a balance carries at this cost, rounded down; every run costs at least 0.1. */
export function runsFor(balance: number, creditsPerRun: number): number {
  return Math.floor(Math.max(balance, 0) / Math.max(creditsPerRun, 0.1));
}
