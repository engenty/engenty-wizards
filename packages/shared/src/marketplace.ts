import type { Format, WizardDefinition } from "./definition.js";

/**
 * The marketplace: wizards anyone can start from. What an entry is sorted by — formats, industry,
 * use case — and what follows from its definition: the AI capabilities it needs, how much a
 * person has to fill in, and how expensive a run is.
 */

export const MARKETPLACE_LANGS = ["de", "en"] as const;
export type MarketplaceLang = (typeof MARKETPLACE_LANGS)[number];

type Labels = Record<MarketplaceLang, string>;

/** What comes out of a run. */
export const ITEM_FORMATS = {
  text: { de: "Text", en: "Text" },
  document: { de: "Dokument (PDF, Word)", en: "Document (PDF, Word)" },
  table: { de: "Tabelle", en: "Table" },
  image: { de: "Bild", en: "Image" },
  video: { de: "Video", en: "Video" },
  audio: { de: "Audio", en: "Audio" },
  dashboard: { de: "Dashboard", en: "Dashboard" },
} satisfies Record<string, Labels>;
export type ItemFormat = keyof typeof ITEM_FORMATS;

export const INDUSTRIES = {
  any: { de: "Jede Branche", en: "Any industry" },
  trades: { de: "Handwerk", en: "Trades" },
  gastronomy: { de: "Gastronomie", en: "Food service" },
  hospitality: { de: "Hotel & Tourismus", en: "Hotels & tourism" },
  realEstate: { de: "Immobilien", en: "Real estate" },
  retail: { de: "Handel", en: "Retail" },
  health: { de: "Gesundheit", en: "Health" },
  professional: { de: "Kanzlei & Beratung", en: "Professional services" },
  agency: { de: "Agentur & Marketing", en: "Agency & marketing" },
  events: { de: "Veranstaltungen", en: "Events" },
  publicSector: { de: "Vereine & Öffentliches", en: "Associations & public sector" },
} satisfies Record<string, Labels>;
export type Industry = keyof typeof INDUSTRIES;

export const USE_CASES = {
  marketing: { de: "Marketing & Social Media", en: "Marketing & social media" },
  sales: { de: "Angebote & Verkauf", en: "Offers & sales" },
  accounting: { de: "Buchhaltung & Belege", en: "Accounting & receipts" },
  service: { de: "Kundenservice", en: "Customer service" },
  research: { de: "Recherche & Analyse", en: "Research & analysis" },
  hr: { de: "Personal & Bewerbungen", en: "HR & applications" },
  operations: { de: "Planung & Abläufe", en: "Planning & operations" },
  website: { de: "Helfer für die Website", en: "Website helpers" },
} satisfies Record<string, Labels>;
export type UseCase = keyof typeof USE_CASES;

/** What the models and tools behind a wizard must be able to do. */
export const CAPABILITIES = {
  text: { de: "Text schreiben", en: "Writes text" },
  web: { de: "Websuche", en: "Web search" },
  browser: { de: "Browser bedienen", en: "Drives a browser" },
  documents: { de: "Dokumente & Fotos lesen", en: "Reads documents & photos" },
  image: { de: "Bilder erzeugen", en: "Makes images" },
  video: { de: "Videos erzeugen", en: "Makes video" },
  speech: { de: "Sprachausgabe", en: "Speech output" },
  listening: { de: "Sprachnotizen verstehen", en: "Understands voice notes" },
  code: { de: "Code ausführen", en: "Runs code" },
  connectors: { de: "Verbundene Konten & Systeme", en: "Connected accounts & systems" },
} satisfies Record<string, Labels>;
export type Capability = keyof typeof CAPABILITIES;

export const COST_TIERS = {
  low: { de: "günstig", en: "low cost" },
  medium: { de: "mittel", en: "medium cost" },
  high: { de: "teuer", en: "high cost" },
} satisfies Record<string, Labels>;
export type CostTier = keyof typeof COST_TIERS;

