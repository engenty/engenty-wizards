import { createAnthropic } from "@ai-sdk/anthropic";
import { createGateway } from "@ai-sdk/gateway";
import { createOpenAI } from "@ai-sdk/openai";
import {
  type Effort,
  MODEL_CLASSES,
  type ModelClass,
  TEXT_CLASSES,
  type TextClass,
} from "@engenty-wizards/shared/definition";
import type { EmbeddingModel, LanguageModel } from "ai";
import { accountToken } from "./auth/account.js";
import { env } from "./env.js";
import {
  detectHarness,
  type HarnessId,
  HarnessModel,
  harness,
  isHarnessVendor,
  notInstalled,
} from "./harness/index.js";
import { managed } from "./manage.js";
import { ModelUnavailableError } from "./model-errors.js";
import { vaultDelete, vaultGet, vaultSet } from "./secrets/vault.js";
import { readSetting, writeSetting } from "./settings.js";
import { currentTenantOrNull } from "./tenants/tenant.js";

export { isHarnessVendor } from "./harness/index.js";
/**
 * A step names a model class, never a model. Where the class runs is decided here:
 *  - a runtime of a Manage-App sends `wizards/<class>` to the model-gateway, which binds it,
 *    meters the call and books the tenant's credits;
 *  - a runtime that runs alone uses the linked account's credits through the same gateway, or
 *    resolves the class itself: an AI client installed on the machine (Claude Code, Codex,
 *    Gemini CLI, Cursor Agent — on its subscription), own keys (AI Gateway, OpenAI, Anthropic)
 *    or a local model.
 * A local binding is `[provider:]vendor/model`, e.g. `anthropic/claude-haiku-4.5`,
 * `openai:gpt-5.4-mini`, `ollama:qwen3`, `claude/sonnet`, `codex/default`.
 */
export { ModelUnavailableError } from "./model-errors.js";

/** What a call is made for; the gateway books it on the run and step. */
export interface CallMeta {
  runId?: string;
  stepId?: string;
  effort?: Effort;
}

export interface ResolvedModel<M> {
  model: M;
  /** The model the class is bound to, as far as this runtime knows it — prices and vendor quirks. */
  ref: string;
  vendor: string;
  /** Served by an AI Gateway (ours or the person's own key): its search tools are available. */
  gateway: boolean;
  /** Booked by the model-gateway; the runtime adds no cost of its own. */
  metered: boolean;
}

// --- local configuration -------------------------------------------------------

export const LOCAL_KEYS = ["gateway", "openai", "anthropic"] as const;
export type LocalKey = (typeof LOCAL_KEYS)[number];

/** A client's id = that installed client; `account` = the linked account's credits; `own` = own keys or a local model. */
export type LocalSource = HarnessId | "account" | "own";

export interface LocalModelSettings {
  source: LocalSource;
  bindings: Partial<Record<ModelClass, string>>;
  ollamaUrl?: string;
}

const local: { settings: LocalModelSettings; keys: Partial<Record<LocalKey, string>> } = {
  settings: { source: "own", bindings: {} },
  keys: {},
};

/** Reads the model settings and keys of a runtime that runs alone; called at start and after a change. */
export async function loadLocalModels() {
  if (managed) {
    return;
  }
  local.settings = (await readSetting<LocalModelSettings>("models")) ?? {
    source: "own",
    bindings: {},
  };
  local.keys = {
    gateway: (await vaultGet("key.gateway")) ?? env.aiGatewayKey,
    openai: (await vaultGet("key.openai")) ?? env.openaiKey,
    anthropic: (await vaultGet("key.anthropic")) ?? env.anthropicKey,
  };
}

export function localModelSettings() {
  return {
    ...local.settings,
    bindings: Object.fromEntries(MODEL_CLASSES.map((c) => [c, localRef(c)])) as Record<
      ModelClass,
      string
    >,
    ollamaUrl: local.settings.ollamaUrl ?? env.ollamaUrl,
    keys: Object.fromEntries(LOCAL_KEYS.map((k) => [k, Boolean(local.keys[k])])) as Record<
      LocalKey,
      boolean
    >,
  };
}

