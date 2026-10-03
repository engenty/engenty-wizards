import type { Starter } from "./types.js";

const TAX_OPTIONS = ["20", "19", "0"];

/** The window company's own price list; it edits this file, the wizard only looks prices up. */
const WINDOW_PRICES = `artikel;beschreibung;einheit;preis_netto
KF-S;Kunststofffenster 3-fach verglast (Ug 0,6), Dreh-Kipp, bis 1,0 m²;Stk;420
KF-M;Kunststofffenster 3-fach verglast (Ug 0,6), Dreh-Kipp, bis 1,6 m²;Stk;560
KF-L;Kunststofffenster 3-fach verglast (Ug 0,6), Dreh-Kipp, bis 2,3 m²;Stk;740
KF-XL;Kunststofffenster 3-fach verglast (Ug 0,6), zweiflügelig, bis 3,2 m²;Stk;980
KA-S;Kunststoff-Alu-Fenster 3-fach verglast, Dreh-Kipp, bis 1,0 m²;Stk;540
KA-M;Kunststoff-Alu-Fenster 3-fach verglast, Dreh-Kipp, bis 1,6 m²;Stk;710
KA-L;Kunststoff-Alu-Fenster 3-fach verglast, Dreh-Kipp, bis 2,3 m²;Stk;930
KA-XL;Kunststoff-Alu-Fenster 3-fach verglast, zweiflügelig, bis 3,2 m²;Stk;1240
HA-S;Holz-Alu-Fenster Fichte 3-fach verglast, Dreh-Kipp, bis 1,0 m²;Stk;760
HA-M;Holz-Alu-Fenster Fichte 3-fach verglast, Dreh-Kipp, bis 1,6 m²;Stk;990
HA-L;Holz-Alu-Fenster Fichte 3-fach verglast, Dreh-Kipp, bis 2,3 m²;Stk;1290
HA-XL;Holz-Alu-Fenster Fichte 3-fach verglast, zweiflügelig, bis 3,2 m²;Stk;1680
HO-S;Holzfenster Lärche 3-fach verglast, Dreh-Kipp, bis 1,0 m²;Stk;690
HO-M;Holzfenster Lärche 3-fach verglast, Dreh-Kipp, bis 1,6 m²;Stk;900
HO-L;Holzfenster Lärche 3-fach verglast, Dreh-Kipp, bis 2,3 m²;Stk;1180
HO-XL;Holzfenster Lärche 3-fach verglast, zweiflügelig, bis 3,2 m²;Stk;1540
BT-KF;Balkontür Kunststoff 3-fach verglast, Dreh-Kipp, bis 2,2 m²;Stk;890
BT-KA;Balkontür Kunststoff-Alu 3-fach verglast, Dreh-Kipp, bis 2,2 m²;Stk;1160
BT-HA;Balkontür Holz-Alu 3-fach verglast, Dreh-Kipp, bis 2,2 m²;Stk;1490
BT-HO;Balkontür Holz Lärche 3-fach verglast, Dreh-Kipp, bis 2,2 m²;Stk;1380
HST;Hebe-Schiebe-Tür 3-fach verglast, bis 6,0 m²;Stk;3900
FIX;Fixverglasung 3-fach, bis 2,0 m²;Stk;390
FARBE;Aufpreis Farbe oder Dekor außen (z. B. Anthrazit RAL 7016, Holzdekor), je Element;Stk;85
DEMO;Demontage und fachgerechte Entsorgung des alten Fensters;Stk;95
MONT;Montage nach ÖNORM B 5320 mit Abdichtung innen und außen;Stk;210
FBA;Außenfensterbank Aluminium, bis 1,5 m;Stk;85
FBI;Innenfensterbank, bis 1,5 m;Stk;75
ROLL;Aufsatzrollladen mit Motor, bis 1,6 m²;Stk;520
RAFF;Raffstore mit Motor, bis 2,3 m²;Stk;690
INS;Insektenschutz Spannrahmen;Stk;95
PUTZ;Putz- und Malerarbeiten an der Laibung;Stk;140
ANF;Anfahrt, Aufmaß und Baustelleneinrichtung;pauschal;180
`;

