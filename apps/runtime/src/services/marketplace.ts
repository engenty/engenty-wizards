import { type WizardDefinition, wizardSchema } from "@engenty-wizards/shared/definition";
import {
  capabilitiesOf,
  costTierOf,
  effortOf,
  formatsOf,
  MARKETPLACE_LANGS,
  type MarketplaceAdminEntry,
  type MarketplaceEntry,
  type MarketplaceLang,
} from "@engenty-wizards/shared/marketplace";
import { asc, eq, sql } from "drizzle-orm";
import type { Principal } from "../auth/index.js";
import { formulaEstimate } from "../credits/estimate.js";
import { control, controlDb } from "../db/client.js";
import { env } from "../env.js";
import { managed } from "../manage.js";
import {
  type ClassPrice,
  classCatalog,
  type GatewayCatalog,
  imageCostUsd,
  tokenCostUsd,
  videoCostUsd,
  WEB_SEARCH_COST_USD,
} from "../models.js";
import { readSetting, writeSetting } from "../settings.js";
import { STARTER_LISTINGS } from "../starters/catalog.js";
import { STARTERS } from "../starters/index.js";
import { ServiceError } from "./errors.js";

/**
 * The marketplace: wizards anyone can start from, in the control database. The base set comes
 * from the repo at start, admins add and change entries, and a runtime that runs alone takes
 * over what its source runtime lists — so a new entry needs no new app.
 */

export type ItemRow = typeof control.marketplaceItem.$inferSelect;
export type TextRow = typeof control.marketplaceText.$inferSelect;

export const asLang = (raw: string | undefined | null): MarketplaceLang =>
  (MARKETPLACE_LANGS as readonly string[]).includes(raw ?? "") ? (raw as MarketplaceLang) : "de";

/** Who may add and change entries. */
export function isMarketplaceAdmin(user: Pick<Principal, "email">): boolean {
  return env.marketplace.admins.includes(managed ? user.email.toLowerCase() : "local");
}

export function requireAdmin(user: Pick<Principal, "email">) {
  if (!isMarketplaceAdmin(user)) {
    throw new ServiceError("refused", "Only a marketplace admin may do that.");
  }
}

// --- can this app read the entry? -----------------------------------------------------
// The schema drops what it does not know. An entry written for a newer app would be read
// without complaint and run wrongly, so a definition counts only when nothing of it is lost.

function keepsAll(given: unknown, read: unknown): boolean {
  if (Array.isArray(given)) {
    return Array.isArray(read) && given.every((v, i) => keepsAll(v, read[i]));
  }
  if (given && typeof given === "object") {
    return (
      Boolean(read) &&
      typeof read === "object" &&
      Object.entries(given).every(
        ([k, v]) => v === undefined || (k in (read as object) && keepsAll(v, (read as never)[k])),
      )
    );
  }
  return true;
}

export function readable(definition: unknown): boolean {
  const parsed = wizardSchema.safeParse(definition);
  return parsed.success && keepsAll(definition, parsed.data);
}

const usable = new Map<string, boolean>();
function isUsable(text: TextRow): boolean {
  const key = `${text.itemId}:${text.language}:${text.revision}`;
  let known = usable.get(key);
  if (known === undefined) {
    known = readable(text.definition);
    usable.set(key, known);
  }
  return known;
}

// --- reading ----------------------------------------------------------------------------

async function rows(): Promise<{ item: ItemRow; texts: TextRow[] }[]> {
  const items = await controlDb
    .select()
    .from(control.marketplaceItem)
    .orderBy(asc(control.marketplaceItem.position), asc(control.marketplaceItem.id));
  const texts = await controlDb.select().from(control.marketplaceText);
  return items.map((item) => ({ item, texts: texts.filter((t) => t.itemId === item.id) }));
}

/** The entry's words in a language: a translation of the current revision, else its own. */
function textFor(item: ItemRow, texts: TextRow[], lang: MarketplaceLang): TextRow | undefined {
  return (
    texts.find((t) => t.language === lang && t.revision === item.revision) ??
    texts.find((t) => t.language === item.language)
  );
}

