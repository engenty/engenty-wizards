# Copy style

How engenty wizards talks to people, in English and German. It covers every word a person reads:
the studio, the runner, the CLI, error messages from the server, emails, the site and the docs.
Read it before you add or change a string in `apps/web/src/lib/i18n.ts`,
`packages/shared/src/runner-texts.ts` or `apps/runtime/src/cli/`, or a page in `docs/content`;
`pnpm copy:check` checks the mechanical rules.

Code comments and the developer notes in `docs/*.md` use a compressed style of their own ("A try
is made again by itself when the cloud was the trouble."). That style is fine there, but don't
carry it into the UI or the docs pages.

## The voice in one sentence

A calm person who knows the app explains it to you in plain words: what happens, what it means
for you, and what you can do now.

The copy is at its best when it sounds like this:

| | English | German |
|---|---|---|
| `brand.tagline` | Make a wish. Get your wizard. | Wünsch dir was. Hol dir deinen Wizard. |
| `notify.needsYou` | The wizard needs you for a moment. | Der Wizard braucht dich kurz. |
| `shareRun.kept` | The link works until you withdraw it. | Der Link gilt, bis du ihn zurückziehst. |
| `share.rotateHint` | The old link and the QR code stop working. | Der alte Link und der QR-Code gehen danach nicht mehr. |
| `camera.asking` | Your browser is about to ask for the camera. The picture stays in this wizard. | Dein Browser fragt gleich nach der Kamera. Das Bild bleibt in diesem Wizard. |
| `scan.miss` | No code was found in the photo. Try closer and sharper. | Auf dem Foto war kein Code zu erkennen. Versuch es näher und schärfer. |
| `live.keepRunning` | Anyone in the middle of a run carries on with version {v}. | Wer gerade mittendrin ist, macht mit Version {v} weiter. |
| `space.resultsEmpty` | No results yet. A run shows up here once it is done. | Noch keine Ergebnisse. Ein Lauf steht hier, sobald er fertig ist. |

## Seven rules

1. **Say who does what.** Every sentence has a subject and a verb. No stacks of adjectives in
   front of a noun.
   - ✗ Synced, read-only copy from your local install. Edit this space there.
   - ✓ You edit this space in engenty wizards on your computer. Changes show up here the next time you publish a wizard.
2. **Say what it means for the reader, then stop.** Give the consequence ("stop working", "only
   you see them"), or a reassurance ("never in the database"), or the next step. Leave out the
   mechanism behind it.
3. **Use plain words, and the right ones.** Use everyday words before system words: *your
   computer*, not *local install*; *only to look at*, not *read-only*. Plain does not mean
   metaphor, though. Models don't *think* things, credits don't *think*, and access is not a
   *way*.
   - ✗ Your account's credits think here, like in the cloud.
   - ✓ Runs on your account's credits, as in the cloud.
   - ✗ One short call shows whether the way to the model is open.
   - ✓ One short call checks that the model can be reached.
4. **Keep it short.** One idea per sentence, about 15 words at most. Two sentences beat one
   sentence with a dash and a semicolon. Use at most one dash per string.
5. **Stay calm.** No exclamation marks, no emoji, no marketing adjectives. No *please*/*bitte*
   in the UI: "Try again.", not "Please try again."
6. **Write each language as its own.** Don't copy the sentence structure from the other language.
   Write the German as a German speaker would say it and the English as an English speaker would
   say it. Then read both aloud. If no native speaker would say it to a colleague like that,
   rewrite it.
   - ✗ "Like the system", "(anymore)", "Really delete everything", "Rather without an account?", "an own API key"
   - ✗ "Texte denkt …", "der Weg ist offen", „Mikrofon und Kamera werden gefragt“
7. **Say one thing one way.** Use the words in the [glossary](#glossary). Where a pattern
   already exists, follow it (see [Strings by kind](#strings-by-kind)) and don't invent a sixth
   phrasing.

## Who speaks

| Speaker | When | English | German |
|---|---|---|---|
| Nobody: the app describes things | the default | "The link works until …" | „Der Link gilt, bis …“ |
| The reader, in their own voice | buttons that state a choice | "Use my location", "I'm signed in" | „Meinen Standort verwenden“ |
| *I* / *ich* | Goose, the build assistant, a wizard in conversation | "I need an answer for this one." | „Dafür brauche ich eine Antwort.“ |
| *we* / *wir* | engenty as a company, rarely | "We'll let you know." | „Wir sagen dir Bescheid.“ |

Controls never say *I*: "At most {n} fit here – the rest were left out.", not "… I left out the
rest."

The reader is always *you* / *du*. In German that holds when the text talks about their company,
too: „deine Marke“, never „eure Marke“, never „Ihre“.

## Strings by kind

| Kind | Pattern | English | German |
|---|---|---|---|
| Button | verb + object, sentence case, no period. A bare noun only next to a + icon. | Copy link · Add step · Try again | Link kopieren · Schritt hinzufügen · Erneut versuchen (infinitive) |
| Heading | noun phrase or a question to the reader, no period | Brand assets · What should your wizard do? | Markenmaterial · Was soll dein Wizard können? |
| Hint under a field | 1–2 full sentences with a period: what the field is for, or what happens | Shown above the first page. | Steht über der ersten Seite. |
| Empty state | "No X yet." plus how it fills | No results yet. A run shows up here once it is done. | Noch keine Ergebnisse. Ein Lauf steht hier, sobald er fertig ist. |
| No search results | always the same | No matches. | Nichts gefunden. |
| Error | what happened, then what to do, as full sentences. A raw `{error}` goes last, after a colon. | No connection. Check your network and try again. | Keine Verbindung. Prüf dein Netz und versuch es noch einmal. |
| Delete, confirm | title "Delete “{name}”?"; body: what goes, then "This can't be undone." Buttons "Delete" / "Cancel". Never assemble it in code. | The wizard and its history are deleted. This can't be undone. | Der Wizard und sein Verlauf werden gelöscht. Das lässt sich nicht rückgängig machen. |
| Banner, note | full sentences: the state first, then what you can do | Others see version {v}. Your changes are not live yet. | Andere sehen Version {v}. Deine Änderungen sind noch nicht live. |
| Status chip | lower case, an adjective or participle, no period | running · not installed | läuft · nicht installiert |
| In progress | EN *-ing* + "…"; DE third person or passive + " …" | Loading… · Deleting… | Lädt … · Wird gelöscht … |
| Tooltip | one verb phrase, no period | Drag to change the order | Ziehen, um die Reihenfolge zu ändern |
| Placeholder | an example, no period | e.g. Primary – buttons and headings | z. B. Primär – Knöpfe und Überschriften |

## Glossary

One word per thing, in both languages. Keys in the code may still use old names (`project.*`);
the text must not.

| Thing | English | German | Not |
|---|---|---|---|
| what people build and run | wizard | der Wizard, die Wizards | Assistent (that is the build chat) |
| the box for wizards, brand, knowledge, data | space | der Space, des Space, die Spaces | project, Projekt |
| one time through a wizard | run | der Lauf, die Läufe; Testlauf | Durchlauf; Läufe for chat turns |
| one node of a wizard | step; AI step | Schritt; KI-Schritt | |
| what a run produces | result | Ergebnis | output |
| making a version public | publish; "is live" only as a state | veröffentlichen; „ist live“ | sync, deploy, release, synchronisieren |
| the cloud receiving it | arrives in the cloud | kommt in der Cloud an | synced, sent (except the "Send again" retry) |
| unpublished | draft | Entwurf | |
| usage currency | credits (lower case in text) | Credits; the balance is **Guthaben** | engenty Guthaben, Guthaben des Kontos |
| the engenty login | account; sign in, sign out, sign-in (noun) | Konto; anmelden, abmelden, Anmeldung | log in, login, sign up |
| the person's own machine | your computer, this computer | dein Computer, dieser Computer | local install, this machine, lokale Installation, Rechner |
| … where a phone counts | this device | dieses Gerät | |
| engenty's hosting | the cloud | die Cloud | the server (as a name for it) |
| the editor in the browser | the studio | das Studio | cloud studio |
| the program on the computer | engenty wizards | engenty wizards | the runtime, the app (ambiguous) |
| third-party service a step uses | connector | der Connector | Konnektor (except when quoting Claude's UI) |
| MCP servers in a space | connected systems | verbundene Systeme | |
| code extension | plugin | das Plugin | |
| a key the user brings | API key; your own API key | der API-Key; dein eigener API-Key | API Key (DE), Schlüssel, an own key |
| Claude / ChatGPT plan | subscription | das Abo | |
| what a team pays for | plan | das Paket | Plan, Tarif |
| the exported file | wizard file (.wizard) | Wizard-Datei | Paket (that is the plan) |
| pre-made wizard | template | Vorlage | starter, gallery item |
| documents the AI looks things up in | knowledge | Wissen | |
| tables and pages wizards keep | data | Daten | |
| build chat in the editor | the assistant; the chat | der Assistent; der Chat | conversation, thread |
| the help assistant | Goose | Goose (der) | |
| a spoken call | conversation | Gespräch | |
| gone for good | delete | löschen | |
| taken out, still exists elsewhere | remove | entfernen | |
| picking from options | choose | wählen | pick, select |
| model classes | Classifier, Standard, High, Highest (always English, capitalised) | same | Klassifizieren |
| artificial intelligence | AI | KI | |
| email | email | E-Mail | E-mail |
| the product | engenty wizards (lower case) | engenty wizards | Engenty, engenty.wizards |

## English mechanics

- **British spelling**: colour, licence (noun), summarise, cancelled, enquiry, organise. The
  locale is `en-GB`.
- **Sentence case** for everything, headings and buttons included. Lower case only for status
  chips and fragments that continue a line.
- **Dash**: a spaced en dash ` – `. No em dash `—`, and no ` - `.
- **Ellipsis**: the single character `…`, with no space before it: "Loading…".
- **Quotes**: curly “ ” around names and UI labels. Apostrophe ’.
- **Contractions**: yes, they are what the informal register sounds like: don't, can't, isn't,
  it's, you're, we'll. Don't mix "do not" and "don't" in one flow.
- **No Oxford comma**: "lists, files and connected accounts".
- **`&`** only in labels ("Info & brand"), never in sentences.
- **Periods**: a full sentence gets one. Labels, buttons, tooltips and placeholders don't.
- **Numbers** are written as figures: "20%", "4-second clip", "up to 2 MB". Write estimates as
  "≈ {n}" in labels and "about" in sentences; never use "~".
- **e.g.** with no comma after it. **Menu paths**: Settings → Account, without quotes; a single
  button name goes in quotes: click “Publish”.

## German mechanics

- **Standard German** as written in Germany: Januar, not Jänner; USt-IdNr., not UID on its own;
  Kassierer, not Kassier. Dates and numbers use `de-DE` (5. Januar 2026, 1.234,50 €). Sample data
  may stay Austrian; formats and words may not.
- **du**, always. No *Sie*, and no *ihr*/*euch* for the reader.
- **Dash**: spaced Gedankenstrich ` – `, at most one per string. If the second part stands on
  its own, use a full stop.
- **Ellipsis** with a space: „Lädt …“. **Quotes** „…“; apostrophe ’ („Los geht’s“).
- **Colon**: a capital letter after it when a full sentence follows („Du bist Mitglied: Du
  bearbeitest …“), lower case for a fragment.
- **Buttons** in the infinitive („Speichern“, „Link kopieren“). Imperatives inside sentences
  take the short form where it is common (Versuch, Schreib, Prüf, Nenn, Gib) and the full form
  elsewhere (Wähle, Öffne, Beschreibe). Use one form per string.
- **Verbs before nouns.** Write „Sobald du veröffentlichst …“, not „Nach erfolgter
  Veröffentlichung …“. Avoid IT words like *schreibgeschützt*, *synchronisiert* and *fehlschlagen*.
  In errors, *klappen* is fine: „Das hat nicht geklappt.“
- **Compounds**: use a hyphen with English words and abbreviations (KI-Schritt, API-Key,
  QR-Code, engenty-Konto, engenty-Credits). German with German is closed (Modellklasse,
  Kontodienst, Standardlogos).
- **Genders of English words**: der Wizard, der Space, der Connector, der API-Key, der Chat,
  das Plugin, das Widget, das Studio, das Abo, das HTML.
- **Gender**: address everyone.
  1. Neutral by construction first: „wer deine Website besucht“, „alle, die …“, Person, Team,
     Kundschaft, Publikum. This is what the studio does almost everywhere.
  2. Where a person noun can't be avoided (headings, short labels, lists), use the colon:
     Besucher:innen, Kund:innen, Bewerber:innen, Inhaber:in. Don't build singulars with
     articles („eine:n Besucher:in“); rephrase instead.
  3. Already fine as they are: Mitglied, Gast, Person, Team, Admin, and compounds like
     Benutzername or Entwicklermodus.
  4. No asterisk, no Binnen-I, no paired forms („Kundinnen und Kunden“), no generic masculine.
  If gendering makes a sentence clunky, rephrase it neutrally.
- **Numbers and units** with a space: „20 %“, „4 s“, „≈ 5 Min.“; „z. B.“ with a space.
- **Website** is a whole site, **Webseite** one page of it, **Seite** a page inside engenty.

## The CLI

The CLI uses the same voice and is English only.

- **Help**: each command gets a lower-case verb phrase that says what it does. Don't use a noun
  phrase.
  - ✗ `update     the newest version`
  - ✓ `update     install the latest version`
  - ✗ `status     what is installed and what runs`
  - ✓ `status     show what is installed and running`
- **Commands in text** are always written in full, coloured cyan (`command()`), and without
  backticks: "Run wizards start". **Paths** are shortened with `~` (`tilde()`).
- **Spinners**: "Starting…" while it runs, then a short past-tense result: "Started on
  http://localhost:8890."
- **Words**: *this computer* (not *machine*), *in the background* (not *as a service*), *engenty
  wizards* (not *the runtime*), *space* (not *project*).

## Messages from the server

- The `error` a person sees is a sentence in their language, written to these rules. Machine
  codes go in `code`, never in `error`.
- A run note, a connector error and an import error follow the same error pattern: what
  happened, then what to do.

## The docs

The pages in `docs/content` and the README follow this guide too.

- **User pages** (`docs/content/user`, the README) talk to the reader as *you*, in full sentences
  with a subject and a verb. They use the glossary and the English mechanics: spaced en dash,
  curly quotes and apostrophes, British spelling.
- **Developer pages** (`docs/content/dev`) use the same mechanics and glossary. API names,
  options and technical terms are fine there.
- **Quote the UI exactly.** A label in quotes is exactly what the app shows today: “Publish”,
  not “Go live”. When you rename a label, search the docs for the old one. Inline code is for
  commands, paths, options and code: `wizards start`, `--background`.
- **Check the page against the code** when you change it, and set its `version` to the current
  release (see [development.md](development.md#documentation)).
- **No screenshots for now.** They go stale without anyone noticing, and pages describe each
  screen in words. The README keeps two pictures until screenshots are made automatically.

## Before you commit a string

1. Does each sentence have a subject and a verb?
2. Does it say what this means for the reader, or what they can do?
3. Are the words from the glossary?
4. Read the English and the German aloud. Is each one what a native speaker would say?
5. Run `pnpm copy:check`.
6. If you renamed a label, search `docs/content` for the old one.

## Before and after

| Key | Before | After |
|---|---|---|
| `readonly.project` | Synced, read-only copy from your local install. Edit this space there. | You edit this space in engenty wizards on your computer. Changes show up here the next time you publish a wizard. |
| | Synchronisierte, schreibgeschützte Kopie aus deiner lokalen Installation. Bearbeite diesen Space dort. | Diesen Space bearbeitest du in engenty wizards auf deinem Computer. Änderungen erscheinen hier, sobald du dort wieder einen Wizard veröffentlichst. |
| `readonly.wizard` | Synced, read-only copy from your local install. Edit this wizard there – what you publish there runs here. | You edit this wizard in engenty wizards on your computer. When you publish it there, the new version runs here. |
| | Synchronisierte, schreibgeschützte Kopie aus deiner lokalen Installation. Bearbeite diesen Wizard dort – was du dort veröffentlichst, läuft hier. | Diesen Wizard bearbeitest du in engenty wizards auf deinem Computer. Veröffentlichst du ihn dort, läuft die neue Version hier. |
| `readonly.server` | Read-only: this server only runs the wizards your local install publishes. Build and edit them there. | Wizards run here once you publish them in engenty wizards on your computer. You build and edit them there. |
| | Schreibgeschützt: Dieser Server führt nur die Wizards aus, die deine lokale Installation veröffentlicht. Gebaut und bearbeitet wird dort. | Hier laufen die Wizards, die du in engenty wizards auf deinem Computer veröffentlichst. Gebaut und bearbeitet wird dort. |
| `appbar.system` | Like the system | Match system |
| `run.notFound` | This wizard does not exist (anymore). | This wizard doesn't exist or was deleted. |
| `cloud.again` | It is tried again at {when}. | We'll try again at {when}. |
| `setup.source` | Choose your Engine | Choose how the AI runs |
| `harness.hint` | Text thinks on the {name} installed on this device — on your {sub} and your sign-in there. | Text runs on {name} on this computer, using your {sub}. |
| `store.confirmDelete` | Really delete everything | Yes, delete everything |
| `run.maxFiles` (DE) | Hier gehen höchstens {n} – die übrigen habe ich weggelassen. | Hier gehen höchstens {n} Dateien – die übrigen sind weggelassen. |
| `editor.building` (DE) | Baue den Ablauf … | Baut den Ablauf … |
| `new.placeholder` (DE) | z. B. Kunden geben ihr Produkt … ein | z. B. Kund:innen geben ihr Produkt … ein |
| `widget.upload` (DE) | Eigene HTML hochladen | Eigenes HTML hochladen |