/** On site at the customer's: photos and a voice note become an offer for new windows. */
export const WINDOW_OFFER: Starter = {
  id: "window-offer",
  title: "Angebot Fenstertausch",
  pitch:
    "Vor Ort beim Kunden: Fotos und Maße einsprechen – Positionen aus eurer Preisliste, Angebot als PDF.",
  files: { "fenster/preisliste.csv": WINDOW_PRICES },
  definition: {
    version: 1,
    title: "Angebot Fenstertausch",
    description:
      "Aus Fotos und eingesprochenen Maßen wird ein Angebot für neue Fenster – mit den Preisen aus eurer Preisliste.",
    avatar: "bean",
    intro:
      "Fotografiere die Fenster und sprich die Maße ein – ich suche die Positionen aus der Preisliste und schreibe das Angebot.",
    steps: [
      {
        id: "customer",
        type: "page",
        title: "Für wen ist das Angebot?",
        fields: [
          { id: "customer", label: "Kunde (Name und Anschrift)", kind: "textarea", required: true },
          { id: "contact", label: "Ansprechperson", kind: "text" },
          { id: "site", label: "Wo wird getauscht?", kind: "location" },
        ],
      },
      {
        id: "survey",
        type: "page",
        title: "Welche Fenster?",
        fields: [
          {
            id: "photos",
            label: "Fotos der Fenster",
            kind: "image",
            multiple: true,
            help: "Ein Foto pro Fenster oder Raum, von innen.",
          },
          {
            id: "note",
            label: "Maße einsprechen",
            kind: "audio",
            help: "Raum, Anzahl, Breite mal Höhe in Zentimetern, Öffnungsart. Zum Beispiel: Wohnzimmer, zwei Fenster, 123 mal 148, Dreh-Kipp.",
          },
          {
            id: "details",
            label: "Oder aufschreiben",
            kind: "textarea",
            placeholder: "Wohnzimmer: 2 Fenster 123 × 148 Dreh-Kipp\nKüche: 1 Fenster 98 × 118",
          },
        ],
      },
      {
        id: "spec",
        type: "page",
        title: "Welche Ausführung?",
        fields: [
          {
            id: "material",
            label: "Material",
            kind: "select",
            options: ["Kunststoff", "Kunststoff-Alu", "Holz-Alu", "Holz"],
            default: "Kunststoff",
          },
          {
            id: "colour",
            label: "Farbe außen",
            kind: "select",
            options: ["Weiß", "Anthrazit (RAL 7016)", "Holzdekor", "Sonderfarbe"],
            default: "Weiß",
          },
          {
            id: "extras",
            label: "Was gehört dazu?",
            kind: "multiselect",
            options: [
              "Demontage & Entsorgung",
              "Montage nach ÖNORM",
              "Außenfensterbank",
              "Innenfensterbank",
              "Rollladen",
              "Raffstore",
              "Insektenschutz",
              "Putz- & Malerarbeiten",
            ],
            default: ["Demontage & Entsorgung", "Montage nach ÖNORM"],
          },
        ],
      },
      {
        id: "survey2",
        type: "agent",
        title: "Aufmaß auswerten",
        working: "Liest das Aufmaß und sucht die Preise …",
        instructions: `Du erstellst die Positionen für ein Angebot über den Tausch von Fenstern.

Eingesprochenes Aufmaß (wörtlich): {{note}}
Aufgeschriebenes Aufmaß: {{details}}
Fotos: {{photos}} – sieh sie dir mit read_document an (Anzahl der Flügel, Öffnungsart, Rollladenkasten, Zustand der Laibung, Fensterbänke).
Gewünscht: Material {{material}}, Farbe außen {{colour}}, dazu: {{extras}}

Lies die Preisliste mit read_workspace_file: fenster/preisliste.csv (Spalten: artikel; beschreibung; einheit; preis_netto).

So entstehen die Positionen (Tabelle positions):
1. Pro Raum und Fenstergröße eine Position. Fläche = Breite × Höhe in m². Nimm die Zeile der Preisliste zum Material, deren Größenklasse die Fläche gerade noch abdeckt („bis 1,6 m²“ gilt bis einschließlich 1,60). Balkontüren, Hebe-Schiebe-Türen und Fixverglasungen haben eigene Zeilen.
   description: „Wohnzimmer: Kunststofffenster 3-fach, Dreh-Kipp, 123 × 148 cm (1,82 m²), Weiß“ · quantity: Anzahl · unit: Stk · price: der Netto-Einzelpreis GENAU aus der Preisliste.
2. Ist die Farbe außen nicht Weiß: eine Position „Aufpreis Farbe …“ mit der Anzahl aller Elemente.
3. Für jedes gewünschte Extra eine Position mit der passenden Zeile der Preisliste; die Menge ist die Anzahl der Fenster, zu denen es gehört (Rollladen, Raffstore, Insektenschutz nur dort, wo sie genannt sind – sonst für alle).
4. Zum Schluss „Anfahrt, Aufmaß und Baustelleneinrichtung“ einmal.
Preise NIEMALS schätzen oder ausrechnen: steht etwas nicht in der Preisliste oder ist ein Fenster größer als die größte Klasse, setze price auf 0 und nenne es unter openPoints. Rechne keine Summen.

summary: das Aufmaß in zwei bis vier Sätzen (wie viele Elemente, welche Räume, Besonderheiten von den Fotos).
openPoints: was vor der Bestellung zu klären ist (fehlende Maße, Annahmen bei der Öffnungsart, Sondergrößen). Leer, wenn alles klar ist.`,
        tools: [],
        output: {
          format: "json",
          fields: [
            {
              id: "positions",
              kind: "table",
              description: "Positionen des Angebots",
              columns: ["description", "quantity", "unit", "price"],
            },
            { id: "summary", kind: "text", description: "Das Aufmaß in Worten" },
            { id: "openPoints", kind: "list", description: "Offene Punkte und Annahmen" },
          ],
        },
        model: "high",
      },
      {
        id: "positions",
        type: "page",
        title: "Stimmen die Positionen?",
        description: "Aus Aufmaß und Preisliste. Ändere, was nicht passt – die Summen rechne ich.",
        cta: "Angebot schreiben",
        fields: [
          {
            id: "items",
            label: "Positionen",
            kind: "items",
            required: true,
            prefill: "steps.survey2.positions",
            columns: [
              { id: "description", label: "Leistung", kind: "text" },
              { id: "quantity", label: "Menge", kind: "number" },
              { id: "unit", label: "Einheit", kind: "text" },
              { id: "price", label: "Einzelpreis", kind: "money" },
            ],
            vat: { field: "taxRate" },
            currency: "EUR",
          },
          {
            id: "taxRate",
            label: "Umsatzsteuer (%)",
            kind: "select",
            options: TAX_OPTIONS,
            default: "20",
          },
          {
            id: "leadTime",
            label: "Lieferzeit",
            kind: "select",
            options: ["4–6 Wochen", "6–8 Wochen", "8–10 Wochen"],
            default: "6–8 Wochen",
          },
          {
            id: "validity",
            label: "Gültig für",
            kind: "select",
            options: ["14 Tage", "30 Tage", "60 Tage"],
            default: "30 Tage",
          },
        ],
      },
      {
        id: "pitch",
        type: "agent",
        title: "Einleitung & Leistungsbeschreibung",
        working: "Formuliert das Angebot …",
        instructions: `Schreibe für ein Angebot über den Fenstertausch bei {{customer}} (Ansprechperson: {{contact}}):

1. Eine persönliche Einleitung (3 Sätze), die sich auf den Termin vor Ort bezieht.
2. „Ihre neuen Fenster“: was eingebaut wird – Material {{material}}, 3-fach-Verglasung, Farbe außen {{colour}} – und was das im Alltag bringt (Wärme, Ruhe, Bedienung). Sachlich, keine Zahlen zu Einsparungen, die du nicht kennst.
3. „So läuft der Tausch ab“: Aufmaß-Bestätigung, Fertigung (Lieferzeit {{leadTime}} ab Auftrag), Einbau – in der Regel ein Fenster pro Stunde, bewohnbar bleibt alles –, Abnahme.
4. „Noch zu klären“ – nur wenn es offene Punkte gibt: {{steps.survey2.openPoints}}
5. Ein Satz, dass ihr gern prüft, welche Förderung für die Sanierung infrage kommt.

Aufmaß: {{steps.survey2.summary}}
Diese Positionen werden angeboten:
{{items}}
Keine Preise und keine Summen wiederholen. Zwischenüberschriften und kurze Absätze.`,
        tools: [],
        output: { format: "markdown" },
        model: "high",
      },
      {
        id: "pitchCheck",
        type: "review",
        title: "Passt der Text?",
        description: "Ändere direkt im Text oder fordere eine neue Fassung an.",
        show: ["pitch"],
        edit: true,
        regenerate: true,
      },
      {
        id: "offer",
        type: "generate",
        title: "Angebot setzen",
        working: "Setzt das Angebot …",
        asset: "document",
        prompt: `Angebot „Fenstertausch“ an:
{{customer}}
Ansprechperson: {{contact}}
Einbauort: {{site}}
Datum: {{today}} · Gültig: {{validity}} · Lieferzeit: {{leadTime}} ab Auftrag

Einleitung und Leistungsbeschreibung – wörtlich übernehmen:
{{steps.pitch}}

Positionen und Summen – exakt so übernehmen:
{{items}}

Nach den Summen ein kleiner Abschnitt „Bestand“ mit bis zu vier der Fotos der Person nebeneinander (je etwa 40 mm breit). Am Ende zwei Unterschriftslinien: „Ort, Datum“ und „Auftrag erteilt (Unterschrift Kunde)“.`,
        options: { template: "offer" },
      },
      {
        id: "offerCheck",
        type: "review",
        title: "Angebot prüfen",
        show: ["offer"],
        regenerate: true,
      },
      {
        id: "done",
        type: "result",
        title: "Angebot fertig",
        message: "Als PDF zum Senden – oder gleich beim Kunden am Handy zeigen.",
        deliverables: [
          { from: "offer", label: "Angebot", formats: ["pdf", "docx", "html"] },
          { from: "survey2", label: "Aufmaß & Positionen", formats: ["xlsx", "md"] },
        ],
      },
    ],
  },
};

