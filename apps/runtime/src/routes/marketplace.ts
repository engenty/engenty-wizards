import {
  allFields,
  listRef,
  type NextRule,
  type WizardDefinition,
} from "@engenty-wizards/shared/definition";
import {
  type ItemFormat,
  MARKETPLACE_LANGS,
  type MarketplaceLang,
} from "@engenty-wizards/shared/marketplace";
import { Hono } from "hono";
import { z } from "zod";
import type { SessionUser } from "../auth/index.js";
import {
  asLang,
  exportItem,
  listMarketplace,
  listMarketplaceAdmin,
  marketplaceIndex,
  marketplaceWizard,
  requireAdmin,
  syncMarketplace,
} from "../services/marketplace.js";
import {
  deleteItem,
  itemPatchSchema,
  publishSchema,
  publishToMarketplace,
  translateItem,
  translateMissing,
  updateItem,
  writeSearchTerms,
} from "../services/marketplace-admin.js";
import { searchMarketplace } from "../services/marketplace-search.js";

/** When a branch is taken, in words: the field's label stands for its id. */
function condition(definition: WizardDefinition, rule: NextRule, lang: MarketplaceLang): string {
  const { field, op, value } = rule.when;
  const name =
    allFields(definition).find((f) => f.id === field)?.label ?? field.split(".").pop() ?? field;
  const de = lang === "de";
  // A toggle is often labelled "Mit …" already.
  const bare = name.replace(/^(mit|with)\s+/i, "");
  const without = de ? `ohne ${bare}` : `without ${bare}`;
  const withIt = de ? `mit ${bare}` : `with ${bare}`;
  // A toggle reads better as with / without than as "= true".
  if (typeof value === "boolean" && (op === "equals" || op === "notEquals")) {
    return (op === "equals") === value ? withIt : without;
  }
  const shown = Array.isArray(value) ? value.join(" / ") : String(value ?? "");
  switch (op) {
    case "equals":
      return `${name}: ${shown}`;
    case "notEquals":
      return `${name} ≠ ${shown}`;
    case "in":
      return `${name}: ${shown}`;
    case "notEmpty":
      return withIt;
    case "empty":
      return without;
  }
}

/** A step as the gallery shows it: what happens, not how — and where the flow branches. */
const outline = (definition: WizardDefinition, lang: MarketplaceLang) =>
  definition.steps.map((s) => ({
    id: s.id,
    type: s.type,
    title: s.title,
    ...(s.type === "generate" ? { asset: s.asset } : {}),
    ...(s.type === "widget" && s.video ? { video: true } : {}),
    ...(s.next?.length
      ? {
          branches: s.next.map((rule) => ({
            /** A step's id, or `end`. */
            to: rule.goto,
            when: condition(definition, rule, lang),
          })),
        }
      : {}),
  }));

/** What a step hands over, as the marketplace sorts results. */
function resultKind(definition: WizardDefinition, from: string): ItemFormat {
  if (listRef(from)) {
    return "table";
  }
  const step = definition.steps.find((s) => s.id === from);
  if (step?.type === "generate") {
    return step.asset === "voice" ? "audio" : step.asset;
  }
  if (step?.type === "widget") {
    return step.video ? "video" : "dashboard";
  }
  return step?.type === "agent" && step.output.format === "json" ? "table" : "text";
}

/** What a person takes along at the end: each thing by its name, with the files it comes as. */
function results(definition: WizardDefinition) {
  const out: { title: string; kind: ItemFormat; formats: string[] }[] = [];
  for (const step of definition.steps) {
    if (step.type !== "result") {
      continue;
    }
    for (const d of step.deliverables) {
      const list = listRef(d.from);
      const title =
        d.label ??
        (list
          ? definition.lists?.find((l) => l.id === list)?.title
          : definition.steps.find((s) => s.id === d.from)?.title) ??
        d.from;
      if (!out.some((r) => r.title === title)) {
        out.push({ title, kind: resultKind(definition, d.from), formats: d.formats });
      }
    }
  }
  return out;
}

const cached = { "cache-control": "public, max-age=300" };

const searchSchema = z.object({
  q: z.string().trim().min(1).max(200),
  lang: z.string().optional(),
});

/**
 * The marketplace without a session: the gallery's list, and what a runtime that runs alone
 * takes over (`index`, then `:id/export` for what changed).
 */
export const marketplacePublic = new Hono()
  .get("/", async (c) => c.json(await listMarketplace(asLang(c.req.query("lang"))), 200, cached))
  .get("/index", async (c) => c.json(await marketplaceIndex(), 200, cached))
  .post("/search", async (c) => {
    const { q, lang } = searchSchema.parse(await c.req.json());
    return c.json(await searchMarketplace(q, asLang(lang)));
  })
  .get("/:id", async (c) => {
    const lang = asLang(c.req.query("lang"));
    const entry = (await listMarketplace(lang)).find((e) => e.id === c.req.param("id"));
    const wizard = entry?.usable ? await marketplaceWizard(entry.id, lang) : null;
    if (!entry || !wizard) {
      return c.json({ error: "not found" }, 404);
    }
    return c.json(
      {
        ...entry,
        description: wizard.definition.description,
        outline: outline(wizard.definition, lang),
        results: results(wizard.definition),
        files: Object.keys(wizard.files),
      },
      200,
      cached,
    );
  })
  .get("/:id/export", async (c) => {
    const item = await exportItem(c.req.param("id"));
    return item ? c.json(item, 200, cached) : c.json({ error: "not found" }, 404);
  });

/** The marketplace for someone signed in: the list on "new", and what an admin does. */
export const marketplaceStudio = new Hono<{ Variables: { user: SessionUser } }>()
  .get("/", async (c) => {
    await syncMarketplace();
    return c.json(await listMarketplace(asLang(c.req.query("lang")), { live: true }));
  })
  // The same search as the gallery's, asked by someone signed in: the model call is their tenant's.
  .post("/search", async (c) => {
    const { q, lang } = searchSchema.parse(await c.req.json());
    return c.json(await searchMarketplace(q, asLang(lang)));
  })
  .get("/admin", async (c) => {
    requireAdmin(c.get("user"));
    return c.json(await listMarketplaceAdmin(asLang(c.req.query("lang"))));
  })
  .post("/admin", async (c) => {
    const user = c.get("user");
    const input = publishSchema.parse(await c.req.json());
    const made = await publishToMarketplace(user, input);
    // The other languages follow beside this request: the entry is listed in its own right away.
    void translateMissing(user, made.id).catch(() => undefined);
    // So do the words it is found by, unless the admin gave them.
    if (!input.searchTerms) {
      void writeSearchTerms(user, made.id).catch((err) =>
        console.error(`[marketplace] search terms ${made.id}:`, (err as Error).message),
      );
    }
    return c.json(made);
  })
  .post("/admin/sync", async (c) => {
    requireAdmin(c.get("user"));
    await syncMarketplace(true);
    return c.json({ ok: true });
  })
  .patch("/admin/:id", async (c) => {
    await updateItem(c.get("user"), c.req.param("id"), itemPatchSchema.parse(await c.req.json()));
    return c.json({ ok: true });
  })
  .post("/admin/:id/translate", async (c) => {
    const { language } = z
      .object({ language: z.enum(MARKETPLACE_LANGS) })
      .parse(await c.req.json());
    return c.json(await translateItem(c.get("user"), c.req.param("id"), language));
  })
  .delete("/admin/:id", async (c) => c.json(await deleteItem(c.get("user"), c.req.param("id"))));
