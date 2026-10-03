import type { Format } from "@engenty-wizards/shared/definition";
import type { Starter } from "./types.js";

/**
 * Small wizards for a company's website: one page of questions, one step, a result the visitor
 * takes along. What the company knows (prices, opening hours, its range) sits in a file of the
 * wizard's workspace — the example text is replaced with the company's own.
 */

const PRACTICE_FACTS = `# Praxis Lindenhof – Physiotherapie

(Beispieltext – ersetze ihn durch die Angaben deines Betriebs.)

## Kontakt und Zeiten
Lindenhofgasse 12, 8010 Graz · Telefon 0316 123 45 60 · termin@praxis-lindenhof.example
Montag bis Donnerstag 7:30–19:00, Freitag 7:30–14:00. Samstag und Sonntag geschlossen.
Termine telefonisch oder online; Erstgespräche meist innerhalb von fünf Werktagen.

## Leistungen und Preise
- Physiotherapie Einzelbehandlung 30 Minuten: € 58
- Physiotherapie Einzelbehandlung 45 Minuten: € 82
- Manuelle Lymphdrainage 45 Minuten: € 78
- Heilmassage 30 Minuten: € 49
- Hausbesuch: Zuschlag € 25
Wir sind Wahltherapeuten: Sie zahlen die Behandlung und reichen die Rechnung bei Ihrer Kasse ein. Die ÖGK erstattet je nach Behandlung etwa € 20 bis € 30.

## Was Sie brauchen
Eine ärztliche Verordnung (Überweisung), bei der ÖGK vor der ersten Behandlung bewilligt. Bitte Befunde und bequeme Kleidung mitbringen.

## Absagen
Kostenlos bis 24 Stunden vor dem Termin, danach verrechnen wir die Behandlung.

## Anfahrt
Straßenbahn 1 und 7, Haltestelle Lindenhof. Zwei Kundenparkplätze im Hof, sonst Kurzparkzone. Die Praxis ist barrierefrei (Lift).
`;

const PAINTER_PRICES = `artikel;beschreibung;einheit;preis_netto
W-STD;Wände streichen, Dispersion weiß, 2 Anstriche;m² Wandfläche;9.50
W-FARB;Wände streichen, Farbton nach Wahl, 2 Anstriche;m² Wandfläche;11.50
D-STD;Decke streichen, weiß, 2 Anstriche;m² Deckenfläche;10.50
SPACHT;Risse und Löcher spachteln, schleifen, grundieren;m² Wandfläche;6.00
TAP-AB;Alte Tapete entfernen;m² Wandfläche;5.50
TUER;Tür mit Zarge lackieren, beidseitig;Stk;145.00
HEIZ;Heizkörper lackieren;Stk;85.00
ABDECK;Abdecken, Abkleben und Endreinigung;pauschal je Raum;45.00
ANF;Anfahrt und Baustelleneinrichtung;pauschal;90.00
`;

const BIKE_RANGE = `modell;typ;preis;fuer_wen;rahmen;reichweite_km;link
Stadtflitzer 7;Citybike;749;Alltag und kurze Wege in der Stadt, aufrecht sitzen;S M L;;https://radhaus.example/stadtflitzer-7
Pendler E-400;E-Citybike;2490;Täglich 5 bis 20 km zur Arbeit, auch mit Steigung;S M L XL;90;https://radhaus.example/pendler-e-400
Tourer 28;Trekkingrad;1190;Radreisen und lange Touren mit Gepäck;M L XL;;https://radhaus.example/tourer-28
Tourer E-625;E-Trekkingrad;3390;Lange Touren und Hügel, Gepäck, auch für zwei unterschiedlich fitte Fahrer;S M L XL;130;https://radhaus.example/tourer-e-625
Kies 1;Gravelbike;1690;Sportlich auf Schotter und Asphalt;S M L;;https://radhaus.example/kies-1
Bergziege 29;Mountainbike Hardtail;1290;Forstwege und leichte Trails;S M L XL;;https://radhaus.example/bergziege-29
Bergziege E-750;E-Mountainbike Fully;4890;Trails und lange Anstiege im Gelände;M L XL;100;https://radhaus.example/bergziege-e-750
Lastenheld E;E-Lastenrad;4590;Zwei Kinder oder der Wocheneinkauf statt Auto;Einheitsgröße;70;https://radhaus.example/lastenheld-e
Faltblitz;Faltrad;890;Bahn-Pendler, wenig Platz in der Wohnung;Einheitsgröße;;https://radhaus.example/faltblitz
Kinderheld 24;Kinderrad 24 Zoll;459;Kinder von etwa 8 bis 11 Jahren;Einheitsgröße;;https://radhaus.example/kinderheld-24
`;