const keys = <T extends object>(o: T) => Object.keys(o) as (keyof T)[];
export const ITEM_FORMAT_IDS = keys(ITEM_FORMATS);
export const INDUSTRY_IDS = keys(INDUSTRIES);
export const USE_CASE_IDS = keys(USE_CASES);
export const CAPABILITY_IDS = keys(CAPABILITIES);

const FORMAT_OF: Partial<Record<Format, ItemFormat>> = {
  pdf: "document",
  docx: "document",
  xlsx: "table",
  csv: "table",
  png: "image",
  mp4: "video",
  mp3: "audio",
  md: "text",
  txt: "text",
};

/** The formats a run hands over, read from what the result step offers. */
export function formatsOf(def: WizardDefinition): ItemFormat[] {
  const found = new Set<ItemFormat>();
  for (const step of def.steps) {
    if (step.type === "generate" && step.asset === "dashboard") {
      found.add("dashboard");
    }
    if (step.type === "result") {
      for (const d of step.deliverables) {
        const from = def.steps.find((s) => s.id === d.from);
        for (const f of d.formats) {
          const format = FORMAT_OF[f];
          // A dashboard's PNG or PDF is still the dashboard.
          if (format && !(from?.type === "generate" && from.asset === "dashboard")) {
            found.add(format);
          }
        }
      }
    }
  }
  if (!found.size) {
    found.add("text");
  }
  return ITEM_FORMAT_IDS.filter((f) => found.has(f));
}

/** The capabilities a definition needs, read from its steps. */
export function capabilitiesOf(def: WizardDefinition): Capability[] {
  const found = new Set<Capability>();
  for (const step of def.steps) {
    if (step.type === "page") {
      for (const field of step.fields) {
        if (field.kind === "image" || field.kind === "file") {
          found.add("documents");
        }
        if (field.kind === "audio") {
          found.add("listening");
        }
      }
    } else if (step.type === "agent") {
      found.add("text");
      for (const tool of step.tools) {
        if (tool === "web_search" || tool === "web_fetch") {
          found.add("web");
        } else if (tool === "browser") {
          found.add("browser");
        } else if (tool === "sandbox") {
          found.add("code");
        } else if (tool === "image") {
          found.add("image");
        } else if (tool === "http") {
          found.add("connectors");
        }
      }
      if (step.mcp?.length || step.connections?.length) {
        found.add("connectors");
      }
    } else if (step.type === "generate") {
      if (step.asset === "image") {
        found.add("image");
      } else if (step.asset === "video") {
        found.add("video");
      } else if (step.asset === "voice") {
        found.add("speech");
      } else {
        found.add("text");
      }
    }
  }
  if (def.connections?.length) {
    found.add("connectors");
  }
  return CAPABILITY_IDS.filter((c) => found.has(c));
}

/** What a person does in a run, and about how long the whole run takes. */
export interface Effort {
  /** Fields to fill in, the required ones of them. */
  fields: number;
  required: number;
  /** Stops where the person looks at a result before it goes on. */
  reviews: number;
  /** Minutes from start to result: filling in, plus the time the steps work. */
  minutes: number;
}

const WORK_SECONDS = { agent: 25, tools: 70, browser: 150, image: 30, video: 120, voice: 20 };

export function effortOf(def: WizardDefinition): Effort {
  let fields = 0;
  let required = 0;
  let reviews = 0;
  let seconds = 0;
  for (const step of def.steps) {
    if (step.type === "page") {
      fields += step.fields.length;
      required += step.fields.filter((f) => f.required).length;
      seconds += step.fields.length * 15;
    } else if (step.type === "review") {
      reviews += 1;
      seconds += 30;
    } else if (step.type === "agent") {
      seconds += step.tools.includes("browser")
        ? WORK_SECONDS.browser
        : step.tools.length || step.mcp?.length || step.connections?.length
          ? WORK_SECONDS.tools
          : WORK_SECONDS.agent;
    } else if (step.type === "generate") {
      // "each" makes one result per entry; three stands in for a number nobody knows yet.
      const times = step.each ? 3 : 1;
      seconds +=
        times *
        (step.asset === "image"
          ? WORK_SECONDS.image
          : step.asset === "video"
            ? WORK_SECONDS.video
            : step.asset === "voice"
              ? WORK_SECONDS.voice
              : WORK_SECONDS.agent);
    } else if (step.type === "widget" && step.video) {
      seconds += 60;
    }
  }
  return { fields, required, reviews, minutes: Math.max(1, Math.round(seconds / 60)) };
}