/** A week of meals for a kindergarten: holidays checked, a plan to hang up, two shopping lists. */
export const MENU_PLAN: Starter = {
  id: "menu-plan",
  title: "Wochen-Menüplan Kindergarten",
  pitch:
    "Feiertage prüfen, Wochenplan für die Pinnwand, dazu die Einkaufsliste für Frisches und für den Vorrat.",
  definition: {
    version: 1,
    title: "Wochen-Menüplan für den Kindergarten",
    description:
      "Plant die Mahlzeiten einer Woche, lässt Feiertage aus und rechnet die Einkaufsmengen für alle Kinder.",
    avatar: "sprout",
    intro: "Für welche Woche und wie viele Kinder? Den Plan und die Einkaufslisten mache ich.",
    lists: [
      {
        id: "gerichte",
        title: "Was es schon gab",
        description:
          "Die Mittagessen der letzten Wochen – damit sich nichts zu schnell wiederholt.",
        key: "gericht",
        columns: [
          { id: "gericht", name: "Gericht", type: "text", required: true },
          { id: "zuletzt", name: "Zuletzt", type: "date", format: { kind: "date" } },
          {
            id: "art",
            name: "Art",
            type: "select",
            format: {
              allowCustom: false,
              options: [
                { id: "fleisch", label: "Fleisch" },
                { id: "fisch", label: "Fisch" },
                { id: "vegetarisch", label: "Vegetarisch" },
                { id: "vegan", label: "Vegan" },
              ],
            },
          },
        ],
      },
    ],
    steps: [
      {
        id: "week",
        type: "page",
        title: "Welche Woche?",
        fields: [
          {
            id: "weekStart",
            label: "Ein Tag der Woche",
            kind: "date",
            required: true,
            help: "Ich plane Montag bis Freitag dieser Woche.",
          },
          {
            id: "country",
            label: "Land",
            kind: "select",
            options: ["Österreich", "Deutschland", "Schweiz"],
            default: "Österreich",
          },
          {
            id: "region",
            label: "Bundesland oder Kanton",
            kind: "text",
            placeholder: "z. B. Steiermark",
            help: "Für Feiertage, die nur dort gelten.",
          },
          { id: "kids", label: "Wie viele Kinder essen mit?", kind: "number", required: true },
          {
            id: "age",
            label: "Alter",
            kind: "select",
            options: ["Krippe (1–3 Jahre)", "Kindergarten (3–6 Jahre)", "Gemischt"],
            default: "Kindergarten (3–6 Jahre)",
          },
        ],
      },
      {
        id: "food",
        type: "page",
        title: "Was kommt auf den Tisch?",
        fields: [
          {
            id: "diet",
            label: "Fleisch oder vegetarisch?",
            kind: "select",
            options: [
              "Mischkost: 1× Fleisch, 1× Fisch",
              "Mischkost: 2× Fleisch, kein Fisch",
              "Vegetarisch",
              "Vegan",
            ],
            default: "Mischkost: 1× Fleisch, 1× Fisch",
          },
          {
            id: "avoid",
            label: "Was soll nicht vorkommen?",
            kind: "multiselect",
            options: ["Schweinefleisch", "Nüsse", "Gluten", "Laktose", "Ei", "Fisch", "Sellerie"],
          },
          {
            id: "meals",
            label: "Welche Mahlzeiten?",
            kind: "multiselect",
            options: ["Vormittagsjause", "Mittagessen", "Nachmittagsjause"],
            default: ["Mittagessen", "Nachmittagsjause"],
          },
          {
            id: "wishes",
            label: "Wünsche (optional)",
            kind: "textarea",
            placeholder: "z. B. Donnerstag ist Suppentag, Kürbis aus dem Garten verwenden",
          },
        ],
      },
      {
        id: "holidays",
        type: "agent",
        title: "Feiertage prüfen",
        working: "Prüft die Feiertage …",
        instructions: `Bestimme Montag bis Freitag der Woche, in der der {{weekStart}} liegt.
Rufe mit http_request die gesetzlichen Feiertage ab: GET https://date.nager.at/api/v3/PublicHolidays/JAHR/LAND – LAND ist AT für Österreich, DE für Deutschland, CH für die Schweiz (hier: {{country}}). Liegt die Woche über dem Jahreswechsel, rufe beide Jahre ab.
Ein Feiertag gilt, wenn „global“ true ist oder seine „counties“ das Bundesland bzw. den Kanton „{{region}}“ enthalten (ISO-Kürzel wie AT-6 für die Steiermark, DE-BY für Bayern, CH-ZH für Zürich). Ist kein Bundesland angegeben, zählen nur die landesweiten.

Tabelle days: fünf Zeilen, Montag bis Freitag – date (JJJJ-MM-TT), weekday (Montag …), open („ja“ oder „nein“), reason (Name des Feiertags, sonst leer).
note: ein Satz für die Leitung, z. B. „Donnerstag, 26.10. ist Nationalfeiertag – 4 Essenstage.“ oder „Keine Feiertage in dieser Woche.“`,
        tools: ["http"],
        output: {
          format: "json",
          fields: [
            {
              id: "days",
              kind: "table",
              description: "Montag bis Freitag",
              columns: ["date", "weekday", "open", "reason"],
            },
            { id: "note", kind: "text", description: "Hinweis zu Feiertagen" },
          ],
        },
        model: "standard",
      },
      {
        id: "plan",
        type: "agent",
        title: "Woche planen",
        working: "Plant die Woche und rechnet die Mengen …",
        instructions: `Plane das Essen einer Kindergartenwoche.

Tage (an Tagen mit open = nein wird nicht gekocht):
{{steps.holidays.days}}
Kinder: {{kids}} · Alter: {{age}}
Kost: {{diet}} · Nicht verwenden: {{avoid}}
Mahlzeiten: {{meals}}
Wünsche: {{wishes}}
Mittagessen der letzten Wochen – davon nichts wiederholen, was jünger als vier Wochen ist:
{{lists.gerichte}}

So sieht eine gute Woche aus:
- Jeden Tag Gemüse, Salat oder Rohkost; mindestens einmal Hülsenfrüchte, einmal Vollkorn; höchstens ein paniertes oder frittiertes Gericht; Süßes als Hauptgericht höchstens einmal.
- Fleisch und Fisch genau so oft, wie die Kost sagt – an den übrigen Tagen vegetarisch. Bei „Vegetarisch“ und „Vegan“ gar nicht.
- Saisonal für die Jahreszeit der Woche, einfach zu kochen in einer Kindergartenküche, Gerichte, die Kinder kennen. Die Jause: Obst, Gemüse, Brot, Milchprodukte – kein Süßgebäck.
- Zutaten über die Woche mehrfach nutzen (Karotten Montag im Eintopf, Mittwoch als Rohkost), damit wenig übrig bleibt.

Mengen: rechne pro Kind und Mittagessen mit etwa 120 g Gemüse, 120 g Kartoffeln oder 45 g Reis/Nudeln (roh), 50 g Fleisch oder 70 g Fisch, 100 g Obst; Krippenkinder etwa zwei Drittel davon. Multipliziere mit {{kids}} Kindern, addiere gleiche Zutaten über die Woche und runde auf handelsübliche Einheiten auf (500 g, 1 kg, Stück, Bund, Liter).

Liefere:
- days: eine Zeile pro Tag, an dem gekocht wird – date, weekday, lunch (das Gericht), sides (Beilage, Salat oder Nachspeise), snack (die Jause; leer, wenn keine Jause gewünscht), allergens (die Hauptallergene in Worten: Gluten, Milch, Ei, Fisch, Sellerie, Senf, Nüsse, Soja), kind (fleisch, fisch, vegetarisch oder vegan).
- fresh: alles Frische zum Einkaufen – product, amount (Zahl), unit, group (Obst & Gemüse, Milchprodukte, Fleisch & Fisch, Brot & Backwaren), buy (für welchen Tag es gebraucht wird; was sich hält, am Montag).
- storage: was aus Vorrat und Lager kommt – product, amount, unit (Nudeln, Reis, Mehl, Öl, Konserven, Gewürze, Tiefkühlware).
- note: zwei Sätze an die Köchin oder den Koch: worauf in dieser Woche zu achten ist.
Schreibe nichts in die Liste gerichte – das geschieht erst, wenn der Plan bestätigt ist.`,
        tools: [],
        output: {
          format: "json",
          fields: [
            {
              id: "days",
              kind: "table",
              description: "Der Wochenplan",
              columns: ["date", "weekday", "lunch", "sides", "snack", "allergens", "kind"],
            },
            {
              id: "fresh",
              kind: "table",
              description: "Frisch einkaufen",
              columns: ["product", "amount", "unit", "group", "buy"],
            },
            {
              id: "storage",
              kind: "table",
              description: "Aus Vorrat und Lager",
              columns: ["product", "amount", "unit"],
            },
            { id: "note", kind: "text", description: "Hinweis für die Küche" },
          ],
        },
        model: "high",
      },
      {
        id: "planCheck",
        type: "review",
        title: "Passt die Woche?",
        description: "Soll ein Tag anders aussehen? Schreib es dazu, dann plane ich neu.",
        show: ["plan"],
        regenerate: true,
      },
      {
        id: "remember",
        type: "agent",
        title: "Gerichte merken",
        working: "Merkt sich die Gerichte …",
        instructions: `Speichere die Mittagessen dieser Woche mit list_write in der Liste gerichte, alle in einem Aufruf: gericht = lunch, zuletzt = date, art = kind.
{{steps.plan.days}}
Antworte mit einem Satz.`,
        tools: [],
        output: { format: "text" },
        model: "standard",
      },
      {
        id: "poster",
        type: "generate",
        title: "Wochenplan gestalten",
        working: "Gestaltet den Wochenplan …",
        asset: "document",
        prompt: `Ein Wochen-Menüplan zum Aufhängen im Kindergarten, EINE Seite A4 QUERFORMAT (@page { size: A4 landscape; margin: 12mm }).
Oben: „Unser Speiseplan“ und die Woche (erstes bis letztes Datum, als „23.–27. Oktober 2026“).
Darunter fünf gleich breite Spalten Montag bis Freitag als freundliche Karten mit abgerundeten Ecken, jede in einer eigenen hellen Farbe: Wochentag und Datum, groß das Mittagessen, darunter Beilage oder Nachspeise, darunter die Jause mit kleiner Überschrift. Ein passendes Emoji pro Gericht. Unter jeder Karte klein die Allergene. Fleisch, Fisch, vegetarisch oder vegan als kleines Etikett.
Ein Tag ohne Essen (Feiertag) ist eine graue Karte mit dem Namen des Feiertags.
Unten eine schmale Zeile: „Änderungen vorbehalten · Allergene auf Nachfrage“.
Große, gut lesbare Schrift – Eltern lesen den Plan im Vorbeigehen. Alles muss auf eine Seite passen.

Tage: {{steps.holidays.days}}
Plan: {{steps.plan.days}}`,
        options: { template: "free" },
        model: "standard",
      },
      {
        id: "shopping",
        type: "generate",
        title: "Einkaufslisten schreiben",
        working: "Schreibt die Einkaufslisten …",
        asset: "document",
        prompt: `Einkaufslisten zum Abhaken für die Küche eines Kindergartens, A4 Hochformat, für {{kids}} Kinder.
Seite 1 „Frisch einkaufen“: nach Gruppe geordnet (Obst & Gemüse, Milchprodukte, Fleisch & Fisch, Brot & Backwaren), je Zeile ein Kästchen zum Abhaken, Produkt, Menge mit Einheit und der Tag, für den es gebraucht wird.
Seite 2 „Aus dem Vorrat“: je Zeile ein Kästchen, Produkt, Menge mit Einheit – zum Prüfen, ob genug da ist.
Darunter der Hinweis für die Küche.
Mengen exakt so übernehmen, nichts ergänzen, nichts weglassen.

Frisch: {{steps.plan.fresh}}
Vorrat: {{steps.plan.storage}}
Hinweis: {{steps.plan.note}}`,
        options: { template: "free" },
        model: "standard",
      },
      {
        id: "done",
        type: "result",
        title: "Die Woche steht",
        message: "Der Plan für die Pinnwand und die Listen für den Einkauf.",
        deliverables: [
          { from: "poster", label: "Wochenplan", formats: ["pdf", "png"] },
          { from: "shopping", label: "Einkaufslisten", formats: ["pdf", "docx"] },
          { from: "plan", label: "Als Tabelle", formats: ["xlsx", "md"] },
        ],
      },
    ],
  },
};
