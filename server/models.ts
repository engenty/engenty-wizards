import { createAnthropic } from "@ai-sdk/anthropic";
import { createGateway } from "@ai-sdk/gateway";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";
import { env } from "./env.js";

/**
 * Model refs are `[provider:]vendor/model`. Without a provider prefix the Vercel AI
 * Gateway serves the ref when its key is set, else the vendor's own API. Adding a
 * provider = one entry here; nothing else in the app names a provider.
 */
const gateway = env.aiGatewayKey ? createGateway({ apiKey: env.aiGatewayKey }) : null;
const openai = env.openaiKey ? createOpenAI({ apiKey: env.openaiKey }) : null;
const anthropic = env.anthropicKey ? createAnthropic({ apiKey: env.anthropicKey }) : null;

export class ModelUnavailableError extends Error {}

function split(ref: string): { provider: string | null; vendor: string; model: string } {
  const [maybeProvider, rest] = ref.includes(":") ? ref.split(/:(.*)/s, 2) : [null, ref];
  const [vendor, ...model] = (rest ?? ref).split("/");
  return { provider: maybeProvider, vendor, model: model.join("/") };
}

export function languageModel(ref: string): LanguageModel {
  const { provider, vendor, model } = split(ref);
  const full = `${vendor}/${model}`;
  if ((provider === null || provider === "gateway") && gateway) {
    return gateway(full);
  }
  if ((provider === "openai" || vendor === "openai") && openai) {
    return openai(model || vendor);
  }
  if ((provider === "anthropic" || vendor === "anthropic") && anthropic) {
    return anthropic(model || vendor);
  }
  throw new ModelUnavailableError(`No provider configured for model "${ref}".`);
}

export function imageModel(ref: string) {
  const { vendor, model } = split(ref);
  if (gateway) {
    return gateway.imageModel(`${vendor}/${model}`);
  }
  if (openai && vendor === "openai") {
    return openai.image(model);
  }
  throw new ModelUnavailableError(`No provider configured for image model "${ref}".`);
}

export function videoModel(ref: string) {
  const { vendor, model } = split(ref);
  if (gateway) {
    return gateway.videoModel(`${vendor}/${model}`);
  }
  throw new ModelUnavailableError(`No provider configured for video model "${ref}".`);
}

/** Gemini image models are chat models answering with image files. */
export function isChatImageModel(ref: string): boolean {
  return ref.includes("gemini") && ref.includes("image");
}

export function gatewayTools() {
  return gateway?.tools ?? null;
}

export function hasTextModel(): boolean {
  return Boolean(gateway || openai || anthropic);
}

// --- Pricing ---------------------------------------------------------------

interface CatalogEntry {
  id: string;
  pricing?: Record<string, unknown>;
}

let catalog = new Map<string, CatalogEntry>();
let catalogLoadedAt = 0;

export async function loadCatalog(force = false): Promise<void> {
  if (!force && Date.now() - catalogLoadedAt < 6 * 3600_000 && catalog.size) {
    return;
  }
  try {
    const res = await fetch("https://ai-gateway.vercel.sh/v1/models", {
      signal: AbortSignal.timeout(10_000),
    });
    const body = (await res.json()) as { data: CatalogEntry[] };
    catalog = new Map(body.data.map((m) => [m.id, m]));
    catalogLoadedAt = Date.now();
  } catch {
    // Prices fall back to conservative defaults below.
  }
}

function priceOf(ref: string): Record<string, unknown> {
  const { vendor, model } = split(ref);
  return catalog.get(`${vendor}/${model}`)?.pricing ?? {};
}

const n = (v: unknown, fallback: number) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : fallback;
};

export interface TokenUsage {
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
}

export function tokenCostUsd(ref: string, usage: TokenUsage | undefined): number {
  if (!usage) {
    return 0;
  }
  const p = priceOf(ref);
  const input = n(p.input, 0.000003);
  const output = n(p.output, 0.000015);
  const cached = n(p.input_cache_read, input / 10);
  const cachedTokens = usage.cachedInputTokens ?? 0;
  const freshInput = Math.max(0, (usage.inputTokens ?? 0) - cachedTokens);
  return freshInput * input + cachedTokens * cached + (usage.outputTokens ?? 0) * output;
}

export function imageCostUsd(ref: string): number {
  const p = priceOf(ref);
  const tiers = p.image_dimension_quality_pricing as { size: string; cost: string }[] | undefined;
  const tier = tiers?.find((t) => t.size === "default") ?? tiers?.[0];
  return n(tier?.cost ?? p.image, 0.08);
}

export function videoCostUsd(ref: string, seconds: number): number {
  const p = priceOf(ref);
  const tiers = p.video_duration_pricing as
    | { cost_per_second: string; resolution?: string; audio?: boolean }[]
    | undefined;
  // We render at the provider's default resolution with sound: price that tier, never 4K.
  const usable = tiers?.filter((t) => t.resolution !== "4k") ?? [];
  const withAudio = usable.filter((t) => t.audio !== false);
  const pick = withAudio.length ? withAudio : usable;
  const perSecond = pick.length ? Math.max(...pick.map((t) => n(t.cost_per_second, 0))) : 0.4;
  return perSecond * seconds;
}

export const WEB_SEARCH_COST_USD = 0.01;
