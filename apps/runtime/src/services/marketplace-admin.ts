import { validateWizard, type WizardDefinition } from "@engenty-wizards/shared/definition";
import {
  INDUSTRY_IDS,
  ITEM_FORMAT_IDS,
  MARKETPLACE_LANGS,
  type MarketplaceLang,
  USE_CASE_IDS,
} from "@engenty-wizards/shared/marketplace";
import { generateText } from "ai";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Principal } from "../auth/index.js";
import { control, controlDb } from "../db/client.js";
import { getBlob } from "../files/blobs.js";
import { textModel } from "../models.js";
import { ServiceError } from "./errors.js";
import { putText, requireAdmin, writeContent } from "./marketplace.js";
import { ownedWizard, parseDraft, requireClean } from "./wizards.js";

// What only a marketplace admin does: add a wizard of their own, sort and list entries,
// have them translated.

const LANG_NAMES: Record<MarketplaceLang, string> = { de: "German", en: "English" };

async function itemRow(id: string) {
  const item = await controlDb.query.marketplaceItem.findFirst({
    where: eq(control.marketplaceItem.id, id),
  });
  if (!item) {
    throw new ServiceError("not_found", `There is no marketplace entry "${id}".`);
  }
  return item;
}

function slug(title: string): string {
  return (
    title
      .replace(/ß/g, "ss")
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "wizard"
  );
}

async function freeId(title: string): Promise<string> {
  const base = slug(title);
  for (let n = 1; ; n++) {
    const id = n === 1 ? base : `${base}-${n}`;
    const taken = await controlDb.query.marketplaceItem.findFirst({
      where: eq(control.marketplaceItem.id, id),
    });
    if (!taken) {
      return id;
    }
  }
}

export const itemPatchSchema = z.object({
  status: z.enum(["draft", "published", "unlisted"]).optional(),
  title: z.string().min(1).max(120).optional(),
  pitch: z.string().max(300).optional(),
  formats: z.array(z.enum(ITEM_FORMAT_IDS)).min(1).optional(),
  industries: z.array(z.enum(INDUSTRY_IDS)).min(1).optional(),
  useCases: z.array(z.enum(USE_CASE_IDS)).optional(),
  position: z.number().int().min(0).max(100_000).optional(),
});
export type ItemPatch = z.infer<typeof itemPatchSchema>;

export const publishSchema = itemPatchSchema.extend({
  wizardId: z.string(),
  /** An existing entry gets this wizard as its next revision. */
  itemId: z.string().optional(),
  language: z.enum(MARKETPLACE_LANGS).default("de"),
});

/**
 * Puts a wizard of the admin's own project into the marketplace: a new entry, or the next
 * revision of an existing one. The wizard must be free of issues, like one that is published.
 */
export async function publishToMarketplace(user: Principal, input: z.infer<typeof publishSchema>) {
  requireAdmin(user);
  const w = await ownedWizard(user.id, input.wizardId);
  const { definition, files } = await requireClean(w);
  if (definition.connections?.length || definition.steps.some((s) => s.type === "agent" && s.mcp)) {
    // Connectors and MCP servers belong to a project; another project does not have them.
    throw new ServiceError(
      "refused",
      "Ein Wizard mit eigenen Connectors oder MCP-Servern kann nicht in den Marketplace.",
    );
  }
  const before = input.itemId ? await itemRow(input.itemId) : null;
  const id = before?.id ?? (await freeId(input.title ?? definition.title));
  const data: Record<string, Uint8Array> = {};
  for (const f of files) {
    data[f.path] = new Uint8Array(await getBlob(f.hash));
  }
  const { wizardId: _w, itemId: _i, language, title, pitch, ...meta } = input;
  const item = await writeContent(
    id,
    {
      language,
      title: title ?? definition.title,
      pitch: pitch ?? definition.description,
      definition,
      files: data,
    },
    { ...meta, origin: "admin", updatedBy: user.email || user.id },
  );
  return { id: item.id, revision: item.revision };
}

/** Changes how an entry is listed. Its wizard stays; the revision does not move. */
export async function updateItem(user: Principal, id: string, patch: ItemPatch) {
  requireAdmin(user);
  const item = await itemRow(id);
  const { title, pitch, ...meta } = patch;
  await controlDb
    .update(control.marketplaceItem)
    .set({ ...meta, updatedBy: user.email || user.id, updatedAt: new Date() })
    .where(eq(control.marketplaceItem.id, id));
  if (title !== undefined || pitch !== undefined) {
    const own = await controlDb.query.marketplaceText.findFirst({
      where: (t, { and, eq: same }) => and(same(t.itemId, id), same(t.language, item.language)),
    });
    if (own) {
      await putText(id, own.revision, {
        language: own.language,
        title: title ?? own.title,
        pitch: pitch ?? own.pitch,
        definition: own.definition,
      });
    }
  }
}

