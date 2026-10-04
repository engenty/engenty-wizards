import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "wizards-marketplace-"));
process.env.APP_URL = "http://localhost:5181";
process.env.MARKETPLACE_ADMINS = "local";
process.env.MARKETPLACE_URL = "http://source.test";

// The translation's model call: answers with whatever the test puts here.
const model = vi.hoisted(() => ({
  answer: "",
  /** The search's judge: the indexes it keeps, or null for a model that does not answer. */
  fits: null as number[] | null,
  calls: 0,
}));
vi.mock("ai", async (original) => ({
  ...(await original<typeof import("ai")>()),
  generateText: async () => {
    model.calls++;
    if (model.answer === "" && !model.fits) {
      throw new Error("no model");
    }
    return { text: model.answer, output: { fits: model.fits ?? [] } };
  },
}));
vi.mock("../src/models.js", async (original) => ({
  ...(await original<typeof import("../src/models")>()),
  textModel: async () => ({ model: {}, ref: "test", vendor: "test", gateway: false, metered: false }),
}));

let client: typeof import("../src/db/client");
let wizards: typeof import("../src/services/wizards");
let files: typeof import("../src/services/files");
let market: typeof import("../src/services/marketplace");
let admin: typeof import("../src/services/marketplace-admin");
let starters: typeof import("../src/starters/index");
let search: typeof import("../src/services/marketplace-search");

const TENANT = "tenant-m";
const ADMIN = { id: "local", tenantId: TENANT, role: "owner" as const, name: "A", email: "" };
const inTenant = <T>(fn: () => Promise<T>) => client.withTenant(TENANT, fn);

const definition = {
  version: 1,
  title: "Grußkarte",
  description: "Eine Karte zum Anlass.",
  avatar: "round",
  steps: [
    {
      id: "start",
      type: "page",
      title: "Anlass",
      fields: [
        { id: "occasion", label: "Anlass", kind: "select", options: ["Geburtstag", "Hochzeit"] },
      ],
    },
    {
      id: "card",
      type: "agent",
      title: "Karte schreiben",
      instructions: "Schreibe eine Grußkarte zum Anlass {{occasion}}.",
      tools: [],
      output: { format: "text" },
    },
    {
      id: "done",
      type: "result",
      title: "Fertig",
      deliverables: [{ from: "card", formats: ["txt"] }],
    },
  ],
};

const item = (id: string) =>
  client.controlDb.query.marketplaceItem.findFirst({
    where: eq(client.control.marketplaceItem.id, id),
  });

beforeAll(async () => {
  client = await import("../src/db/client");
  await client.migrateControlDb();
  wizards = await import("../src/services/wizards");
  files = await import("../src/services/files");
  market = await import("../src/services/marketplace");
  admin = await import("../src/services/marketplace-admin");
  starters = await import("../src/starters/index");
  search = await import("../src/services/marketplace-search");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the base set", () => {
  it("goes into the database once", async () => {
    const first = await market.seedMarketplace();
    expect(first).toEqual({ added: starters.STARTERS.length, updated: 0 });
    expect(await market.seedMarketplace()).toEqual({ added: 0, updated: 0 });
  });

  it("is listed with what follows from each wizard", async () => {
    const list = await market.listMarketplace("de");
    expect(list.map((e) => e.id)).toEqual(starters.STARTERS.map((s) => s.id));
    for (const e of list) {
      expect(e.usable).toBe(true);
      expect(e.formats.length).toBeGreaterThan(0);
      expect(e.industries.length).toBeGreaterThan(0);
      expect(e.effort.minutes).toBeGreaterThan(0);
    }
    const ad = list.find((e) => e.id === "facebook-video-ad")!;
    expect(ad.capabilities).toContain("video");
    expect(ad.costTier).toBe("high");
    expect(ad.formats).toContain("video");
    expect(list.find((e) => e.id === "invoice")!.formats).toContain("document");
    expect(list.find((e) => e.id === "web-faq")!.useCases).toContain("website");
  });

  it("takes a starter whose revision went up in the repo, and keeps what an admin changed", async () => {
    const { controlDb, control } = client;
    await controlDb
      .update(control.marketplaceItem)
      .set({ baseRevision: 0, industries: ["retail"] })
      .where(eq(control.marketplaceItem.id, "tweet"));
    await controlDb
      .update(control.marketplaceItem)
      .set({ baseRevision: 0, origin: "admin" })
      .where(eq(control.marketplaceItem.id, "offer"));
    expect(await market.seedMarketplace()).toEqual({ added: 0, updated: 1 });
    const tweet = (await item("tweet"))!;
    expect(tweet.revision).toBe(2);
    expect(tweet.baseRevision).toBe(1);
    // How an admin sorted the entry stays.
    expect(tweet.industries).toEqual(["retail"]);
    expect((await item("offer"))!.revision).toBe(1);
  });
});