const TAX_OFFICE = `# Kanzlei Berger – Steuerberatung

(Beispieltext – ersetze ihn durch die Angaben deiner Kanzlei.)

Erstgespräch: 45 Minuten, kostenlos, in der Kanzlei oder per Video. Bitte Unterlagen als PDF vorab senden oder in Kopie mitbringen.

## Was wir je Anliegen brauchen
### Gründung
Geschäftsidee in drei Sätzen, geplante Rechtsform (falls schon klar), erwarteter Umsatz und Kosten im ersten Jahr, bisherige Einkünfte, Mietvertrag oder Angebot für Räume, Fragen zu Gewerbeschein und Sozialversicherung.
### Laufende Buchhaltung
Die letzten zwei Jahresabschlüsse oder Einnahmen-Ausgaben-Rechnungen, die letzte Umsatzsteuervoranmeldung, Anzahl der Belege pro Monat, verwendete Programme (Rechnungen, Kassa, Bank), Zahl der Mitarbeiter.
### Arbeitnehmerveranlagung
Jahreslohnzettel (liegt meist schon beim Finanzamt), Belege zu Pendlerpauschale, Fortbildung, Arbeitsmitteln, Kinderbetreuung, Spenden, Zugangsdaten zu FinanzOnline.
### Vermietung
Mietverträge, Kaufvertrag der Immobilie, Kreditvertrag und Zinsaufstellung, Betriebskostenabrechnung, Rechnungen zu Reparaturen und Sanierung.
### Betriebsprüfung oder Post vom Finanzamt
Das Schreiben des Finanzamts mit Datum, alle Bescheide der betroffenen Jahre, bisheriger Schriftverkehr. Fristen im Schreiben beachten – bitte sofort melden.
`;

const INN_OFFER = `# Gasthaus Zum Goldenen Hirschen – Feiern

(Beispieltext – ersetze ihn durch euer Angebot.)

## Räume
- Stüberl: 12 bis 24 Personen, gemütlich, eigener Eingang
- Hirschensaal: 30 bis 80 Personen, Tanzfläche, Beamer und Leinwand
- Gastgarten unter Kastanien: bis 60 Personen, Mai bis September, bei Regen Ausweichen in den Saal
Keine Raummiete ab 20 Personen. Sperrstunde 1 Uhr, Verlängerung bis 3 Uhr € 150 je Stunde.

## Menüs (Preis pro Person)
- Wirtshausmenü, 3 Gänge: Frittatensuppe, Backhendl oder Kürbisstrudel, Topfenknödel – € 39
- Festtagsmenü, 4 Gänge: Vorspeisenteller, Rindsuppe, Tafelspitz oder Zander oder gefüllte Zucchini, Dessertvariation – € 58
- Buffet „Steirisch“ ab 30 Personen: kalte Vorspeisen, drei Hauptgerichte (eines vegetarisch), Dessertbuffet – € 49
- Kindermenü bis 12 Jahre: Schnitzel oder Nudeln, Eis – € 14
Vegetarisch, vegan und glutenfrei ist bei jedem Menü möglich, bitte eine Woche vorher sagen.

## Getränke (Preis pro Person)
- Pauschale 5 Stunden: Aperitif, Wein, Bier, Alkoholfreies, Kaffee – € 36
- Alkoholfrei-Pauschale 5 Stunden – € 19
- Oder nach Verbrauch laut Karte

## Extras
Tischschmuck saisonal € 6 pro Person · Mitternachtsjause € 9 pro Person · DJ-Empfehlungen auf Anfrage
Anzahlung 20 % bei Reservierung, endgültige Personenzahl sieben Tage vorher.
`;

const HOTEL_TIPS = `# Seehotel Sonnblick, Velden am Wörthersee

(Beispieltext – ersetze ihn durch die Tipps eures Hauses.)

Koordinaten für das Wetter: Breite 46.61, Länge 14.04
Frühstück 7:30–10:30 · Seebad und Sauna 7:00–21:00 · Abendessen 18:00–21:00 (Tisch bitte bis 15 Uhr reservieren)

## Bei Sonne
- Pyramidenkogel, Aussichtsturm mit Rutsche: 25 Minuten mit dem Auto, 2 Stunden, € 18 Erwachsene / € 9 Kinder
- Schifffahrt Velden–Maria Wörth–Klagenfurt: Anlegestelle 5 Gehminuten, 1 bis 3 Stunden, ab € 14
- Radrunde um den Wörthersee: 42 km, flach, Leihräder im Hotel € 22 pro Tag (E-Bike € 39)
- Stand-up-Paddling am Hotelsteg: Boards gratis für Gäste
- Wanderung Römerschlucht: ab Hotel, 1,5 Stunden, schattig, mit Kindern gut machbar

## Bei Regen
- Minimundus Klagenfurt: 20 Minuten mit dem Auto, großteils im Freien – nur bei leichtem Regen
- Reptilienzoo Happ: 20 Minuten, 1,5 Stunden, für Kinder
- Therme Warmbad Villach: 25 Minuten, halber Tag
- Schloss Porcia und Altstadt Spittal: 40 Minuten, Museum für Volkskultur

## Essen und Trinken
- Seerestaurant Sonnblick (im Haus): Fisch aus dem See
- Buschenschank Kreuzwirt: 10 Minuten mit dem Auto, Jause, Kinderspielplatz
- Café am Corso: Eis und Kuchen, 8 Gehminuten

## Für Kinder
Kinderclub im Haus Montag bis Freitag 9–12 Uhr ab 4 Jahren. Flacher Einstieg am Strand, Schwimmflügel an der Rezeption.
`;