type Credits = MarketplaceEntry["credits"];

function entry(item: ItemRow, text: TextRow, live: Credits): MarketplaceEntry {
  const ok = isUsable(text);
  return {
    id: item.id,
    revision: item.revision,
    language: text.language,
    title: text.title,
    pitch: text.pitch,
    avatar: item.avatar,
    formats: item.formats,
    industries: item.industries,
    useCases: item.useCases,
    capabilities: item.capabilities,
    effort: ok ? effortOf(text.definition) : { fields: 0, required: 0, reviews: 0, minutes: 0 },
    costTier: costTierOf(item.capabilities),
    credits:
      live ??
      (item.credits === null
        ? null
        : { credits: item.credits, high: item.creditsHigh ?? item.credits }),
    steps: text.definition.steps.length,
    usable: ok,
  };
}

const CREDITS_PER_USD = 100;

/**
 * Prices for a runtime that has no gateway to ask: what the models each class is bound to by
 * default cost at their list price, in credits. An estimate needs a number even where a run is
 * paid for another way.
 */
function listPrices(): GatewayCatalog {
  const text = (ref: string): ClassPrice => ({
    model: ref,
    kind: "text",
    inputCreditsPerMTok: tokenCostUsd(ref, { inputTokens: 1e6 }) * CREDITS_PER_USD,
    outputCreditsPerMTok: tokenCostUsd(ref, { outputTokens: 1e6 }) * CREDITS_PER_USD,
  });
  const m = env.models;
  return {
    markup: 1,
    webSearchCredits: WEB_SEARCH_COST_USD * CREDITS_PER_USD,
    classes: {
      classifier: text(m.classifier),
      standard: text(m.standard),
      high: text(m.high),
      highest: text(m.highest),
      image: {
        model: m.image,
        kind: "image",
        creditsPerImage: imageCostUsd(m.image) * CREDITS_PER_USD,
      },
      video: {
        model: m.video,
        kind: "video",
        creditsPerSecond: videoCostUsd(m.video, 1) * CREDITS_PER_USD,
      },
    },
  };
}

/** What a run costs: at the gateway's prices where there is one, else at list prices. */
async function priced(definition: WizardDefinition): Promise<NonNullable<Credits>> {
  const catalog = await classCatalog().catch(() => null);
  return formulaEstimate(definition, catalog ?? listPrices());
}

/** The published entries, in a language. `live` prices them now instead of using the stored estimate. */
export async function listMarketplace(
  lang: MarketplaceLang,
  options: { live?: boolean } = {},
): Promise<MarketplaceEntry[]> {
  const out: MarketplaceEntry[] = [];
  for (const { item, texts } of await rows()) {
    const text = item.status === "published" ? textFor(item, texts, lang) : undefined;
    if (text) {
      // A row from before estimates were stored is priced now as well.
      const now = (options.live || item.credits === null) && isUsable(text);
      const live = now ? await priced(text.definition) : null;
      out.push(entry(item, text, live));
    }
  }
  return out;
}

export async function listMarketplaceAdmin(
  lang: MarketplaceLang,
): Promise<MarketplaceAdminEntry[]> {
  const out: MarketplaceAdminEntry[] = [];
  for (const { item, texts } of await rows()) {
    const text = textFor(item, texts, lang);
    if (text) {
      out.push({
        ...entry(item, text, null),
        status: item.status,
        origin: item.origin,
        sourceLanguage: item.language,
        languages: texts.filter((t) => t.revision === item.revision).map((t) => t.language),
        position: item.position,
        installs: item.installs,
        updatedAt: item.updatedAt.getTime(),
      });
    }
  }
  return out;
}

export interface MarketplaceWizard {
  id: string;
  revision: number;
  title: string;
  language: MarketplaceLang;
  definition: WizardDefinition;
  files: Record<string, Buffer>;
}