describe("searching", () => {
  it("finds entries by their words, the title first, without a model", async () => {
    const all = await market.listMarketplace("de");
    const word = all[0]!.title.split(/\s+/).find((w) => w.length > 4)!;
    const calls = model.calls;
    const result = await search.searchMarketplace(word.slice(0, -1), "de");
    expect(result.judged).toBe(false);
    expect(result.ids).toContain(all[0]!.id);
    expect(model.calls).toBe(calls);
    expect((await search.searchMarketplace("xyzzy", "de")).ids).toEqual([]);
  });

  it("lets a model sort a sentence and drop what does not fit, once per question", async () => {
    const all = await market.listMarketplace("de");
    const question = `ich brauche etwas wie ${all[0]!.title}`;
    model.fits = [0];
    const calls = model.calls;
    const result = await search.searchMarketplace(question, "de");
    expect(result).toEqual({ ids: [all[0]!.id], judged: true });
    model.fits = [1, 0];
    expect(await search.searchMarketplace(`${question}  `, "de")).toEqual(result);
    expect(model.calls).toBe(calls + 1);
    model.fits = null;
  });

  it("keeps the order by words when the model does not answer", async () => {
    const all = await market.listMarketplace("de");
    const result = await search.searchMarketplace(`bitte einmal ${all[0]!.title}`, "de");
    expect(result.judged).toBe(false);
    expect(result.ids[0]).toBe(all[0]!.id);
  });
});

describe("the words an entry is found by", () => {
  it("come with the base set and find what title and pitch do not name", async () => {
    const result = await search.searchMarketplace("Reel", "de");
    expect(result.ids).toEqual(["facebook-video-ad"]);
    model.fits = null;
    const sentence = await search.searchMarketplace(
      "Ich brauche ein kurzes Video für meine Bäckerei",
      "de",
    );
    expect(sentence.judged).toBe(false);
    expect(sentence.ids[0]).toBe("facebook-video-ad");
  });

  it("follow the repo without a new revision", async () => {
    await client.controlDb
      .update(client.control.marketplaceItem)
      .set({ searchTerms: ["veraltet"] })
      .where(eq(client.control.marketplaceItem.id, "invoice"));
    expect(await market.seedMarketplace()).toEqual({ added: 0, updated: 0 });
    expect((await item("invoice"))!.searchTerms).toContain("Faktura");
  });
});

describe("starting from an entry", () => {
  it("makes a wizard with the entry's workspace and counts it", async () => {
    await inTenant(async () => {
      const { id } = await wizards.createWizard("u", { starterId: "property-film" });
      const w = await wizards.ownedWizard("u", id);
      expect(w.starter).toBe("property-film");
      expect(w.starterRevision).toBe(1);
      const starter = starters.STARTERS.find((s) => s.id === "property-film")!;
      expect((await files.draftFiles(id)).map((f) => f.path).sort()).toEqual(
        Object.keys(starter.files ?? {}).sort(),
      );
      expect(await wizards.draftIssues(w)).toEqual([]);
    });
    expect((await item("property-film"))!.installs).toBe(1);
  });

  it("refuses an entry that is not there", async () => {
    await expect(
      inTenant(() => wizards.createWizard("u", { starterId: "nope" })),
    ).rejects.toThrow(/no starter/);
  });
});