export async function saveLocalModels(input: {
  source?: LocalSource;
  bindings?: Partial<Record<ModelClass, string>>;
  ollamaUrl?: string;
  /** A key to store; an empty string removes it. */
  keys?: Partial<Record<LocalKey, string>>;
}) {
  const bindings = { ...local.settings.bindings };
  for (const [cls, ref] of Object.entries(input.bindings ?? {})) {
    if (ref?.trim()) {
      bindings[cls as ModelClass] = ref.trim();
    } else {
      delete bindings[cls as ModelClass];
    }
  }
  await writeSetting("models", {
    source: input.source ?? local.settings.source,
    bindings,
    ollamaUrl: input.ollamaUrl?.trim() || local.settings.ollamaUrl,
  } satisfies LocalModelSettings);
  for (const [name, value] of Object.entries(input.keys ?? {})) {
    if (value?.trim()) {
      await vaultSet(`key.${name}`, value.trim());
    } else {
      await vaultDelete(`key.${name}`);
    }
  }
  await loadLocalModels();
}

// --- the model-gateway of a Manage-App -------------------------------------------

interface GatewayAccess {
  baseUrl: string;
  token: string;
  tenant: string | null;
}

async function gatewayAccess(): Promise<GatewayAccess | null> {
  if (managed) {
    return {
      baseUrl: env.manage.gatewayUrl,
      token: env.manage.serviceKey,
      tenant: currentTenantOrNull(),
    };
  }
  if (local.settings.source !== "account") {
    return null;
  }
  const token = await accountToken();
  if (!token) {
    throw new ModelUnavailableError(
      "Das Konto ist nicht mehr angemeldet. Bitte in den Einstellungen neu anmelden.",
    );
  }
  return { baseUrl: env.local.gatewayUrl, token, tenant: null };
}

function gatewayClient(access: GatewayAccess, meta: CallMeta) {
  return createGateway({
    baseURL: `${access.baseUrl}/v4/ai`,
    apiKey: access.token,
    headers: {
      ...(access.tenant ? { "x-wizards-tenant": access.tenant } : {}),
      ...(meta.runId ? { "x-wizards-run": meta.runId } : {}),
      ...(meta.stepId ? { "x-wizards-step": meta.stepId } : {}),
      ...(meta.effort ? { "x-wizards-effort": meta.effort } : {}),
    },
  });
}

export interface ClassPrice {
  model: string;
  kind: "text" | "image" | "video" | "audio" | "speech" | "embedding";
  inputCreditsPerMTok?: number;
  outputCreditsPerMTok?: number;
  creditsPerImage?: number;
  creditsPerSecond?: number;
}

export interface GatewayCatalog {
  markup: number;
  classes: Partial<Record<ModelClass | "embedding", ClassPrice | null>>;
  webSearchCredits: number;
}

let gatewayCatalog: { at: number; base: string; value: GatewayCatalog } | null = null;