/** Removes an entry. One of the base set would come back at the next start: it is unlisted instead. */
export async function deleteItem(user: Principal, id: string) {
  requireAdmin(user);
  const item = await itemRow(id);
  if (item.origin === "base") {
    await controlDb
      .update(control.marketplaceItem)
      .set({ status: "unlisted", updatedAt: new Date() })
      .where(eq(control.marketplaceItem.id, id));
    return { deleted: false };
  }
  await controlDb.delete(control.marketplaceItem).where(eq(control.marketplaceItem.id, id));
  return { deleted: true };
}

// --- translation ------------------------------------------------------------------------

function jsonOf(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("The model answered without JSON.");
  }
  return JSON.parse(text.slice(start, end + 1));
}

/** The ids a translation must leave alone: steps, their types, and the fields of each page. */
function skeleton(def: WizardDefinition): string {
  return JSON.stringify(
    def.steps.map((s) => [s.id, s.type, s.type === "page" ? s.fields.map((f) => f.id) : []]),
  );
}

const TRANSLATE_RULES = `You translate a wizard definition (JSON) for another language.

Translate every text a person reads: title, description, intro, labels, placeholders, help texts,
button texts, "working" lines, messages, the options of select fields, column labels, and
descriptions of output fields.
Translate the instructions and prompts of agent and generate steps too, so that what the wizard
writes comes out in the target language.

Leave exactly as they are:
- every key, every id, "type", "kind", "format", "asset", "model", "tools" and other enum values
- template references in double braces such as {{topic}} or {{steps.post.text}}
- file paths, URLs, numbers, currency codes
- the structure: the same steps and fields in the same order

When you translate an option of a select field, translate it the same way everywhere it is
compared or preset: in "default", in "next" rules ("when.value") and in instructions that quote it.

Answer with one JSON object and nothing else: {"title": string, "pitch": string, "definition": {...}}`;

/**
 * Translates an entry into a language with a model and keeps the result next to the original.
 * A translation that changed the wizard's structure or brought new issues is thrown away.
 */
export async function translateItem(user: Principal, id: string, language: MarketplaceLang) {
  requireAdmin(user);
  const item = await itemRow(id);
  if (language === item.language) {
    throw new ServiceError("invalid", "That is the entry's own language.");
  }
  const own = await controlDb.query.marketplaceText.findFirst({
    where: (t, { and, eq: same }) => and(same(t.itemId, id), same(t.language, item.language)),
  });
  if (!own) {
    throw new ServiceError("not_found", `Entry "${id}" has no wizard.`);
  }
  const files = await controlDb
    .select({ path: control.marketplaceFile.path })
    .from(control.marketplaceFile)
    .where(eq(control.marketplaceFile.itemId, id));
  const paths = files.map((f) => f.path);
  const resolved = await textModel("high");
  let lastError = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await generateText({
      model: resolved.model,
      system: TRANSLATE_RULES,
      prompt: `Source language: ${LANG_NAMES[item.language]}. Target language: ${LANG_NAMES[language]}.${
        lastError ? `\n\nYour last answer was refused: ${lastError}` : ""
      }\n\n${JSON.stringify({ title: own.title, pitch: own.pitch, definition: own.definition })}`,
      maxOutputTokens: 32_000,
      abortSignal: AbortSignal.timeout(300_000),
    });
    try {
      const raw = jsonOf(result.text) as { title?: unknown; pitch?: unknown; definition?: unknown };
      const { draft } = parseDraft(raw.definition);
      if (skeleton(draft) !== skeleton(own.definition)) {
        throw new Error("Steps or fields changed. Keep every id, type and the order.");
      }
      const before = validateWizard(own.definition, paths).length;
      const issues = validateWizard(draft, paths);
      if (issues.length > before) {
        throw new Error(`The translation has issues: ${issues.map((i) => i.message).join("; ")}`);
      }
      await putText(
        id,
        item.revision,
        {
          language,
          title: typeof raw.title === "string" && raw.title ? raw.title : draft.title,
          pitch: typeof raw.pitch === "string" ? raw.pitch : draft.description,
          definition: draft,
        },
        true,
      );
      return { language, revision: item.revision };
    } catch (err) {
      lastError =
        err instanceof ServiceError
          ? `${err.message} ${JSON.stringify(err.data.issues ?? [])}`
          : (err as Error).message;
    }
  }
  throw new ServiceError("refused", `Die Übersetzung hat nicht geklappt: ${lastError}`);
}

/** Translates an entry into every language it is missing in. Failures are logged, not thrown. */
export async function translateMissing(user: Principal, id: string) {
  const item = await itemRow(id);
  const texts = await controlDb
    .select()
    .from(control.marketplaceText)
    .where(eq(control.marketplaceText.itemId, id));
  const done: MarketplaceLang[] = [];
  for (const language of MARKETPLACE_LANGS) {
    const current = texts.some((t) => t.language === language && t.revision === item.revision);
    if (language === item.language || current) {
      continue;
    }
    try {
      await translateItem(user, id, language);
      done.push(language);
    } catch (err) {
      console.error(`[marketplace] translate ${id} → ${language}:`, (err as Error).message);
    }
  }
  return done;
}