async function filesOf(itemId: string): Promise<Record<string, Buffer>> {
  const files = await controlDb
    .select()
    .from(control.marketplaceFile)
    .where(eq(control.marketplaceFile.itemId, itemId));
  return Object.fromEntries(files.map((f) => [f.path, Buffer.from(f.data)]));
}

/** An entry's wizard and workspace in a language. Drafts are there for admins only. */
export async function marketplaceWizard(
  id: string,
  lang: MarketplaceLang,
  options: { drafts?: boolean } = {},
): Promise<MarketplaceWizard | null> {
  const item = await controlDb.query.marketplaceItem.findFirst({
    where: eq(control.marketplaceItem.id, id),
  });
  if (!item || (item.status === "draft" && !options.drafts)) {
    return null;
  }
  const texts = await controlDb
    .select()
    .from(control.marketplaceText)
    .where(eq(control.marketplaceText.itemId, id));
  const text = textFor(item, texts, lang);
  if (!text) {
    return null;
  }
  if (!isUsable(text)) {
    throw new ServiceError(
      "refused",
      "Diese Vorlage braucht eine neuere Version der App. Bitte aktualisiere die App.",
    );
  }
  return {
    id: item.id,
    revision: item.revision,
    title: text.title,
    language: text.language,
    definition: wizardSchema.parse(text.definition),
    files: await filesOf(id),
  };
}

export async function countInstall(id: string) {
  await controlDb
    .update(control.marketplaceItem)
    .set({ installs: sql`${control.marketplaceItem.installs} + 1` })
    .where(eq(control.marketplaceItem.id, id));
}

// --- writing ----------------------------------------------------------------------------

export interface ItemContent {
  language: MarketplaceLang;
  title: string;
  pitch: string;
  definition: WizardDefinition;
  files: Record<string, string | Uint8Array>;
}

async function putFiles(itemId: string, files: ItemContent["files"]) {
  await controlDb.delete(control.marketplaceFile).where(eq(control.marketplaceFile.itemId, itemId));
  for (const [path, content] of Object.entries(files)) {
    await controlDb.insert(control.marketplaceFile).values({
      itemId,
      path,
      data: typeof content === "string" ? Buffer.from(content, "utf8") : Buffer.from(content),
    });
  }
}

export async function putText(
  itemId: string,
  revision: number,
  text: Pick<ItemContent, "language" | "title" | "pitch" | "definition">,
  machine = false,
) {
  const values = { itemId, revision, machine, ...text };
  usable.delete(`${itemId}:${text.language}:${revision}`);
  await controlDb
    .insert(control.marketplaceText)
    .values(values)
    .onConflictDoUpdate({
      target: [control.marketplaceText.itemId, control.marketplaceText.language],
      set: values,
    });
}

/**
 * Writes an entry's wizard: a new entry, or the next revision of an existing one. What follows
 * from the definition — capabilities, the estimate — is worked out here; translations of the
 * revision before are out of date from now on.
 */
export async function writeContent(
  id: string,
  content: ItemContent,
  meta: Partial<
    Pick<
      ItemRow,
      | "status"
      | "origin"
      | "baseRevision"
      | "industries"
      | "useCases"
      | "formats"
      | "position"
      | "updatedBy"
    >
  > & { revision?: number } = {},
): Promise<ItemRow> {
  const before = await controlDb.query.marketplaceItem.findFirst({
    where: eq(control.marketplaceItem.id, id),
  });
  const { revision: given, ...rest } = meta;
  const revision = given ?? (before ? before.revision + 1 : 1);
  // An entry taken over from a newer runtime may hold what this app cannot read yet.
  const known = readable(content.definition);
  const capabilities = known ? capabilitiesOf(content.definition) : (before?.capabilities ?? []);
  const price = known ? await priced(content.definition) : null;
  const formats = rest.formats ?? (known ? formatsOf(content.definition) : ["text" as const]);
  const derived = {
    revision,
    language: content.language,
    avatar: content.definition.avatar ?? "round",
    capabilities,
    credits: price ? Math.round(price.credits) : (before?.credits ?? null),
    creditsHigh: price ? price.high : (before?.creditsHigh ?? null),
    updatedAt: new Date(),
  };
  if (before) {
    await controlDb
      .update(control.marketplaceItem)
      .set({ ...derived, ...rest, formats })
      .where(eq(control.marketplaceItem.id, id));
  } else {
    await controlDb.insert(control.marketplaceItem).values({
      id,
      ...derived,
      industries: ["any"],
      useCases: [],
      ...rest,
      formats,
    });
  }
  await putText(id, revision, content);
  await putFiles(id, content.files);
  return (await controlDb.query.marketplaceItem.findFirst({
    where: eq(control.marketplaceItem.id, id),
  }))!;
}

