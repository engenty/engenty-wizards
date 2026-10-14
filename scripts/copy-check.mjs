#!/usr/bin/env node
// Checks the UI's strings against the mechanical rules of docs/copy-style.md: dashes, quotes,
// ellipses, spelling, the address and the glossary's "not" column. Lists what it finds;
// `--strict` also fails on it. The voice itself is for people to check.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const FILES = ["apps/web/src/lib/i18n.ts", "packages/runner/src/i18n.ts"];

/** The `const de` and `const en` object literals of a dictionary file, read without running it. */
function dictionaries(file) {
  const src = readFileSync(root + file, "utf8");
  const out = {};
  for (const lang of ["de", "en"]) {
    const start = new RegExp(`const ${lang}(?:: [^=]+)? = \\{`).exec(src);
    if (!start) continue;
    let i = start.index + start[0].length - 1;
    let depth = 0;
    let quote = null;
    let j = i;
    for (; j < src.length; j++) {
      const c = src[j];
      if (quote) {
        if (c === "\\") j++;
        else if (c === quote) quote = null;
      } else if (c === '"' || c === "'" || c === "`") quote = c;
      else if (c === "{") depth++;
      else if (c === "}" && --depth === 0) break;
    }
    const body = src.slice(i, j + 1).replace(/\.\.\.[A-Z_]+\.(de|en),?/g, "");
    out[lang] = Function(`return ${body}`)();
  }
  return out;
}

// Messages the studio sends to the AI on the person's behalf, not shown as UI.
const AI_FACING = ["widget.buildMessage", "editor.fixIssuesAsk"];

// [rule, pattern, keys allowed to break it]
const RULES = {
  en: [
    ["em dash: use a spaced en dash –", /—/],
    ["hyphen as a dash: use –", / - /, ["data.markdownHint"]],
    ["three dots: use …", /\.\.\./],
    ["space before …", / …/],
    ["straight quotes: use “ ”", /"/],
    ["straight apostrophe: use ’", /\w'\w|s' /],
    ["American spelling", /\b(colors?|colored|summariz\w*|organiz\w*|analyz\w*|favorite|center|canceled)\b/i],
    ["exclamation mark", /!/],
    ["please", /\bplease\b/i, AI_FACING],
    ["glossary: project → space", /\bprojects?\b/i],
    ["glossary: synced / read-only", /\b(synced|read-only)\b/i, ["connectors.actions"]],
    ["glossary: local install / this machine → your computer", /\blocal install\b|\bthis machine\b/i],
    ["glossary: the runtime → engenty wizards", /\bruntime\b/i],
    ["glossary: E-mail → email", /\bE-mail\b/],
    ["glossary: log in → sign in", /\blog ?in\b/i, ["auth.dev"]],
    ["~ for estimates: use ≈ or about", /~ ?\{/],
  ],
  de: [
    ["Geviertstrich: – verwenden", /—/],
    ["Bindestrich als Gedankenstrich: – verwenden", / - /, ["data.markdownHint"]],
    ["drei Punkte: … verwenden", /\.\.\./],
    ["… ohne Leerzeichen davor", /\S…/],
    ["gerade Anführungszeichen: „…“ verwenden", /"/],
    ["gerader Apostroph: ’ verwenden", /\w'\w/],
    ["Sie-Form", /\b(Ihnen|Ihre[mnrs]?)\b|[a-zäöü,] Sie\b/],
    ["ihr/euch für die Lesenden: du verwenden", /\b(euch|eure[mnrs]?)\b/i],
    ["Ausrufezeichen", /!/],
    [
      "generisches Maskulinum: neutral umformulieren oder Doppelpunkt (Kund:innen)",
      /\b(Besucher|Kunden?|Bewerber|Nutzer|Teilnehmer|Mitarbeiter|Endnutzer|Anwender|Händler|Interessent|Patient|Empfänger|Absender|Leser|Betreiber|Inhaber|Kollege|Handwerker|Antragsteller|Käufer|Verkäufer|Lieferant|Mieter|Vermieter|Eigentümer|Auftraggeber|Wettbewerber)(?!:in)(n|en|s)?\b/,
    ],
    ["Glossar: Projekt → Space", /\bProjekt/],
    ["Glossar: schreibgeschützt / synchronisiert", /schreibgeschützt|synchronisiert/i],
    ["Glossar: lokale Installation / Rechner → Computer", /lokalen? Installation|\bRechner/i],
    ["Glossar: API Key → API-Key", /\bAPI Key/],
    ["Glossar: Durchlauf → Lauf", /Durchl[aä]uf/],
    ["Glossar: Konnektor → Connector", /Konnektor/, ["integrate.openConnectors", "integrate.claudeAiWhere", "integrate.desktopWhere", "mcp.claudeAi"]],
    ["~ für Schätzungen: ≈ oder etwa", /~ ?\{/],
  ],
};

const strict = process.argv.includes("--strict");
let total = 0;
for (const lang of ["en", "de"]) {
  const strings = {};
  for (const file of FILES) Object.assign(strings, dictionaries(file)[lang]);
  for (const [rule, pattern, allowed = []] of RULES[lang]) {
    const hits = Object.entries(strings).filter(
      ([key, text]) => !allowed.includes(key) && pattern.test(text.replace(/\{\w+\}/g, "{}")),
    );
    if (!hits.length) continue;
    total += hits.length;
    console.log(`\n${lang.toUpperCase()} · ${rule} (${hits.length})`);
    for (const [key, text] of hits.slice(0, 8)) console.log(`  ${key}: ${text.slice(0, 110)}`);
    if (hits.length > 8) console.log(`  … ${hits.length - 8} more`);
  }
}
console.log(total ? `\n${total} strings break a rule of docs/copy-style.md.` : "Copy checks out.");
process.exitCode = strict && total ? 1 : 0;