/** A written answer the visitor reads on the page and can take along. */
function answer(from: string, label: string): { from: string; label: string; formats: Format[] } {
  return { from, label, formats: ["pdf", "md"] };
}

export const WEBSITE_STARTERS: Starter[] = [
  {
    id: "web-faq",
    group: "website",
    title: "Frag uns",
    pitch: "Besucher stellen eine Frage und bekommen die Antwort aus euren eigenen Angaben.",
    files: { "wissen.md": PRACTICE_FACTS },
    definition: {
      version: 1,
      title: "Frag uns",
      description: "Beantwortet Fragen von Besuchern aus den Angaben des Betriebs.",
      avatar: "round",
      intro: "Öffnungszeiten, Preise, Ablauf – frag einfach.",
      steps: [
        {
          id: "ask",
          type: "page",
          title: "Was möchtest du wissen?",
          cta: "Antwort holen",
          fields: [
            {
              id: "question",
              label: "Deine Frage",
              kind: "textarea",
              required: true,
              placeholder: "z. B. Brauche ich eine Überweisung und was zahlt die Kasse?",
            },
          ],
        },
        {
          id: "reply",
          type: "agent",
          title: "Antwort",
          working: "Sieht nach …",
          instructions: `Beantworte die Frage eines Besuchers der Website: {{question}}

Lies zuerst wissen.md mit read_workspace_file. Antworte NUR mit dem, was dort steht – kurz, freundlich, in der Du- oder Sie-Form der Frage, die wichtigste Auskunft zuerst, Zahlen und Zeiten exakt.
Steht die Antwort nicht darin: sag das in einem Satz und nenne, wie man den Betrieb erreicht (Telefon, E-Mail aus der Datei). Nichts dazuerfinden, keine medizinische, rechtliche oder steuerliche Einschätzung.`,
          tools: [],
          output: { format: "markdown" },
          model: "standard",
        },
        {
          id: "done",
          type: "result",
          title: "Deine Antwort",
          deliverables: [{ from: "reply", label: "Antwort", formats: ["md", "txt"] }],
        },
      ],
    },
  },
  {
    id: "web-price",
    group: "website",
    title: "Was kostet das?",
    pitch: "Richtpreis in einer Minute: Angaben des Besuchers, Preise aus eurer Preisliste.",
    files: { "preise.csv": PAINTER_PRICES },
    definition: {
      version: 1,
      title: "Was kostet das Ausmalen?",
      description: "Ein unverbindlicher Richtpreis aus ein paar Angaben und der Preisliste.",
      avatar: "bean",
      intro: "Ein paar Angaben zu den Räumen – dann siehst du, womit du rechnen kannst.",
      steps: [
        {
          id: "rooms",
          type: "page",
          title: "Was soll gestrichen werden?",
          cta: "Richtpreis berechnen",
          fields: [
            {
              id: "what",
              label: "Welche Räume?",
              kind: "textarea",
              required: true,
              placeholder: "z. B. Wohnzimmer 24 m², Schlafzimmer 14 m², Vorzimmer 6 m²",
              help: "Mit der Bodenfläche je Raum, wenn du sie weißt.",
            },
            {
              id: "scope",
              label: "Was gehört dazu?",
              kind: "multiselect",
              options: ["Wände", "Decken", "Türen lackieren", "Heizkörper lackieren"],
              default: ["Wände", "Decken"],
            },
            {
              id: "colour",
              label: "Farbe",
              kind: "select",
              options: ["Weiß", "Farbton nach Wahl"],
              default: "Weiß",
            },
            {
              id: "state",
              label: "Zustand der Wände",
              kind: "select",
              options: [
                "Gut – nur streichen",
                "Risse und Löcher ausbessern",
                "Alte Tapete muss ab",
              ],
              default: "Gut – nur streichen",
            },
          ],
        },
        {
          id: "estimate",
          type: "agent",
          title: "Positionen",
          working: "Sucht die Preise heraus …",
          instructions: `Erstelle die Positionen für einen unverbindlichen Richtpreis.

Räume: {{what}}
Umfang: {{scope}} · Farbe: {{colour}} · Zustand: {{state}}

Lies preise.csv mit read_workspace_file (artikel; beschreibung; einheit; preis_netto).
- Wandfläche eines Raums ≈ 2,6 × Bodenfläche, Deckenfläche = Bodenfläche. Fehlt die Fläche, nimm 16 m² Bodenfläche an und sag das in assumptions.
- Pro Leistung EINE Position über alle Räume: description aus der Preisliste, quantity = die Fläche bzw. Anzahl (auf ganze Zahlen gerundet), unit, price = Einzelpreis GENAU aus der Preisliste.
- „Abdecken, Abkleben und Endreinigung“ einmal je Raum, „Anfahrt“ einmal.
- Nur was gewünscht ist und in der Preisliste steht. Rechne keine Summen.
assumptions: in einem Satz, wovon du ausgegangen bist.`,
          tools: [],
          output: {
            format: "json",
            fields: [
              {
                id: "positions",
                kind: "table",
                description: "Positionen",
                columns: ["description", "quantity", "unit", "price"],
              },
              { id: "assumptions", kind: "text", description: "Annahmen" },
            ],
          },
          model: "standard",
        },
        {
          id: "confirm",
          type: "page",
          title: "Haben wir dich richtig verstanden?",
          description: "Ändere Mengen, die nicht stimmen.",
          cta: "Richtpreis anzeigen",
          fields: [
            {
              id: "items",
              label: "Leistungen",
              kind: "items",
              required: true,
              prefill: "steps.estimate.positions",
              columns: [
                { id: "description", label: "Leistung", kind: "text" },
                { id: "quantity", label: "Menge", kind: "number" },
                { id: "unit", label: "Einheit", kind: "text" },
                { id: "price", label: "Einzelpreis", kind: "money" },
              ],
              vat: { rate: 20 },
              currency: "EUR",
            },
          ],
        },
        {
          id: "quote",
          type: "generate",
          title: "Richtpreis",
          working: "Stellt den Richtpreis zusammen …",
          asset: "document",
          prompt: `„Ihr Richtpreis“ – eine Seite, freundlich, vom Malerbetrieb an einen Interessenten.
Kurzer Einleitungssatz, dann die Positionen und Summen – exakt so übernehmen:
{{items}}
Darunter: „Davon sind wir ausgegangen: {{steps.estimate.assumptions}}“
Hinweis: unverbindlicher Richtpreis; das verbindliche Angebot gibt es nach einer kostenlosen Besichtigung. Schluss: Einladung, einen Besichtigungstermin zu vereinbaren, mit den Kontaktdaten des Betriebs, falls bekannt.`,
          options: { template: "offer" },
          model: "standard",
        },
        {
          id: "done",
          type: "result",
          title: "Dein Richtpreis",
          message: "Unverbindlich – das genaue Angebot machen wir nach einer Besichtigung.",
          deliverables: [{ from: "quote", label: "Richtpreis", formats: ["pdf"] }],
        },
      ],
    },
  },
  {
    id: "web-advisor",
    group: "website",
    title: "Produktberater",
    pitch: "Vier Fragen, dann die passende Empfehlung aus eurem Sortiment – mit Begründung.",
    files: { "sortiment.csv": BIKE_RANGE },
    definition: {
      version: 1,
      title: "Welches Rad passt zu mir?",
      description: "Empfiehlt nach ein paar Fragen das passende Produkt aus dem Sortiment.",
      avatar: "wedge",
      intro: "Vier kurze Fragen – dann weißt du, welches Rad zu dir passt.",
      steps: [
        {
          id: "needs",
          type: "page",
          title: "Wofür brauchst du das Rad?",
          cta: "Empfehlung zeigen",
          fields: [
            {
              id: "use",
              label: "Was hast du vor?",
              kind: "multiselect",
              required: true,
              options: [
                "Zur Arbeit pendeln",
                "Kurze Wege in der Stadt",
                "Touren und Radreisen",
                "Sport auf Schotter oder im Gelände",
                "Kinder oder Einkauf transportieren",
                "Ein Rad für mein Kind",
              ],
            },
            {
              id: "motor",
              label: "Mit Motor?",
              kind: "select",
              options: ["Egal", "Ja, E-Bike", "Nein, ohne Motor"],
              default: "Egal",
            },
            {
              id: "budget",
              label: "Budget",
              kind: "select",
              options: ["bis € 1.000", "bis € 2.500", "bis € 4.000", "Egal"],
              default: "bis € 2.500",
            },
            { id: "height", label: "Körpergröße in cm", kind: "number" },
          ],
        },
        {
          id: "advice",
          type: "agent",
          title: "Empfehlung",
          working: "Sieht das Sortiment durch …",
          instructions: `Empfiehl einem Besucher das passende Rad.
Vorhaben: {{use}} · Motor: {{motor}} · Budget: {{budget}} · Körpergröße: {{height}} cm

Lies sortiment.csv mit read_workspace_file. Empfiehl NUR Modelle daraus, mit Preis und Link genau wie dort.
## Unsere Empfehlung
Ein Modell: Name, Preis, drei kurze Gründe, die sich auf die Angaben beziehen, die passende Rahmengröße (bis 165 cm S, bis 178 cm M, bis 190 cm L, darüber XL – wenn das Modell sie hat), der Link.
## Auch eine gute Wahl
Ein zweites Modell mit einem Satz, wann es die bessere Wahl wäre.
Passt nichts ins Budget, sag das offen und nenne das nächstliegende Modell. Zum Schluss ein Satz: Probefahrt im Geschäft.`,
          tools: [],
          output: { format: "markdown" },
          model: "standard",
        },
        {
          id: "done",
          type: "result",
          title: "Das passt zu dir",
          deliverables: [answer("advice", "Empfehlung")],
        },
      ],
    },
  },
  {
    id: "web-appointment",
    group: "website",
    title: "Termin vorbereiten",
    pitch: "Vor dem Erstgespräch: Anliegen schildern, Checkliste mit allen Unterlagen bekommen.",
    files: { "kanzlei.md": TAX_OFFICE },
    definition: {
      version: 1,
      title: "Erstgespräch vorbereiten",
      description:
        "Aus dem Anliegen wird eine Checkliste: was mitzubringen ist und welche Fragen kommen.",
      avatar: "dome",
      intro: "Sag kurz, worum es geht – du bekommst eine Checkliste für unser erstes Gespräch.",
      steps: [
        {
          id: "concern",
          type: "page",
          title: "Worum geht es?",
          cta: "Checkliste erstellen",
          fields: [
            {
              id: "topic",
              label: "Dein Anliegen",
              kind: "select",
              required: true,
              options: [
                "Gründung",
                "Laufende Buchhaltung",
                "Arbeitnehmerveranlagung",
                "Vermietung",
                "Betriebsprüfung oder Post vom Finanzamt",
                "Etwas anderes",
              ],
            },
            {
              id: "story",
              label: "Erzähl kurz",
              kind: "audio",
              help: "Was ist die Situation, was möchtest du erreichen?",
            },
            { id: "storyText", label: "Oder schreib es auf", kind: "textarea" },
          ],
        },
        {
          id: "checklist",
          type: "agent",
          title: "Checkliste",
          working: "Schreibt deine Checkliste …",
          instructions: `Schreibe die Checkliste für ein Erstgespräch.
Anliegen: {{topic}}
Geschildert (wörtlich): {{story}} {{storyText}}

Lies kanzlei.md mit read_workspace_file: dort steht, was die Kanzlei je Anliegen braucht und wie das Erstgespräch abläuft. Verwende nur das.

# Ihre Checkliste für das Erstgespräch
Ein Satz, der das Anliegen in eigenen Worten zusammenfasst.
## Bitte mitbringen
Als Liste zum Abhaken („- [ ] …“) – nur was zu diesem Anliegen und zur Schilderung passt.
## Das werden wir Sie fragen
Drei bis fünf Fragen.
## So läuft das Gespräch ab
Dauer, Kosten, Ort.
Keine steuerliche Beratung oder Einschätzung, keine Zahlen, die nicht in den Angaben stehen.`,
          tools: [],
          output: { format: "markdown" },
          model: "standard",
        },
        {
          id: "done",
          type: "result",
          title: "Deine Checkliste",
          message: "Am besten ausdrucken oder aufs Handy speichern.",
          deliverables: [answer("checklist", "Checkliste")],
        },
      ],
    },
  },
  {
    id: "web-complaint",
    group: "website",
    title: "Reklamation melden",
    pitch: "Foto, Bestellnummer scannen, kurz erzählen – fertig ist die vollständige Reklamation.",
    definition: {
      version: 1,
      title: "Reklamation melden",
      description:
        "Fotos, Bestellnummer und eine kurze Schilderung werden zu einer vollständigen Reklamation.",
      avatar: "pebble",
      intro: "Das tut uns leid. Zeig uns kurz, was nicht passt – wir kümmern uns.",
      steps: [
        {
          id: "what",
          type: "page",
          title: "Was ist passiert?",
          fields: [
            {
              id: "photos",
              label: "Fotos",
              kind: "image",
              multiple: true,
              required: true,
              max: 4,
              help: "Das ganze Produkt und der Fehler aus der Nähe.",
            },
            {
              id: "order",
              label: "Bestell- oder Rechnungsnummer",
              kind: "text",
              scan: true,
              help: "Eintippen oder den Code auf Lieferschein oder Verpackung scannen.",
            },
            { id: "note", label: "Erzähl kurz", kind: "audio" },
            { id: "details", label: "Oder schreib es auf", kind: "textarea" },
          ],
        },
        {
          id: "who",
          type: "page",
          title: "Wie erreichen wir dich?",
          cta: "Reklamation erstellen",
          fields: [
            {
              id: "wish",
              label: "Was wünschst du dir?",
              kind: "select",
              options: ["Ersatz", "Reparatur", "Geld zurück", "Bitte um Rückruf"],
              default: "Ersatz",
            },
            { id: "name", label: "Dein Name", kind: "text", required: true },
            { id: "email", label: "E-Mail", kind: "email", required: true },
          ],
        },
        {
          id: "summary",
          type: "agent",
          title: "Beschreibung",
          working: "Sieht sich die Fotos an …",
          instructions: `Schreibe die sachliche Beschreibung für eine Reklamation. Sieh dir zuerst die Fotos an: {{photos}}
Geschildert (wörtlich): {{note}} {{details}}
Bestellung: {{order}}

Abschnitte: „Mangel“ (was laut Fotos und Schilderung nicht in Ordnung ist, 2 bis 4 Sätze) · „Erkennbar auf den Fotos“ (Aufzählung) · „Fehlt noch“ (nur wenn zur Bearbeitung etwas fehlt, z. B. die Bestellnummer). Nichts erfinden, keine Schuldzuweisung, keine Zusage.`,
          tools: [],
          output: { format: "markdown" },
          model: "standard",
        },
        {
          id: "report",
          type: "generate",
          title: "Reklamation",
          working: "Setzt die Reklamation …",
          asset: "document",
          prompt: `Reklamation vom {{today}}.
Kopfdaten als kleine Tabelle: Name {{name}} · E-Mail {{email}} · Bestellung {{order}} · Wunsch: {{wish}}
Beschreibung – wörtlich übernehmen:
{{steps.summary}}
Darunter „Fotos“: alle Fotos der Person in einem Raster mit zwei Spalten. Leere Angaben weglassen.`,
          options: { template: "report" },
          model: "standard",
        },
        {
          id: "done",
          type: "result",
          title: "Deine Reklamation ist erfasst",
          message: "Wir melden uns innerhalb von zwei Werktagen. Hier ist deine Kopie.",
          deliverables: [{ from: "report", label: "Reklamation", formats: ["pdf"] }],
        },
      ],
    },
  },
  {
    id: "web-application",
    group: "website",
    title: "Kurzbewerbung",
    pitch:
      "Bewerben in zwei Minuten: Lebenslauf fotografieren, kurz erzählen – fertig ist das Profil.",
    definition: {
      version: 1,
      title: "Bewirb dich in 2 Minuten",
      description: "Lebenslauf und eine Sprachnotiz werden zu einem übersichtlichen Kurzprofil.",
      avatar: "flame",
      intro: "Kein Anschreiben nötig. Lebenslauf hochladen, kurz erzählen – den Rest machen wir.",
      steps: [
        {
          id: "you",
          type: "page",
          title: "Wer bist du?",
          cta: "Bewerbung abschicken",
          fields: [
            { id: "job", label: "Für welche Stelle?", kind: "text", required: true },
            {
              id: "cv",
              label: "Lebenslauf",
              kind: "file",
              camera: true,
              multiple: true,
              help: "PDF, Word oder einfach abfotografieren. Geht auch ohne.",
            },
            {
              id: "why",
              label: "Erzähl kurz: Was kannst du, und warum zu uns?",
              kind: "audio",
              required: true,
            },
            { id: "name", label: "Dein Name", kind: "text", required: true },
            { id: "phone", label: "Telefon oder E-Mail", kind: "text", required: true },
          ],
        },
        {
          id: "profile",
          type: "agent",
          title: "Kurzprofil",
          working: "Liest deinen Lebenslauf …",
          instructions: `Erstelle das Kurzprofil einer Bewerbung auf: {{job}}.
Name: {{name}} · Kontakt: {{phone}}
Lebenslauf: {{cv}} – lies ihn mit read_document, falls einer dabei ist.
Das hat die Person erzählt (wörtlich): {{why}}

# {{name}} – Bewerbung als {{job}}
**Kontakt:** …
## In drei Sätzen
Wer die Person ist und was sie mitbringt – in ihren Worten, ohne Floskeln.
## Erfahrung
Die letzten Stationen mit Zeitraum, neueste zuerst (höchstens fünf).
## Ausbildung und Kenntnisse
## Warum zu uns
Was sie dazu gesagt hat.
## Offene Fragen fürs Gespräch
Zwei, drei Punkte, die aus den Unterlagen nicht hervorgehen (z. B. frühester Beginn, Stundenausmaß).
Nur was im Lebenslauf steht oder gesagt wurde. Keine Bewertung der Person, nichts zu Alter, Herkunft, Familienstand oder Aussehen.`,
          tools: [],
          output: { format: "markdown" },
          model: "standard",
        },
        {
          id: "done",
          type: "result",
          title: "Danke für deine Bewerbung!",
          message: "Wir melden uns innerhalb einer Woche. Das haben wir von dir notiert:",
          deliverables: [answer("profile", "Kurzprofil")],
        },
      ],
    },
  },
  {
    id: "web-event",
    group: "website",
    title: "Feier anfragen",
    pitch: "Anlass, Gäste, Budget – sofort ein Vorschlag mit Raum, Menü und Preis pro Person.",
    files: { "angebot.md": INN_OFFER },
    definition: {
      version: 1,
      title: "Deine Feier bei uns",
      description:
        "Macht aus ein paar Angaben einen Vorschlag mit Raum, Menü und Preis pro Person.",
      avatar: "oval",
      intro: "Erzähl uns von deiner Feier – du bekommst sofort einen Vorschlag.",
      steps: [
        {
          id: "party",
          type: "page",
          title: "Was wird gefeiert?",
          cta: "Vorschlag ansehen",
          fields: [
            {
              id: "occasion",
              label: "Anlass",
              kind: "select",
              required: true,
              options: [
                "Geburtstag",
                "Hochzeit",
                "Taufe",
                "Firmenfeier",
                "Weihnachtsfeier",
                "Trauerfeier",
                "Anderes",
              ],
            },
            { id: "date", label: "Wann?", kind: "date", required: true },
            { id: "guests", label: "Wie viele Gäste?", kind: "number", required: true },
            {
              id: "budget",
              label: "Budget pro Person für Essen",
              kind: "select",
              options: ["bis € 40", "bis € 50", "bis € 60", "Offen"],
              default: "bis € 50",
            },
            {
              id: "wishes",
              label: "Wünsche",
              kind: "textarea",
              placeholder: "z. B. 6 Kinder, zwei Gäste vegan, Tanzen bis spät",
            },
          ],
        },
        {
          id: "proposal",
          type: "agent",
          title: "Vorschlag",
          working: "Stellt deinen Vorschlag zusammen …",
          instructions: `Schreibe den Vorschlag eines Gasthauses für eine Feier.
Anlass: {{occasion}} · Datum: {{date}} · Gäste: {{guests}} · Budget Essen pro Person: {{budget}}
Wünsche: {{wishes}}

Lies angebot.md mit read_workspace_file – schlage NUR daraus vor, Preise exakt wie dort.

# Unser Vorschlag für Ihre Feier
Ein persönlicher Einleitungssatz zum Anlass.
## Der Raum
Der passende für die Gästezahl und die Jahreszeit des Datums, mit einem Satz Begründung.
## Das Menü
Das passende zum Budget, mit den Gängen; Kinder und besondere Kost aus den Wünschen berücksichtigen.
## Getränke
Eine Pauschale als Empfehlung.
## Preise pro Person
Eine kleine Tabelle mit den Einzelpreisen aus dem Angebot. KEINE Gesamtsumme ausrechnen.
## So geht es weiter
Anzahlung, Personenzahl sieben Tage vorher, Rückruf zur Terminbestätigung. Der Termin ist noch nicht reserviert – das klar sagen.`,
          tools: [],
          output: { format: "markdown" },
          model: "standard",
        },
        {
          id: "done",
          type: "result",
          title: "Dein Vorschlag",
          message: "Gefällt er dir? Ruf uns an, dann halten wir den Termin fest.",
          deliverables: [answer("proposal", "Vorschlag")],
        },
      ],
    },
  },
  {
    id: "web-dayplan",
    group: "website",
    title: "Dein Tagesplan",
    pitch: "Für Hotels und Regionen: Wetter am Tag, Interessen – ein Plan aus euren eigenen Tipps.",
    files: { "tipps.md": HOTEL_TIPS },
    definition: {
      version: 1,
      title: "Dein Tag bei uns",
      description: "Stellt aus den Tipps des Hauses und dem Wetter einen Tagesplan zusammen.",
      avatar: "sprout",
      intro: "Sag uns, worauf du Lust hast – wir schauen aufs Wetter und planen deinen Tag.",
      steps: [
        {
          id: "day",
          type: "page",
          title: "Welcher Tag?",
          cta: "Tag planen",
          fields: [
            { id: "date", label: "Datum", kind: "date", required: true },
            {
              id: "who",
              label: "Wer ist dabei?",
              kind: "select",
              options: ["Zu zweit", "Familie mit Kindern", "Freunde", "Allein"],
              default: "Zu zweit",
            },
            {
              id: "likes",
              label: "Worauf habt ihr Lust?",
              kind: "multiselect",
              options: ["Wasser", "Wandern", "Radfahren", "Kultur", "Gut essen", "Entspannen"],
            },
            {
              id: "car",
              label: "Mit dem Auto unterwegs?",
              kind: "toggle",
              default: true,
            },
          ],
        },
        {
          id: "plan",
          type: "agent",
          title: "Tagesplan",
          working: "Schaut aufs Wetter und plant …",
          instructions: `Plane einen Tag für Gäste des Hauses. Datum: {{date}} · Dabei: {{who}} · Lust auf: {{likes}} · Auto: {{car}}

1. Lies tipps.md mit read_workspace_file – dort stehen die Koordinaten, die Zeiten des Hauses und alle Tipps.
2. Hole das Wetter mit http_request: GET https://api.open-meteo.com/v1/forecast?latitude=BREITE&longitude=LAENGE&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset&timezone=auto&start_date={{date}}&end_date={{date}}
   Liegt das Datum mehr als 14 Tage in der Zukunft oder kommt kein Wetter zurück, plane ohne und sag das.
3. Stelle den Tag NUR aus den Tipps der Datei zusammen: Regen wahrscheinlicher als 50 % → Regenprogramm; ohne Auto nur, was zu Fuß, mit dem Schiff oder dem Rad geht.

# Dein Tag am {{date}}
**Wetter:** ein Satz mit Temperatur und Regenrisiko.
## Vormittag · ## Mittag · ## Nachmittag · ## Abend
Je ein Vorschlag mit Uhrzeit, Dauer, Anfahrt und Preis genau wie in den Tipps, und einem Satz, warum er zu euch passt.
**Nicht vergessen:** was mitzunehmen oder zu reservieren ist.`,
          tools: ["http"],
          output: { format: "markdown" },
          model: "standard",
        },
        {
          id: "done",
          type: "result",
          title: "So wird dein Tag",
          deliverables: [answer("plan", "Tagesplan")],
        },
      ],
    },
  },
  {
    id: "web-sitecheck",
    group: "website",
    title: "Website-Check",
    pitch:
      "Für Agenturen: Besucher geben ihre Adresse ein und bekommen fünf konkrete Verbesserungen.",
    definition: {
      version: 1,
      title: "Website-Check in 60 Sekunden",
      description: "Sieht sich eine Website an und nennt die fünf wirksamsten Verbesserungen.",
      avatar: "tower",
      intro:
        "Gib deine Adresse ein – du bekommst fünf Dinge, die du diese Woche verbessern kannst.",
      steps: [
        {
          id: "site",
          type: "page",
          title: "Welche Website?",
          cta: "Website prüfen",
          fields: [
            { id: "url", label: "Adresse", kind: "url", required: true, placeholder: "https://…" },
            {
              id: "goal",
              label: "Was soll die Seite bringen?",
              kind: "select",
              options: ["Anfragen", "Verkäufe im Shop", "Termine", "Bewerbungen", "Bekanntheit"],
              default: "Anfragen",
            },
          ],
        },
        {
          id: "check",
          type: "agent",
          title: "Check",
          working: "Sieht sich die Website an …",
          instructions: `Prüfe die Website {{url}}. Ziel der Seite: {{goal}}.
Öffne mit web_fetch die Startseite und höchstens zwei weitere Seiten, die für das Ziel wichtig sind (Leistungen, Kontakt, Produkt). Kommt dabei kein Text zurück (die Seite baut sich erst im Browser auf), öffne sie stattdessen mit browser_open. Bewerte nur, was du gelesen hast.

# Website-Check: {{url}}
**In einem Satz:** der Eindruck, den ein neuer Besucher in fünf Sekunden bekommt.
## Fünf Verbesserungen für diese Woche
Nummeriert, die wirksamste zuerst. Jede: **was** (mit der Stelle auf der Seite, wörtlich zitiert), **warum** es das Ziel bremst, **so geht's besser** (ein konkreter Formulierungs- oder Aufbauvorschlag). Schau auf: Verständlichkeit der Überschrift, sichtbare Handlungsaufforderung, Vertrauen (Referenzen, Zahlen, Gesichter), Kontaktweg, Seitentitel und Beschreibung für Suchmaschinen, fehlende Antworten auf naheliegende Fragen.
## Was schon gut ist
Zwei Punkte.
Keine Aussagen über Ladezeit, Technik oder Rankings – die siehst du hier nicht. Lässt sich die Seite nicht öffnen, sag das und hör auf.`,
          tools: ["web_fetch", "browser"],
          output: { format: "markdown" },
          model: "standard",
        },
        {
          id: "done",
          type: "result",
          title: "Dein Website-Check",
          message:
            "Sollen wir das gemeinsam umsetzen? Melde dich für ein kostenloses Erstgespräch.",
          deliverables: [answer("check", "Website-Check")],
        },
      ],
    },
  },
  {
    id: "web-funding",
    group: "website",
    title: "Fördercheck",
    pitch:
      "Für Installateure und Energieberater: Vorhaben angeben, aktuelle Förderungen mit Quellen.",
    definition: {
      version: 1,
      title: "Welche Förderung gibt es für mein Vorhaben?",
      description:
        "Recherchiert aktuelle Förderungen für eine Sanierung und fasst sie mit Quellen zusammen.",
      avatar: "dome",
      intro: "Sag uns, was du vorhast – wir sehen nach, welche Förderungen es dafür gerade gibt.",
      steps: [
        {
          id: "project",
          type: "page",
          title: "Was hast du vor?",
          cta: "Förderungen suchen",
          fields: [
            {
              id: "measure",
              label: "Vorhaben",
              kind: "select",
              required: true,
              options: [
                "Fenster tauschen",
                "Heizung tauschen",
                "Photovoltaik",
                "Fassade oder Dach dämmen",
                "Stromspeicher",
                "Ladestation fürs E-Auto",
              ],
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
              required: true,
              placeholder: "z. B. Steiermark",
            },
            {
              id: "building",
              label: "Gebäude",
              kind: "select",
              options: [
                "Einfamilienhaus",
                "Wohnung im Mehrparteienhaus",
                "Mehrparteienhaus",
                "Betrieb",
              ],
              default: "Einfamilienhaus",
            },
            { id: "year", label: "Baujahr (ungefähr)", kind: "number" },
          ],
        },
        {
          id: "research",
          type: "agent",
          title: "Förderungen",
          working: "Sucht aktuelle Förderungen …",
          instructions: `Recherchiere, welche Förderungen es HEUTE gibt für: {{measure}} · {{building}}, Baujahr {{year}} · {{region}}, {{country}}.
Suche bei den zuständigen Stellen selbst (Bund und Land bzw. Kanton, Gemeinde nur wenn leicht zu finden) und öffne deren Seiten. Nur Programme, die laut Quelle derzeit beantragt werden können; ist ein Topf ausgeschöpft oder pausiert, sag das.

# Förderungen für: {{measure}} in {{region}}
**Kurz gesagt:** zwei Sätze.
## Programme
Je Programm: **Name und Stelle** · wie viel (Betrag oder Prozent, Obergrenze) · die wichtigsten Voraussetzungen · Antrag VOR oder nach Beginn · Frist oder Stand des Budgets · Quelle als Link.
## Reihenfolge
Was zuerst zu tun ist, damit keine Förderung verloren geht (meist: Antrag vor Auftrag).
## Quellen
Nummeriert, mit Datum des Abrufs.
Zahlen nur mit Quelle. Unverbindliche Übersicht, keine Förderzusage – das als letzter Satz.`,
          tools: ["web_search", "web_fetch"],
          output: { format: "markdown" },
          model: "high",
        },
        {
          id: "done",
          type: "result",
          title: "Deine Förderübersicht",
          message: "Wir helfen beim Antrag – melde dich, bevor du etwas beauftragst.",
          deliverables: [answer("research", "Förderübersicht")],
        },
      ],
    },
  },
];