// --- the base set -----------------------------------------------------------------------

/**
 * Brings the repo's starters into the database: a starter the database does not know is added,
 * one whose revision in the repo went up replaces its row — unless an admin changed that row,
 * which then belongs to the database. Runs at every start, after the migrations.
 */
export async function seedMarketplace(): Promise<{ added: number; updated: number }> {
  let added = 0;
  let updated = 0;
  for (const [index, starter] of STARTERS.entries()) {
    const listing = STARTER_LISTINGS[starter.id] ?? {
      revision: 1,
      industries: ["any" as const],
      useCases: starter.group === "website" ? ["website" as const] : [],
    };
    const row = await controlDb.query.marketplaceItem.findFirst({
      where: eq(control.marketplaceItem.id, starter.id),
    });
    if (row && (row.origin !== "base" || (row.baseRevision ?? 0) >= listing.revision)) {
      continue;
    }
    const content: ItemContent = {
      language: "de",
      title: starter.title,
      pitch: starter.pitch,
      definition: wizardSchema.parse(starter.definition),
      files: starter.files ?? {},
    };
    await writeContent(
      starter.id,
      content,
      row
        ? { baseRevision: listing.revision }
        : {
            status: "published",
            origin: "base",
            baseRevision: listing.revision,
            industries: listing.industries,
            useCases: listing.useCases,
            position: (index + 1) * 10,
          },
    );
    if (row) {
      updated += 1;
    } else {
      added += 1;
    }
  }
  return { added, updated };
}

// --- a runtime that runs alone takes its entries from its source ---------------------------

/** What the source lists: enough to see what changed. */
export interface MarketplaceIndex {
  items: { id: string; revision: number; status: "published" | "unlisted" }[];
}

/** One entry in full, as one runtime hands it to another. */
export interface MarketplaceExport {
  id: string;
  revision: number;
  language: MarketplaceLang;
  formats: ItemRow["formats"];
  industries: ItemRow["industries"];
  useCases: ItemRow["useCases"];
  position: number;
  credits: number | null;
  creditsHigh: number | null;
  texts: {
    language: MarketplaceLang;
    title: string;
    pitch: string;
    definition: unknown;
    machine: boolean;
  }[];
  /** path → base64 */
  files: Record<string, string>;
}

export async function marketplaceIndex(): Promise<MarketplaceIndex> {
  const items = await controlDb
    .select({
      id: control.marketplaceItem.id,
      revision: control.marketplaceItem.revision,
      status: control.marketplaceItem.status,
    })
    .from(control.marketplaceItem);
  return {
    items: items.filter((i) => i.status !== "draft") as MarketplaceIndex["items"],
  };
}

export async function exportItem(id: string): Promise<MarketplaceExport | null> {
  const item = await controlDb.query.marketplaceItem.findFirst({
    where: eq(control.marketplaceItem.id, id),
  });
  if (item?.status !== "published") {
    return null;
  }
  const texts = await controlDb
    .select()
    .from(control.marketplaceText)
    .where(eq(control.marketplaceText.itemId, id));
  const files = await filesOf(id);
  return {
    id: item.id,
    revision: item.revision,
    language: item.language,
    formats: item.formats,
    industries: item.industries,
    useCases: item.useCases,
    position: item.position,
    credits: item.credits,
    creditsHigh: item.creditsHigh,
    texts: texts
      .filter((t) => t.revision === item.revision)
      .map(({ language, title, pitch, definition, machine }) => ({
        language,
        title,
        pitch,
        definition,
        machine,
      })),
    files: Object.fromEntries(Object.entries(files).map(([p, d]) => [p, d.toString("base64")])),
  };
}

