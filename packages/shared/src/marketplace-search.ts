import {
  type CatalogFieldWeights,
  scoreCatalogEntry,
  tokenizeCatalogText,
} from "./engenty/search-index/catalog-lexical.js";
import {
  CAPABILITIES,
  INDUSTRIES,
  ITEM_FORMATS,
  type MarketplaceEntry,
  USE_CASES,
} from "./marketplace.js";

/**
 * Searching the marketplace. Every keystroke is scored by words (BM25 with prefixes and
 * inflections, the scoring engenty's catalogs use); a whole sentence is also read by a model,
 * which sorts the entries and drops what does not fit — see the runtime's `searchMarketplace`.
 */

const WEIGHTS: CatalogFieldWeights = [
  ["title", 10],
  ["summary", 6],
  ["terms", 5],
  ["category", 5],
  ["tags", 3],
];

/** Words a sentence is full of and no entry is found by. */
const STOP = new Set(
  `aber als also am an auch auf aus bei bin bitte brauche brauchen braucht das dass dem den der des
  die dies diese dieser doch du ein eine einem einen einer eines er es etwas fuer für gerne habe
  haben hat ich ihr im in ist kann können koennen mache machen mag mein meine meinem meinen meiner
  mich mir mit möchte moechte nach nicht noch nur oder sich sie sind soll suche um und uns unser
  unsere vom von vor was wie will wir wird wo wollen zu zum zur
  a about an and are as at be can do for from have how i in is it like looking me my need of on or
  our that the this to want we what which who with would you your`.split(/\s+/),
);

const fold = (text: string) => text.replace(/ß/g, "ss");

/** What a query is looked up by: its words, without the ones that say nothing. */
export function searchTerms(query: string): string[] {
  const words = tokenizeCatalogText(fold(query));
  const kept = words.filter((w) => !STOP.has(w));
  return kept.length ? kept : words;
}

/** From this many words on a query is a sentence, and a model reads the entries for it. */
export const SENTENCE_WORDS = 3;
/** Of a sentence's finds by words, those with at least this share of the best score are kept. */
const SENTENCE_SHARE = 0.4;
export const isSentence = (query: string) =>
  query.trim().split(/\s+/).filter(Boolean).length >= SENTENCE_WORDS;

const labels = (all: Record<string, { de: string; en: string }>, ids: string[]) =>
  ids.flatMap((id) => (all[id] ? [all[id].de, all[id].en] : []));

/** How well an entry answers the query by its words; 0 when it does not at all. */
export function scoreEntry(entry: MarketplaceEntry, query: string): number {
  const terms = searchTerms(query);
  if (!terms.length) {
    return 0;
  }
  const record = {
    title: fold(entry.title),
    summary: fold(entry.pitch),
    // A source that is older than this app does not send them.
    terms: (entry.terms ?? []).map(fold),
    category: labels(USE_CASES, entry.useCases),
    tags: [
      ...labels(INDUSTRIES, entry.industries),
      ...labels(ITEM_FORMATS, entry.formats),
      ...labels(CAPABILITIES, entry.capabilities),
    ].map(fold),
  };
  const score = scoreCatalogEntry(record, terms.join(" "), WEIGHTS);
  // German writes words together: "anzeige" is found inside "Videoanzeige" as well.
  const text = tokenizeCatalogText(`${record.title} ${record.summary}`).join(" ");
  const inside = terms.filter((term) => term.length >= 4 && text.includes(term)).length;
  return score + inside * 2;
}

/** The entries a query finds by its words, best first. An empty query keeps the list as it is. */
export function rankEntries<T extends MarketplaceEntry>(entries: readonly T[], query: string): T[] {
  if (!query.trim()) {
    return [...entries];
  }
  const rows = entries
    .map((entry) => ({ entry, score: scoreEntry(entry, query) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score);
  // A sentence shares some word with nearly every entry: only what comes close to the best counts.
  const least = isSentence(query) ? (rows[0]?.score ?? 0) * SENTENCE_SHARE : 0;
  return rows.filter((row) => row.score >= least).map((row) => row.entry);
}