describe("reading an entry written for a newer app", () => {
  it("counts a definition only when nothing of it is lost", () => {
    expect(market.readable(definition)).toBe(true);
    const newer = structuredClone(definition) as any;
    newer.steps[1].somethingNew = { deep: true };
    expect(market.readable(newer)).toBe(false);
    const unknownStep = structuredClone(definition) as any;
    unknownStep.steps[1].type = "teleport";
    expect(market.readable(unknownStep)).toBe(false);
  });
});

describe("an admin", () => {
  let wizardId: string;
  let itemId: string;

  it("puts a wizard of their own into the marketplace", async () => {
    await inTenant(async () => {
      wizardId = (await wizards.createWizard("local", { definition })).id;
      const made = await admin.publishToMarketplace(ADMIN, {
        wizardId,
        language: "de",
        status: "published",
        industries: ["events"],
        useCases: ["marketing"],
      });
      itemId = made.id;
      expect(made).toEqual({ id: "grusskarte", revision: 1 });
    });
    const entry = (await market.listMarketplace("de")).find((e) => e.id === itemId)!;
    expect(entry.title).toBe("Grußkarte");
    expect(entry.industries).toEqual(["events"]);
    expect(entry.capabilities).toEqual(["text"]);
    expect(entry.formats).toEqual(["text"]);
  });

  it("keeps a translation next to the original, and drops one that changed the wizard", async () => {
    const translated = structuredClone(definition) as any;
    translated.title = "Greeting card";
    translated.steps[0].fields[0].options = ["Birthday", "Wedding"];
    model.answer = `\`\`\`json\n${JSON.stringify({
      title: "Greeting card",
      pitch: "A card for the occasion.",
      definition: translated,
    })}\n\`\`\``;
    await inTenant(() => admin.translateItem(ADMIN, itemId, "en"));
    const en = (await market.listMarketplace("en")).find((e) => e.id === itemId)!;
    expect(en.title).toBe("Greeting card");
    expect(en.language).toBe("en");
    expect((await market.marketplaceWizard(itemId, "en"))!.definition.title).toBe("Greeting card");
    // An untranslated entry is listed in its own language.
    expect((await market.listMarketplace("en")).find((e) => e.id === "invoice")!.language).toBe(
      "de",
    );

    const broken = structuredClone(translated);
    broken.steps[0].fields[0].id = "event";
    model.answer = JSON.stringify({ title: "x", pitch: "y", definition: broken });
    await expect(inTenant(() => admin.translateItem(ADMIN, itemId, "en"))).rejects.toThrow(
      /Übersetzung/,
    );
  });

  it("writes the next revision, which puts the translation out of date", async () => {
    await inTenant(async () => {
      const made = await admin.publishToMarketplace(ADMIN, { wizardId, itemId, language: "de" });
      expect(made.revision).toBe(2);
    });
    const en = (await market.listMarketplace("en")).find((e) => e.id === itemId)!;
    expect(en.language).toBe("de");
    const row = (await market.listMarketplaceAdmin("de")).find((e) => e.id === itemId)!;
    expect(row.languages).toEqual(["de"]);
    // What the admin set before stays.
    expect(row.industries).toEqual(["events"]);
    expect(row.status).toBe("published");
  });

  it("unlists and removes", async () => {
    await admin.updateItem(ADMIN, itemId, { status: "unlisted", title: "Karte" });
    expect((await market.listMarketplace("de")).some((e) => e.id === itemId)).toBe(false);
    expect((await market.listMarketplaceAdmin("de")).find((e) => e.id === itemId)!.title).toBe(
      "Karte",
    );
    expect(await admin.deleteItem(ADMIN, itemId)).toEqual({ deleted: true });
    expect(await item(itemId)).toBeUndefined();
    // One of the base set would come back at the next start.
    expect(await admin.deleteItem(ADMIN, "damage")).toEqual({ deleted: false });
    expect((await item("damage"))!.status).toBe("unlisted");
  });

  it("is the one person of a runtime that runs alone, when MARKETPLACE_ADMINS names `local`", () => {
    expect(market.isMarketplaceAdmin({ email: "" })).toBe(true);
  });
});