/** What the gateway binds each class to, with prices in credits. Cached for five minutes. */
export async function classCatalog(): Promise<GatewayCatalog | null> {
  const access = await gatewayAccess().catch(() => null);
  if (!access) {
    return null;
  }
  if (
    gatewayCatalog &&
    gatewayCatalog.base === access.baseUrl &&
    Date.now() - gatewayCatalog.at < 300_000
  ) {
    return gatewayCatalog.value;
  }
  try {
    const res = await fetch(`${access.baseUrl}/v1/models`, {
      headers: {
        authorization: `Bearer ${access.token}`,
        ...(access.tenant ? { "x-wizards-tenant": access.tenant } : {}),
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      return gatewayCatalog?.value ?? null;
    }
    const value = (await res.json()) as GatewayCatalog;
    gatewayCatalog = { at: Date.now(), base: access.baseUrl, value };
    return value;
  } catch {
    return gatewayCatalog?.value ?? null;
  }
}

// --- resolving a class -------------------------------------------------------------

function split(ref: string): { provider: string | null; vendor: string; model: string } {
  const [maybeProvider, rest] = ref.includes(":") ? ref.split(/:(.*)/s, 2) : [null, ref];
  const [vendor, ...model] = (rest ?? ref).split("/");
  return { provider: maybeProvider, vendor, model: model.join("/") };
}

const vendorOf = (ref: string) => split(ref).vendor;

function localRef(cls: ModelClass): string {
  const bound = local.settings.bindings[cls];
  const client = harness(local.settings.source);
  if (client && (TEXT_CLASSES as readonly string[]).includes(cls)) {
    // Text thinks on the installed client; a binding counts only where it names that client.
    return bound?.startsWith(`${client.id}/`)
      ? bound
      : `${client.id}/${client.classes[cls as TextClass]}`;
  }
  return bound ?? env.models[cls];
}

function ownGateway() {
  return local.keys.gateway ? createGateway({ apiKey: local.keys.gateway }) : null;
}

async function localLanguageModel(
  ref: string,
  meta: CallMeta,
): Promise<{ model: LanguageModel; gateway: boolean }> {
  const { provider, vendor, model } = split(ref);
  const client = harness(vendor);
  if (client) {
    if (!(await detectHarness(client.id))?.version) {
      throw new ModelUnavailableError(notInstalled(client));
    }
    return { model: client.model(model, meta.effort), gateway: false };
  }
  if (provider === "ollama") {
    const ollama = createOpenAI({
      baseURL: local.settings.ollamaUrl ?? env.ollamaUrl,
      apiKey: "ollama",
    });
    return { model: ollama.chat(model ? `${vendor}/${model}` : vendor), gateway: false };
  }
  const gateway = ownGateway();
  if ((provider === null || provider === "gateway") && gateway) {
    return { model: gateway(`${vendor}/${model}`), gateway: true };
  }
  if ((provider === "openai" || vendor === "openai") && local.keys.openai) {
    return {
      model: createOpenAI({ apiKey: local.keys.openai })(model || vendor),
      gateway: false,
    };
  }
  if ((provider === "anthropic" || vendor === "anthropic") && local.keys.anthropic) {
    return {
      model: createAnthropic({ apiKey: local.keys.anthropic })(model || vendor),
      gateway: false,
    };
  }
  throw new ModelUnavailableError(
    `Für das Modell "${ref}" ist kein Zugang eingerichtet. Bitte in den Einstellungen einen Schlüssel hinterlegen oder ein Konto anmelden.`,
  );
}

async function viaGateway<M>(
  cls: ModelClass,
  meta: CallMeta,
  pick: (client: ReturnType<typeof createGateway>, id: string) => M,
): Promise<ResolvedModel<M> | null> {
  const access = await gatewayAccess();
  if (!access) {
    return null;
  }
  const bound = (await classCatalog())?.classes[cls]?.model ?? "";
  return {
    model: pick(gatewayClient(access, meta), `wizards/${cls}`),
    ref: bound,
    vendor: vendorOf(bound.replace(/^[a-z]+:/, "")),
    gateway: true,
    metered: true,
  };
}

/** The language model a text class runs on. */
export async function textModel(
  cls: TextClass | "audio" | "image",
  meta: CallMeta = {},
): Promise<ResolvedModel<LanguageModel>> {
  const remote = await viaGateway(cls, meta, (client, id) => client(id) as LanguageModel);
  if (remote) {
    return remote;
  }
  const ref = localRef(cls);
  const { model, gateway } = await localLanguageModel(ref, meta);
  return { model, ref, vendor: vendorOf(ref), gateway, metered: false };
}

/** Hands the tools an agent will call to a model that runs them itself (an installed AI client). */
export function attachTools(resolved: ResolvedModel<unknown>, tools: Record<string, unknown>) {
  if (resolved.model instanceof HarnessModel) {
    resolved.model.attach(tools);
  }
}

export async function imageModel(meta: CallMeta = {}) {
  const remote = await viaGateway("image", meta, (client, id) => client.imageModel(id));
  if (remote) {
    return remote;
  }
  const ref = localRef("image");
  const { vendor, model } = split(ref);
  const gateway = ownGateway();
  if (gateway) {
    return {
      model: gateway.imageModel(`${vendor}/${model}`),
      ref,
      vendor,
      gateway: true,
      metered: false,
    };
  }
  if (local.keys.openai && vendor === "openai") {
    return {
      model: createOpenAI({ apiKey: local.keys.openai }).image(model),
      ref,
      vendor,
      gateway: false,
      metered: false,
    };
  }
  throw new ModelUnavailableError("Für Bilder ist kein Modell eingerichtet.");
}

export async function videoModel(meta: CallMeta = {}) {
  const remote = await viaGateway("video", meta, (client, id) => client.videoModel(id));
  if (remote) {
    return remote;
  }
  const ref = localRef("video");
  const { vendor, model } = split(ref);
  const gateway = ownGateway();
  if (gateway) {
    return {
      model: gateway.videoModel(`${vendor}/${model}`),
      ref,
      vendor,
      gateway: true,
      metered: false,
    };
  }
  throw new ModelUnavailableError("Für Videos ist kein Modell eingerichtet.");
}

/** The model that reads a text aloud. */
export async function speechModel(meta: CallMeta = {}) {
  const access = await gatewayAccess();
  if (access) {
    const bound = (await classCatalog())?.classes.speech?.model;
    if (!bound) {
      throw new ModelUnavailableError("Für Sprachausgabe ist kein Modell eingerichtet.");
    }
    return {
      model: gatewayClient(access, meta).speechModel("wizards/speech"),
      ref: bound,
      vendor: vendorOf(bound.replace(/^[a-z]+:/, "")),
      gateway: true,
      metered: true,
    };
  }
  const ref = localRef("speech");
  const { vendor, model } = split(ref);
  const gateway = ownGateway();
  if (gateway) {
    return {
      model: gateway.speechModel(`${vendor}/${model}`),
      ref,
      vendor,
      gateway: true,
      metered: false,
    };
  }
  if (local.keys.openai && vendor === "openai") {
    return {
      model: createOpenAI({ apiKey: local.keys.openai }).speech(model),
      ref,
      vendor,
      gateway: false,
      metered: false,
    };
  }
  throw new ModelUnavailableError("Für Sprachausgabe ist kein Modell eingerichtet.");
}

/**
 * The model that turns passages and questions into vectors for a project's document index.
 * Null where none is set up — an installed AI client has no such model — and the index then
 * works on keywords alone.
 */
export async function embeddingModel(): Promise<{ model: EmbeddingModel; ref: string } | null> {
  const access = await gatewayAccess().catch(() => null);
  if (access) {
    const bound = (await classCatalog())?.classes.embedding;
    return bound
      ? { model: gatewayClient(access, {}).embeddingModel("wizards/embedding"), ref: bound.model }
      : null;
  }
  const ref = env.models.embedding;
  const { provider, vendor, model } = split(ref);
  if (provider === "ollama") {
    const ollama = createOpenAI({
      baseURL: local.settings.ollamaUrl ?? env.ollamaUrl,
      apiKey: "ollama",
    });
    return { model: ollama.embedding(model ? `${vendor}/${model}` : vendor), ref };
  }
  const gateway = ownGateway();
  if ((provider === null || provider === "gateway") && gateway) {
    return { model: gateway.embeddingModel(`${vendor}/${model}`), ref };
  }
  if ((provider === "openai" || vendor === "openai") && local.keys.openai) {
    return { model: createOpenAI({ apiKey: local.keys.openai }).embedding(model || vendor), ref };
  }
  return null;
}

/** Gemini image models are chat models answering with image files. */
export function isChatImageModel(ref: string): boolean {
  return ref.includes("gemini") && ref.includes("image");
}

/** Search tools an AI Gateway runs itself; they travel in the request, so any gateway client names them. */
export const gatewayTools = createGateway({ apiKey: "unused" }).tools;

/** Whether any text model can answer at all: the studio says so before the first chat turn. */
export async function hasTextModel(): Promise<boolean> {
  try {
    await textModel("standard");
    return true;
  } catch {
    return false;
  }
}

// --- Pricing ---------------------------------------------------------------

interface CatalogEntry {
  id: string;
  pricing?: Record<string, unknown>;
}

let catalog = new Map<string, CatalogEntry>();
let catalogLoadedAt = 0;

/** Public prices of the AI Gateway: what a runtime that runs alone shows as the cost of a run. */
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

export function usageOf(u: any): TokenUsage {
  return {
    inputTokens: u?.inputTokens ?? 0,
    outputTokens: u?.outputTokens ?? 0,
    cachedInputTokens: u?.cachedInputTokens ?? u?.inputTokenDetails?.cacheReadTokens ?? 0,
  };
}

/** Provider cost of a text call a runtime that runs alone made; the gateway books the others itself. */
export function costOf(resolved: ResolvedModel<unknown>, usage: any): number {
  // An installed client answers on its subscription: nothing to book.
  return resolved.metered || isHarnessVendor(resolved.vendor)
    ? 0
    : tokenCostUsd(resolved.ref, usageOf(usage));
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

/** Speech is priced per character read, or per audio token (about 25 a second, 15 characters). */
export function speechCostUsd(ref: string, characters: number): number {
  const p = priceOf(ref);
  if (p.speech_input_character_cost !== undefined) {
    return n(p.speech_input_character_cost, 0.00003) * characters;
  }
  return n(p.audio_output_token_cost, 0.00001) * Math.ceil((characters / 15) * 25);
}

export const WEB_SEARCH_COST_USD = 0.01;
