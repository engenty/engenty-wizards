import type { Starter } from "./types.js";

const PORTALS_ON = "Ja, fehlende Belege auch in Kundenportalen holen";

/** A month for the accountant: payments, the receipts that belong to them, and what is missing. */
export const RECEIPTS: Starter = {
  id: "receipts",
  title: "Belege für die Buchhaltung",
  pitch:
    "Zahlungen des Monats, die passenden Belege aus Postfach, Portalen und Fotos – Beleg für Beleg neben der Vorschau geprüft.",
  definition: {
    version: 1,
    title: "Belege für die Buchhaltung",
    description:
      "Sammelt die Belege eines Monats aus Postfach, Kundenportalen und Fotos, ordnet sie den Zahlungen zu und zeigt, was fehlt.",
    avatar: "tower",
    intro:
      "Gib mir die Zahlungen des Monats – ich suche die Belege dazu, und du prüfst jeden neben seiner Vorschau.",
    lists: [
      {
        id: "belege",
        title: "Zahlungen & Belege",
        description: "Jede Zahlung des Monats mit ihrem Beleg. Geprüfte Zeilen bleiben geprüft.",
        key: "zahlung",
        check: { file: "datei", status: "status" },
        columns: [
          { id: "zahlung", name: "Zahlung", type: "text", required: true },
          { id: "datum", name: "Datum", type: "date", format: { kind: "date" } },
          { id: "haendler", name: "Händler", type: "text" },
          {
            id: "betrag",
            name: "Betrag",
            type: "number",
            format: { style: "currency", currency: "EUR" },
          },
          { id: "beleg_nr", name: "Belegnummer", type: "text" },
          { id: "datei", name: "Datei", type: "text" },
          {
            id: "status",
            name: "Status",
            type: "select",
            format: {
              allowCustom: false,
              options: [
                { id: "offen", label: "Offen" },
                { id: "passt", label: "Passt" },
                { id: "passt_nicht", label: "Passt nicht" },
                { id: "kein_beleg", label: "Kein Beleg nötig" },
              ],
            },
          },
          { id: "notiz", name: "Notiz", type: "text", format: { style: "multiline" } },
        ],
      },
      {
        id: "providers",
        title: "Anbieter",
        description: "Von wem regelmäßig Belege kommen – und wie man zu ihnen kommt.",
        key: "provider",
        columns: [
          { id: "provider", name: "Anbieter", type: "text", required: true },
          {
            id: "invoice_source",
            name: "Woher kommt der Beleg?",
            type: "select",
            format: {
              allowCustom: false,
              options: [
                { id: "mail", label: "Per E-Mail" },
                { id: "portal", label: "Im Kundenportal" },
                { id: "both", label: "Beides" },
                { id: "paper", label: "Auf Papier" },
              ],
            },
          },
          { id: "mail_sender", name: "Absender / Suchbegriff", type: "text" },
          { id: "portal_url", name: "Login-Seite", type: "text" },
          {
            id: "invoice_path",
            name: "Weg zum Beleg",
            type: "text",
            format: { style: "multiline" },
          },
          { id: "last_collected", name: "Zuletzt geholt", type: "date", format: { kind: "date" } },
        ],
      },
    ],
    connections: [
      {
        id: "mailbox",
        kind: "mail",
        title: "Dein Postfach",
        description: "Dort suche ich nach Rechnungen und Zahlungsbelegen. Ich lese nur.",
      },
    ],
    steps: [
      {
        id: "start",
        type: "page",
        title: "Welcher Monat?",
        description: "Je mehr ich bekomme, desto weniger bleibt offen.",
        fields: [
          {
            id: "period",
            label: "Für welchen Monat?",
            kind: "select",
            required: true,
            options: ["Letzter Monat", "Vorletzter Monat", "Laufender Monat"],
            default: "Letzter Monat",
          },
          {
            id: "statements",
            label: "Kontoauszug oder Kreditkartenabrechnung",
            kind: "file",
            multiple: true,
            camera: true,
            required: true,
            help: "CSV-Export, PDF oder Foto. Daraus lese ich die Zahlungen des Monats.",
          },
          {
            id: "mailAccount",
            label: "Dein Postfach (optional)",
            kind: "connection",
            connection: "mailbox",
            help: "Einmal verbinden – beim nächsten Mal ist es noch da.",
          },
        ],
      },
      {
        id: "more",
        type: "page",
        title: "Hast du schon Belege?",
        fields: [
          {
            id: "receipts",
            label: "Belege, die du schon hast (optional)",
            kind: "file",
            multiple: true,
            camera: true,
            help: "PDFs oder Fotos von Papierbelegen – fotografiere sie einfach ab.",
          },
          {
            id: "portals",
            label: "Kundenportale",
            kind: "select",
            options: ["Nein, nur Postfach und meine Belege", PORTALS_ON],
            default: "Nein, nur Postfach und meine Belege",
            help: "Für Portale melde ich mich bei dir, wenn ein Login nötig ist. Dein Passwort sehe ich nie.",
          },
          {
            id: "providersList",
            label: "Anbieter, die ich schon kenne",
            kind: "list",
            list: "providers",
          },
        ],
      },
      {
        id: "payments",
        type: "agent",
        title: "Zahlungen lesen",
        working: "Liest die Zahlungen des Monats …",
        instructions: `Zeitraum: {{period}} (heute ist {{today}}; bestimme daraus den Kalendermonat).

Lies die Abrechnungen mit read_document: {{statements}}

Trage JEDE geschäftliche Ausgabe des Monats in die Tabelle payments ein (Abbuchungen, Kartenzahlungen, Lastschriften) – keine Eingänge, keine Umbuchungen zwischen eigenen Konten. Datum als JJJJ-MM-TT. Beträge exakt wie gedruckt, als positive Zahl mit Punkt als Dezimaltrenner. merchant ist der Händlername, so kurz wie eindeutig („Notion“, „ÖBB“, „Hetzner“).
id ist die Kennung der Zahlung, zusammengesetzt aus Datum, Händler und Betrag, z. B. „2026-09-03 Notion 96.00“ – niemals eine laufende Nummer. Die Tabelle ist nach Datum sortiert.
Zahlungen, zu denen es üblicherweise keinen Beleg gibt (Bankspesen, Gehälter, Steuern, Sozialversicherung), bekommen needs_receipt = nein.`,
        tools: [],
        output: {
          format: "json",
          fields: [
            { id: "month", kind: "text", description: "Der Monat als JJJJ-MM" },
            {
              id: "payments",
              kind: "table",
              description: "Zahlungen des Monats",
              columns: ["id", "date", "merchant", "amount", "currency", "needs_receipt"],
            },
          ],
        },
        model: "high",
        next: [{ when: { field: "mailAccount", op: "empty" }, goto: "own" }],
      },
      {
        id: "mail",
        type: "agent",
        title: "Belege im Postfach suchen",
        working: "Durchsucht dein Postfach …",
        instructions: `Suche im Postfach die Belege zu diesen Zahlungen aus {{steps.payments.month}}:
{{steps.payments.payments}}

Anbieter, die ich schon kenne: {{lists.providers}}

Vorgehen:
1. mail_search zuerst gezielt nach den Händlern der Zahlungen (Absender oder Suchbegriff aus der Anbieter-Liste), dann allgemein nach Rechnung, Invoice, Receipt, Beleg, Zahlungsbestätigung – im Zeitraum und bis zehn Tage danach. Suche breit mit mehreren Begriffen pro Aufruf.
2. Speichere jeden Beleg mit mail_save unter belege/{{steps.payments.month}}/JJJJ-MM-TT_Händler_Belegnummer.pdf – mehrere in einem Aufruf. Hat die Mail keinen Anhang und ist selbst der Beleg, speichere die Mail als PDF.
3. Lies die gespeicherten Dateien mit scan_documents (bis zu 30 auf einmal), nicht einzeln.
4. Trage neue Anbieter mit list_write in providers ein (invoice_source, mail_sender, last_collected).

Tabelle found: eine Zeile pro gespeichertem Beleg, Beträge exakt wie gedruckt. Nichts erfinden.`,
        tools: [],
        connections: ["mailbox"],
        output: {
          format: "json",
          fields: [
            {
              id: "found",
              kind: "table",
              description: "Belege aus dem Postfach",
              columns: ["file", "vendor", "number", "date", "total", "currency"],
            },
          ],
        },
        model: "high",
      },
      {
        id: "own",
        type: "agent",
        title: "Deine Belege lesen",
        working: "Liest deine Belege …",
        instructions: `Belege, die die Person selbst mitgebracht hat: {{receipts}}

Wenn keine dabei sind, gib eine leere Tabelle zurück und tu sonst nichts.
Sonst:
1. Lies alle mit scan_documents in EINEM Aufruf (bis zu 30).
2. Behalte jeden mit files_keep unter belege/{{steps.payments.month}}/JJJJ-MM-TT_Händler_Belegnummer.pdf (Fotos mit ihrer Endung .jpg oder .png) – alle in einem Aufruf.

Tabelle found: eine Zeile pro Beleg mit dem Pfad, unter dem er jetzt liegt. Beträge exakt wie gedruckt.`,
        tools: [],
        output: {
          format: "json",
          fields: [
            {
              id: "found",
              kind: "table",
              description: "Mitgebrachte Belege",
              columns: ["file", "vendor", "number", "date", "total", "currency"],
            },
          ],
        },
        model: "standard",
        next: [{ when: { field: "portals", op: "notEquals", value: PORTALS_ON }, goto: "match" }],
      },
      {
        id: "portal",
        type: "agent",
        title: "Belege in Portalen holen",
        working: "Holt fehlende Belege aus den Portalen …",
        instructions: `Hole Belege, die noch fehlen, direkt aus den Kundenportalen.

Zahlungen aus {{steps.payments.month}}: {{steps.payments.payments}}
Schon gefunden im Postfach: {{steps.mail.found}}
Schon mitgebracht: {{steps.own.found}}
Anbieter mit Login-Seite und Weg zum Beleg: {{lists.providers}}

Arbeite nur die Zahlungen ab, die einen Beleg brauchen und noch keinen haben, die größten zuerst.
1. Steht der Weg in der Anbieter-Liste, folge ihm. Sonst öffne die Website des Anbieters und suche Abrechnung / Billing / Rechnungen.
2. Ist ein Login nötig: browser_request_credentials – die Person gibt ihn selbst ein. Captcha oder „Mit Google fortfahren“: browser_request_user. Überspringt die Person, mach ohne diesen Anbieter weiter.
3. Lade den Beleg mit browser_download nach belege/{{steps.payments.month}}/JJJJ-MM-TT_Händler_Belegnummer.pdf.
4. Halte mit list_write in providers fest, wie man zum Beleg kommt (portal_url, invoice_path als kurze Klickfolge, last_collected). Niemals Zugangsdaten speichern.

Tabelle found: eine Zeile pro geladenem Beleg; lies Nummer, Datum und Betrag mit scan_documents aus den Dateien.`,
        tools: ["browser", "web_search"],
        output: {
          format: "json",
          fields: [
            {
              id: "found",
              kind: "table",
              description: "Belege aus Portalen",
              columns: ["file", "vendor", "number", "date", "total", "currency"],
            },
          ],
        },
        model: "high",
      },
      {
        id: "match",
        type: "agent",
        title: "Belege zuordnen",
        working: "Ordnet Belege und Zahlungen zu …",
        instructions: `Ordne die Belege den Zahlungen zu und schreibe das Ergebnis in die Liste belege.

Zahlungen aus {{steps.payments.month}}:
{{steps.payments.payments}}

Belege aus dem Postfach: {{steps.mail.found}}
Mitgebrachte Belege: {{steps.own.found}}
Belege aus Portalen: {{steps.portal.found}}

Was schon in der Liste steht (geprüfte Zeilen NICHT ändern): {{lists.belege}}

Regeln:
- Ein Beleg passt zu einer Zahlung, wenn Händler und Betrag übereinstimmen und das Belegdatum höchstens 35 Tage vor oder 5 Tage nach der Zahlung liegt. Fremdwährung: der Betrag darf dann abweichen – vermerke das in notiz. Jeder Beleg gehört zu höchstens einer Zahlung.
- Schreibe mit list_write in belege EINE Zeile pro Zahlung, nach Datum sortiert, alle in einem Aufruf: zahlung = die id der Zahlung (z. B. „2026-09-03 Notion 96.00“), datum, haendler, betrag (Zahl), beleg_nr, datei (der Pfad des Belegs, sonst leer), status, notiz.
- status ist „offen“ – außer bei Zahlungen ohne Belegpflicht: „kein_beleg“. Zeilen, die in der Liste schon einen anderen Status als „offen“ haben, lässt du aus.
- notiz: nur wenn etwas auffällt („Betrag weicht um 0,40 ab“, „zwei mögliche Belege“, „kein Beleg gefunden – beim Anbieter anfordern“).
- Zeilen früherer Monate (zahlung beginnt nicht mit {{steps.payments.month}}) entfernst du im selben Aufruf über „delete“ – ihre Dateien bleiben im Ordner ihres Monats liegen.
- Rechne nichts um und nichts zusammen; übernimm Zahlen exakt.

Deine Antwort, auf Deutsch: zwei bis vier Sätze – wie viele Zahlungen, wie viele mit Beleg, was offen ist.`,
        tools: [],
        output: { format: "markdown" },
        model: "high",
      },
      {
        id: "check",
        type: "review",
        title: "Passt jeder Beleg?",
        description:
          "Geh die Zahlungen durch: links die Liste, rechts der Beleg. Was du hier bestätigst, frage ich nicht noch einmal.",
        show: ["match", "lists.belege"],
      },
      {
        id: "open",
        type: "agent",
        title: "Offene Punkte",
        working: "Schreibt die offenen Punkte zusammen …",
        instructions: `Die geprüfte Liste für {{steps.payments.month}}:
{{lists.belege}}

Schreibe für die Buchhaltung:
## Übersicht
Zwei, drei Sätze: wie viele Zahlungen, wie viele mit bestätigtem Beleg, wie viele ohne.

## Fehlende Belege
Eine Tabelle der Zahlungen mit Status „offen“ ohne Datei oder „passt_nicht“: Datum, Händler, Betrag, was zu tun ist (aus der Notiz).

## Nachrichten zum Anfordern
Für jeden Händler mit fehlendem Beleg ein kurzer, höflicher Text zum Kopieren (Betreff und drei Sätze): Bitte um die Rechnung zur Zahlung vom … über …, Rechnungsadresse laut Kundenkonto.

Gibt es nichts Offenes, schreib nur die Übersicht und „Alles belegt.“ Zahlen exakt aus der Liste, nichts erfinden.`,
        tools: [],
        output: { format: "markdown" },
        model: "standard",
      },
      {
        id: "done",
        type: "result",
        title: "Der Monat ist vorbereitet",
        message:
          "Das Paket für die Steuerberatung: alle Belege mit der Liste – und was noch fehlt.",
        deliverables: [
          { from: "lists.belege", label: "Belege & Liste", formats: ["zip", "xlsx", "csv"] },
          { from: "open", label: "Offene Punkte", formats: ["pdf", "md", "docx"] },
        ],
      },
    ],
  },
};