const SYNCED = "marketplace:synced";
const SYNC_EVERY_MS = 3600_000;
let syncing: Promise<void> | null = null;

async function fetchJson<T>(url: string): Promise<T | null> {
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) }).catch(() => null);
  return res?.ok ? ((await res.json().catch(() => null)) as T | null) : null;
}

async function takeOver(source: string): Promise<void> {
  const index = await fetchJson<MarketplaceIndex>(`${source}/api/public/marketplace/index`);
  if (!index?.items) {
    return;
  }
  const local = await controlDb.select().from(control.marketplaceItem);
  const listed = new Set(index.items.map((i) => i.id));
  for (const remote of index.items) {
    const row = local.find((r) => r.id === remote.id);
    // What an admin made on this machine stays as it is.
    if (row?.origin === "admin") {
      continue;
    }
    if (remote.status !== "published") {
      if (row?.status === "published") {
        await controlDb
          .update(control.marketplaceItem)
          .set({ status: remote.status })
          .where(eq(control.marketplaceItem.id, row.id));
      }
      continue;
    }
    if (row?.origin === "cloud" && row.revision === remote.revision && row.status === "published") {
      continue;
    }
    const full = await fetchJson<MarketplaceExport>(
      `${source}/api/public/marketplace/${encodeURIComponent(remote.id)}/export`,
    );
    const own = full?.texts.find((t) => t.language === full.language);
    if (!full || !own) {
      continue;
    }
    // An entry this app cannot read yet is kept as it comes: the list marks it, and an
    // updated app reads the same row.
    await writeContent(
      full.id,
      {
        language: full.language,
        title: own.title,
        pitch: own.pitch,
        definition: own.definition as WizardDefinition,
        files: Object.fromEntries(
          Object.entries(full.files).map(([p, d]) => [p, Buffer.from(d, "base64")]),
        ),
      },
      {
        revision: full.revision,
        status: "published",
        origin: "cloud",
        formats: full.formats,
        industries: full.industries,
        useCases: full.useCases,
        position: full.position,
      },
    );
    if (full.credits !== null) {
      await controlDb
        .update(control.marketplaceItem)
        .set({ credits: full.credits, creditsHigh: full.creditsHigh })
        .where(eq(control.marketplaceItem.id, full.id));
    }
    for (const text of full.texts) {
      if (text.language !== full.language) {
        await putText(
          full.id,
          full.revision,
          { ...text, definition: text.definition as WizardDefinition },
          text.machine,
        );
      }
    }
  }
  // What the source no longer lists goes out of the list here too.
  for (const row of local) {
    if (row.origin === "cloud" && row.status === "published" && !listed.has(row.id)) {
      await controlDb
        .update(control.marketplaceItem)
        .set({ status: "unlisted" })
        .where(eq(control.marketplaceItem.id, row.id));
    }
  }
  await writeSetting(SYNCED, Date.now());
}

/**
 * Takes over the source's entries when the last look is older than an hour. The first look
 * ever is waited for, briefly; later ones run beside the request that asked.
 */
export async function syncMarketplace(force = false): Promise<void> {
  const source = env.marketplace.sourceUrl;
  if (!source || source === env.appUrl) {
    return;
  }
  const last = await readSetting<number>(SYNCED);
  if (!force && last && Date.now() - last < SYNC_EVERY_MS) {
    return;
  }
  syncing ??= takeOver(source)
    .catch((err) => console.error("[marketplace]", err))
    .finally(() => {
      syncing = null;
    });
  if (force || !last) {
    await Promise.race([syncing, new Promise((r) => setTimeout(r, force ? 60_000 : 4_000))]);
  }
}