describe("a runtime that runs alone", () => {
  const remote = (id: string, revision: number, def: unknown) => ({
    id,
    revision,
    language: "de",
    formats: ["text"],
    industries: ["retail"],
    useCases: ["sales"],
    position: 5,
    credits: 12,
    creditsHigh: 30,
    texts: [
      { language: "de", title: `${id} de`, pitch: "p", definition: def, machine: false },
      { language: "en", title: `${id} en`, pitch: "p", definition: def, machine: true },
    ],
    files: { "notes.md": Buffer.from("hello").toString("base64") },
  });

  function source(items: Record<string, ReturnType<typeof remote>>, unlisted: string[] = []) {
    vi.stubGlobal("fetch", async (url: string) => {
      const path = new URL(url).pathname;
      const json = (body: unknown) => new Response(JSON.stringify(body));
      if (path === "/api/public/marketplace/index") {
        return json({
          items: [
            ...Object.values(items).map((i) => ({
              id: i.id,
              revision: i.revision,
              status: "published",
            })),
            ...unlisted.map((id) => ({ id, revision: 1, status: "unlisted" })),
          ],
        });
      }
      const id = path.match(/marketplace\/([^/]+)\/export$/)?.[1];
      return id && items[id] ? json(items[id]) : new Response("", { status: 404 });
    });
  }

  it("takes over what its source lists", async () => {
    const newer = structuredClone(definition) as any;
    newer.steps[1].somethingNew = true;
    source({
      fresh: remote("fresh", 3, definition),
      future: remote("future", 1, newer),
      invoice: remote("invoice", 7, definition),
    });
    await market.syncMarketplace(true);

    const list = await market.listMarketplace("en");
    const fresh = list.find((e) => e.id === "fresh")!;
    expect(fresh).toMatchObject({ title: "fresh en", revision: 3, usable: true });
    expect(fresh.credits).toEqual({ credits: 12, high: 30 });
    expect((await market.marketplaceWizard("fresh", "de"))!.files["notes.md"].toString()).toBe(
      "hello",
    );
    // The source's version of a base entry replaces the one the app shipped.
    expect((await item("invoice"))!).toMatchObject({ origin: "cloud", revision: 7 });

    // An entry for a newer app is listed as such and cannot be started from.
    expect(list.find((e) => e.id === "future")!.usable).toBe(false);
    await expect(market.marketplaceWizard("future", "de")).rejects.toThrow(/neuere Version/);
  });

  it("drops what the source no longer lists, and leaves an admin's own entries", async () => {
    await client.controlDb
      .update(client.control.marketplaceItem)
      .set({ origin: "admin" })
      .where(eq(client.control.marketplaceItem.id, "future"));
    source({ invoice: remote("invoice", 7, definition) }, ["fresh"]);
    await market.syncMarketplace(true);
    expect((await item("fresh"))!.status).toBe("unlisted");
    expect((await item("future"))!.status).toBe("published");
    expect((await item("invoice"))!.status).toBe("published");
  });

  it("keeps what it has when the source does not answer", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new Error("offline");
    });
    await market.syncMarketplace(true);
    expect((await market.listMarketplace("de")).length).toBeGreaterThan(15);
  });
});