/** How expensive a run is, where no price in credits is known: by what it makes and uses. */
export function costTierOf(capabilities: Capability[]): CostTier {
  if (capabilities.includes("video")) {
    return "high";
  }
  return capabilities.some((c) => c === "image" || c === "browser" || c === "speech")
    ? "medium"
    : "low";
}

/** The link that opens an entry in the installed desktop app (`/new?starter=<id>` there). */
export const entryAppLink = (id: string) =>
  `engenty-wizards://new?starter=${encodeURIComponent(id)}`;

// --- what the marketplace answers (docs/marketplace-contract.md) -----------------------------

/** One entry as the marketplace lists it, in a language. */
export interface MarketplaceSummary {
  id: string;
  /** Goes up whenever the entry changes. */
  revision: number;
  /** Of everything the entry is made of, every language and file: changes with any of it. */
  hash: string;
  /** When the entry last changed, ISO 8601. */
  updatedAt: string;
  /** One of the entries an app keeps for offline use without being asked. */
  starter: boolean;
  /** The language of `title` and `pitch`; the entry's own where it is not translated. */
  language: MarketplaceLang;
  title: string;
  pitch: string;
  /** What people ask for when they mean this entry: searched, never shown. */
  terms: string[];
  avatar: string;
  formats: ItemFormat[];
  industries: Industry[];
  useCases: UseCase[];
  capabilities: Capability[];
  effort: Effort;
  costTier: CostTier;
  steps: number;
  /** The definition version the entry's wizard is written in (`DEFINITION_VERSION`). */
  version: number;
}

/** What a search narrows by, besides its words. */
export interface MarketplaceFilters {
  useCase?: UseCase;
  industry?: Industry;
  format?: ItemFormat;
}

/** Per option of a filter: the entries it would leave, with the other filters as they are. */
export interface MarketplaceFacets {
  useCase: Partial<Record<UseCase, number>>;
  industry: Partial<Record<Industry, number>>;
  format: Partial<Record<ItemFormat, number>>;
}

/** A page of a search: the entries, best first, how many there are, and the filters' counts. */
export interface MarketplacePage<T extends MarketplaceSummary = MarketplaceSummary> {
  entries: T[];
  total: number;
  /** Every published entry, before words and filters. */
  all: number;
  facets: MarketplaceFacets;
}

/** One entry with its wizard in a language: what an app starts a wizard from. */
export interface MarketplaceItem extends MarketplaceSummary {
  /** The wizard as written; an app reads it with its own schema. */
  definition: unknown;
  /** The workspace it starts with: path → base64. */
  files: Record<string, string>;
}

/** Everything of an entry, every language: what an app keeps for offline use. */
export interface MarketplaceExport extends MarketplaceSummary {
  texts: {
    language: MarketplaceLang;
    title: string;
    pitch: string;
    definition: unknown;
    /** Written by a model, not by a person. */
    machine: boolean;
  }[];
  /** path → base64 */
  files: Record<string, string>;
}

/** What an app compares with what it keeps: an entry changed where its hash differs. */
export interface MarketplaceSyncItem {
  id: string;
  hash: string;
  updatedAt: string;
}

/** One entry as the app shows it: the summary, read against this app. */
export interface MarketplaceEntry extends MarketplaceSummary {
  /** A run's price in credits and what it rarely exceeds; null where it is not worked out. */
  credits: { credits: number; high: number } | null;
  /** False: this app is older than the entry and would read its wizard wrongly. */
  usable: boolean;
  /** The person keeps it for offline use. */
  starred: boolean;
}
