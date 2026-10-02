import type { WizardDefinition } from "@engenty-wizards/shared/definition";

export interface Starter {
  id: string;
  title: string;
  pitch: string;
  definition: WizardDefinition;
}

const TAX_OPTIONS = ["20", "19", "10", "7", "0"];

export const STARTERS: Starter[] = [
  {
    id: "tweet",
    title: "X-Post mit Bild",
    pitch: "Ein Post in deinem Ton plus passendes Bild.",
    definition: {
      version: 1,
      title: "X-Post mit Bild",
      description: "Aus einem Thema wird ein fertiger Post mit Bild.",
      avatar: "flame",
      intro: "Erzähl mir kurz, worum es geht – ich schreibe den Post und zeichne das Bild dazu.",
      steps: [
        {
          id: "about",
          type: "page",
          title: "Worum geht's?",
          fields: [
            {
              id: "topic",
              label: "Thema oder Anlass",
              kind: "textarea",
              required: true,
              placeholder: "z. B. Wir eröffnen am Freitag unser neues Studio in Wien",
            },
            {
              id: "tone",
              label: "Ton",
              kind: "select",
              options: ["Locker", "Professionell", "Witzig", "Inspirierend"],
              default: "Locker",
            },
            { id: "link", label: "Link (optional)", kind: "url" },
          ],
        },
        {
          id: "post",
          type: "agent",
          title: "Post schreiben",
          working: "Schreibt den Post …",
          instructions:
            "Schreibe einen Post für X (Twitter) zum Thema: {{topic}}. Ton: {{tone}}. Höchstens 270 Zeichen inklusive Link und höchstens zwei Hashtags. Wenn ein Link angegeben ist ({{link}}), setze ihn ans Ende. Ein starker erster Satz. Nur den Post ausgeben.",
          tools: [],
          output: { format: "text" },
          model: "standard",
        },
        {
          id: "visual",
          type: "generate",
          title: "Bild zeichnen",
          working: "Zeichnet das Bild …",
          asset: "image",
          prompt:
            "Ein auffälliges Bild, das diesen Post begleitet: {{steps.post}}. Thema: {{topic}}. Kein Text im Bild.",
          options: { aspectRatio: "16:9", style: "modern editorial, clean, high contrast" },
        },
        {
          id: "check",
          type: "review",
          title: "Passt das so?",
          description: "Du kannst den Text direkt ändern oder eine neue Variante anfordern.",
          show: ["post", "visual"],
          edit: true,
          regenerate: true,
        },
        {
          id: "done",
          type: "result",
          title: "Fertig zum Posten",
          message: "Kopiere den Text und lade das Bild herunter.",
          deliverables: [
            { from: "post", label: "Post", formats: ["txt", "md"] },
            { from: "visual", label: "Bild", formats: ["png"] },
          ],
        },
      ],
    },
  },
  {
    id: "facebook-video-ad",
    title: "Facebook-Videoanzeige",
    pitch: "Konzept, Anzeigentexte und ein 8-Sekunden-Video für Reels & Stories.",
    definition: {
      version: 1,
      title: "Facebook-Videoanzeige",
      description: "Von der Produktidee zur fertigen Video-Anzeige (9:16).",
      avatar: "drop",
      intro:
        "Wir bauen eine Video-Anzeige für Reels und Stories. Zuerst das Produkt, dann der Look.",
      steps: [
        {
          id: "product",
          type: "page",
          title: "Was bewerben wir?",
          fields: [
            { id: "product", label: "Produkt oder Angebot", kind: "text", required: true },
            { id: "usp", label: "Was macht es besonders?", kind: "textarea", required: true },
            {
              id: "audience",
              label: "Für wen?",
              kind: "textarea",
              placeholder: "z. B. Hobbyköche zwischen 25 und 45",
            },
            {
              id: "cta",
              label: "Handlungsaufforderung",
              kind: "select",
              options: ["Jetzt kaufen", "Mehr erfahren", "Registrieren", "Angebot sichern"],
              default: "Mehr erfahren",
            },
          ],
        },
        {
          id: "look",
          type: "page",
          title: "Wie soll es aussehen?",
          fields: [
            {
              id: "mood",
              label: "Stimmung",
              kind: "select",
              options: ["Energiegeladen", "Ruhig & hochwertig", "Verspielt", "Dokumentarisch"],
              default: "Ruhig & hochwertig",
            },
            {
              id: "productImage",
              label: "Produktfoto (optional)",
              kind: "image",
              help: "Das Video startet von diesem Bild.",
            },
          ],
        },
        {
          id: "script",
          type: "agent",
          title: "Konzept & Texte",
          working: "Entwickelt das Anzeigenkonzept …",
          instructions:
            "Entwickle eine Facebook-/Instagram-Videoanzeige (9:16, 8 Sekunden) für {{product}}. Besonderheit: {{usp}}. Zielgruppe: {{audience}}. Stimmung: {{mood}}. Liefere: einen Hook für die ersten zwei Sekunden, eine präzise Szenenbeschreibung für ein 8-Sekunden-Video (eine durchgehende Einstellung, Kamerabewegung, Licht, keine Schrift im Bild), den Primärtext (max. 125 Zeichen), eine Überschrift (max. 40 Zeichen), eine Beschreibung (max. 30 Zeichen) und die Handlungsaufforderung {{cta}}.",
          tools: [],
          output: {
            format: "json",
            fields: [
              { id: "hook", kind: "text", description: "Hook für die ersten 2 Sekunden" },
              { id: "scene", kind: "text", description: "Szenenbeschreibung für das Video" },
              { id: "primaryText", kind: "text", description: "Primärtext, max. 125 Zeichen" },
              { id: "headline", kind: "text", description: "Überschrift, max. 40 Zeichen" },
              { id: "description", kind: "text", description: "Beschreibung, max. 30 Zeichen" },
              { id: "cta", kind: "text", description: "Handlungsaufforderung" },
            ],
          },
          model: "high",
        },
        {
          id: "concept",
          type: "review",
          title: "Gefällt dir das Konzept?",
          description: "Erst wenn das Konzept passt, wird das Video gerendert.",
          show: ["script"],
          regenerate: true,
        },
        {
          id: "video",
          type: "generate",
          title: "Video rendern",
          working: "Rendert das Video …",
          asset: "video",
          prompt: "{{steps.script.scene}} Stimmung: {{mood}}. Produkt: {{product}}.",
          options: { aspectRatio: "9:16", duration: 8 },
          referenceImage: "productImage",
        },
        {
          id: "videoCheck",
          type: "review",
          title: "Das Video",
          show: ["video"],
          regenerate: true,
        },
        {
          id: "done",
          type: "result",
          title: "Deine Anzeige ist fertig",
          message: "Lade Video und Texte herunter und lege die Anzeige im Werbeanzeigenmanager an.",
          deliverables: [
            { from: "video", label: "Video", formats: ["mp4"] },
            { from: "script", label: "Anzeigentexte", formats: ["md", "json"] },
          ],
        },
      ],
    },
  },
  {
    id: "research-briefing",
    title: "Research-Briefing",
    pitch: "Web-Recherche mit Quellen, als sauberes Briefing-Dokument.",
    definition: {
      version: 1,
      title: "Research-Briefing",
      description: "Recherchiert ein Thema im Web und fasst es als Briefing mit Quellen zusammen.",
      avatar: "dome",
      intro: "Nenne ein Thema – ich recherchiere im Web und schreibe dir ein Briefing mit Quellen.",
      steps: [
        {
          id: "topic",
          type: "page",
          title: "Welches Thema?",
          fields: [
            {
              id: "topic",
              label: "Thema",
              kind: "textarea",
              required: true,
              placeholder: "z. B. Wie verändert der AI Act den Mittelstand in Österreich?",
            },
            { id: "focus", label: "Schwerpunkt (optional)", kind: "textarea" },
            {
              id: "audience",
              label: "Für wen ist das Briefing?",
              kind: "select",
              options: ["Geschäftsführung", "Fachteam", "Kunden", "Öffentlichkeit"],
              default: "Geschäftsführung",
            },
            {
              id: "depth",
              label: "Umfang",
              kind: "select",
              options: ["Kompakt (1 Seite)", "Ausführlich (3–5 Seiten)"],
              default: "Kompakt (1 Seite)",
            },
          ],
        },
        {
          id: "research",
          type: "agent",
          title: "Recherche",
          working: "Recherchiert im Web …",
          instructions:
            "Recherchiere gründlich im Web zum Thema: {{topic}}. Schwerpunkt: {{focus}}. Nutze mindestens sechs glaubwürdige, möglichst aktuelle Quellen und öffne die wichtigsten Seiten. Sammle Fakten mit Zahlen, Daten und Zitaten; notiere zu jedem Fakt die Quelle (Titel + URL). Gib strukturierte Recherche-Notizen aus, keine fertige Zusammenfassung.",
          tools: ["web_search", "web_fetch"],
          output: { format: "markdown" },
          model: "high",
        },
        {
          id: "briefing",
          type: "generate",
          title: "Briefing schreiben",
          working: "Schreibt das Briefing …",
          asset: "document",
          prompt:
            "Briefing zum Thema „{{topic}}“ für: {{audience}}. Umfang: {{depth}}. Stütze dich ausschließlich auf diese Recherche-Notizen und belege Aussagen mit nummerierten Quellen:\n\n{{steps.research}}",
          options: { template: "briefing" },
        },
        {
          id: "check",
          type: "review",
          title: "Dein Briefing",
          description: "Wünschst du Änderungen? Beschreibe sie, dann schreibe ich es neu.",
          show: ["briefing"],
          regenerate: true,
        },
        {
          id: "done",
          type: "result",
          title: "Briefing fertig",
          deliverables: [
            { from: "briefing", label: "Briefing", formats: ["pdf", "docx", "md", "html"] },
            { from: "research", label: "Recherche-Notizen", formats: ["md"] },
          ],
        },
      ],
    },
  },
  {
    id: "dashboard",
    title: "Dashboard aus Recherche",
    pitch: "Zahlen recherchieren und als Dashboard mit Diagrammen aufbereiten.",
    definition: {
      version: 1,
      title: "Dashboard aus Recherche",
      description: "Sucht belastbare Zahlen im Web und baut daraus ein Dashboard.",
      avatar: "tower",
      intro: "Welche Zahlen willst du sehen? Ich suche sie und baue ein Dashboard daraus.",
      steps: [
        {
          id: "question",
          type: "page",
          title: "Welche Zahlen?",
          fields: [
            {
              id: "topic",
              label: "Was soll das Dashboard zeigen?",
              kind: "textarea",
              required: true,
              placeholder:
                "z. B. Neuzulassungen von E-Autos in Österreich, Deutschland und der Schweiz",
            },
            { id: "period", label: "Zeitraum", kind: "text", placeholder: "z. B. 2019–2025" },
            { id: "region", label: "Region", kind: "text", placeholder: "z. B. DACH" },
          ],
        },
        {
          id: "data",
          type: "agent",
          title: "Zahlen recherchieren",
          working: "Sucht belastbare Zahlen …",
          instructions:
            "Recherchiere belastbare Zahlen zu: {{topic}}. Zeitraum: {{period}}. Region: {{region}}. Bevorzuge amtliche Statistiken, Verbände und seriöse Medien. Prüfe Zahlen gegen eine zweite Quelle, wenn möglich. Liefere: einen Titel, 3–6 Kennzahlen (Bezeichnung, Wert, Einheit, Veränderung), eine Haupt-Zeitreihe oder Vergleichstabelle und die Quellen mit URL.",
          tools: ["web_search", "web_fetch"],
          output: {
            format: "json",
            fields: [
              { id: "title", kind: "text", description: "Titel des Dashboards" },
              { id: "kpis", kind: "table", description: "Kennzahlen: label, value, unit, change" },
              {
                id: "series",
                kind: "table",
                description: "Haupt-Zeitreihe oder Vergleichstabelle",
              },
              { id: "sources", kind: "list", description: "Quellen als 'Titel – URL'" },
            ],
          },
          model: "high",
        },
        {
          id: "dashboard",
          type: "generate",
          title: "Dashboard bauen",
          working: "Baut das Dashboard …",
          asset: "dashboard",
          prompt:
            "Dashboard „{{steps.data.title}}“. Verwende ausschließlich diese Daten und zeige die Quellen:\n\n{{steps.data}}",
        },
        {
          id: "check",
          type: "review",
          title: "Dein Dashboard",
          show: ["dashboard"],
          regenerate: true,
        },
        {
          id: "done",
          type: "result",
          title: "Dashboard fertig",
          deliverables: [
            { from: "dashboard", label: "Dashboard", formats: ["html", "pdf", "png"] },
            { from: "data", label: "Daten", formats: ["xlsx", "csv", "json"] },
          ],
        },
      ],
    },
  },
  {
    id: "invoice",
    title: "Rechnung",
    pitch: "Positionen eingeben, fertige Rechnung als PDF erhalten.",
    definition: {
      version: 1,
      title: "Rechnung erstellen",
      description: "Erstellt eine Rechnung mit korrekt berechneten Summen.",
      avatar: "pebble",
      intro: "Drei kurze Seiten, dann liegt deine Rechnung als PDF bereit.",
      steps: [
        {
          id: "recipient",
          type: "page",
          title: "An wen geht die Rechnung?",
          fields: [
            {
              id: "customer",
              label: "Empfänger (Name und Anschrift)",
              kind: "textarea",
              required: true,
            },
            { id: "customerVat", label: "UID / USt-IdNr. des Empfängers (optional)", kind: "text" },
            {
              id: "invoiceNumber",
              label: "Rechnungsnummer",
              kind: "text",
              required: true,
              placeholder: "z. B. RE-2026-042",
            },
            { id: "invoiceDate", label: "Rechnungsdatum", kind: "date", required: true },
            { id: "servicePeriod", label: "Leistungszeitraum (optional)", kind: "text" },
          ],
        },
        {
          id: "positions",
          type: "page",
          title: "Was wird verrechnet?",
          fields: [
            {
              id: "items",
              label: "Positionen",
              kind: "items",
              required: true,
              columns: [
                { id: "description", label: "Beschreibung", kind: "text" },
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
          ],
        },
        {
          id: "terms",
          type: "page",
          title: "Zahlung",
          fields: [
            {
              id: "paymentTerms",
              label: "Zahlungsziel",
              kind: "select",
              options: ["Zahlbar sofort", "14 Tage netto", "30 Tage netto"],
              default: "14 Tage netto",
            },
            { id: "note", label: "Hinweis auf der Rechnung (optional)", kind: "textarea" },
            {
              id: "sender",
              label: "Absender (falls nicht im Projekt hinterlegt)",
              kind: "textarea",
              help: "Firma, Anschrift, UID, Bankverbindung",
            },
          ],
        },
        {
          id: "invoice",
          type: "generate",
          title: "Rechnung erstellen",
          working: "Setzt die Rechnung …",
          asset: "document",
          prompt:
            "Rechnung Nr. {{invoiceNumber}} vom {{invoiceDate}}.\nEmpfänger:\n{{customer}}\nUID Empfänger: {{customerVat}}\nLeistungszeitraum: {{servicePeriod}}\n\nPositionen und Summen – exakt so übernehmen:\n{{items}}\n\nZahlungsziel: {{paymentTerms}}\nHinweis: {{note}}\nAbsender: {{sender}}",
          options: { template: "invoice" },
        },
        {
          id: "check",
          type: "review",
          title: "Rechnung prüfen",
          show: ["invoice"],
          regenerate: true,
        },
        {
          id: "done",
          type: "result",
          title: "Rechnung fertig",
          deliverables: [{ from: "invoice", label: "Rechnung", formats: ["pdf", "docx", "html"] }],
        },
      ],
    },
  },
  {
    id: "offer",
    title: "Angebot",
    pitch: "Angebot mit Einleitung, Leistungsbeschreibung und Preisen.",
    definition: {
      version: 1,
      title: "Angebot erstellen",
      description: "Schreibt ein überzeugendes Angebot mit korrekten Summen.",
      avatar: "bean",
      intro: "Erzähl mir vom Vorhaben – ich formuliere das Angebot.",
      steps: [
        {
          id: "customer",
          type: "page",
          title: "Für wen und wofür?",
          fields: [
            {
              id: "customer",
              label: "Kunde (Name und Anschrift)",
              kind: "textarea",
              required: true,
            },
            { id: "contact", label: "Ansprechperson", kind: "text" },
            {
              id: "project",
              label: "Worum geht es?",
              kind: "textarea",
              required: true,
              placeholder: "Ausgangslage, Ziel, was ihr liefert",
            },
          ],
        },
        {
          id: "positions",
          type: "page",
          title: "Leistungen und Preise",
          fields: [
            {
              id: "items",
              label: "Positionen",
              kind: "items",
              required: true,
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
          instructions:
            "Schreibe für ein Angebot an {{customer}} (Ansprechperson: {{contact}}) eine persönliche Einleitung (3–4 Sätze) und eine klare Leistungsbeschreibung mit Zwischenüberschriften und Aufzählungen. Vorhaben: {{project}}. Diese Positionen werden angeboten:\n{{items}}\nKeine Preise wiederholen, keine Summen.",
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
          prompt:
            "Angebot an:\n{{customer}}\nAnsprechperson: {{contact}}\nDatum: {{today}}\nGültig: {{validity}}\n\nEinleitung und Leistungsbeschreibung – wörtlich übernehmen:\n{{steps.pitch}}\n\nPositionen und Summen – exakt so übernehmen:\n{{items}}",
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
          deliverables: [
            { from: "offer", label: "Angebot", formats: ["pdf", "docx", "html"] },
            { from: "pitch", label: "Text", formats: ["md", "docx"] },
          ],
        },
      ],
    },
  },
  {
    id: "damage",
    title: "Schadensmeldung",
    pitch:
      "Vor Ort mit dem Handy: Fotos, Standort, Sprachnotiz, Unterschrift – fertig ist der Bericht.",
    definition: {
      version: 1,
      title: "Schaden melden",
      description:
        "Fotos, Ort und eine kurze Sprachnotiz – daraus wird ein Schadensbericht als PDF.",
      avatar: "pebble",
      intro: "Mach ein paar Fotos und erzähl kurz, was passiert ist – den Bericht schreibe ich.",
      steps: [
        {
          id: "photos",
          type: "page",
          title: "Was ist beschädigt?",
          fields: [
            {
              id: "photos",
              label: "Fotos vom Schaden",
              kind: "image",
              multiple: true,
              required: true,
              help: "Eine Übersicht und ein, zwei Nahaufnahmen.",
            },
            {
              id: "objectId",
              label: "Kennzeichen, Serien- oder Inventarnummer",
              kind: "text",
              scan: true,
              help: "Eintippen – oder den Code am Gerät scannen.",
            },
          ],
        },
        {
          id: "where",
          type: "page",
          title: "Wo und wann?",
          fields: [
            { id: "place", label: "Ort des Schadens", kind: "location", required: true },
            { id: "happenedOn", label: "Wann ist es passiert?", kind: "date" },
          ],
        },
        {
          id: "what",
          type: "page",
          title: "Was ist passiert?",
          fields: [
            {
              id: "note",
              label: "Erzähl es kurz",
              kind: "audio",
              help: "Was ist passiert, was ist kaputt, wer war dabei?",
            },
            {
              id: "details",
              label: "Oder schreib es auf",
              kind: "textarea",
              placeholder: "z. B. Beim Ausparken die Stoßstange hinten links eingedrückt.",
            },
          ],
        },
        {
          id: "who",
          type: "page",
          title: "Wer meldet den Schaden?",
          cta: "Bericht erstellen",
          fields: [
            { id: "reporter", label: "Dein Name", kind: "text", required: true },
            { id: "contact", label: "E-Mail für Rückfragen", kind: "email" },
            {
              id: "signature",
              label: "Unterschrift",
              kind: "signature",
              required: true,
              help: "Damit bestätigst du, dass die Angaben stimmen.",
            },
          ],
        },
        {
          id: "summary",
          type: "agent",
          title: "Schaden beschreiben",
          working: "Sieht sich die Fotos an und fasst zusammen …",
          instructions:
            "Schreibe die sachliche Beschreibung für einen Schadensbericht. Sieh dir zuerst jedes Foto mit read_document an ({{photos}}) und beschreibe, was darauf zu sehen ist.\n\nWas die Person erzählt hat (Sprachnotiz, wörtlich): {{note}}\nWas sie dazu geschrieben hat: {{details}}\nBetroffenes Objekt: {{objectId}}\nOrt: {{place}}\nDatum des Schadens: {{happenedOn}}\n\nGliederung: „Hergang“ (2–4 Sätze, nur was gesagt oder geschrieben wurde), „Schäden“ (Aufzählung: was laut Fotos und Schilderung beschädigt ist), „Offene Punkte“ (was für die Bearbeitung noch fehlt – nur wenn etwas fehlt). Nichts erfinden, keine Schuldzuweisung, keine Kostenschätzung. Gib nur diese Abschnitte aus – ohne Einleitung, ohne Titel darüber, ohne Bemerkungen zu deiner Arbeit.",
          tools: [],
          output: { format: "markdown" },
          model: "standard",
        },
        {
          id: "report",
          type: "generate",
          title: "Bericht erstellen",
          working: "Setzt den Schadensbericht …",
          asset: "document",
          prompt:
            "Schadensbericht, erstellt am {{today}}.\n\nKopfdaten als kleine Tabelle:\n- Gemeldet von: {{reporter}} ({{contact}})\n- Betroffenes Objekt: {{objectId}}\n- Ort: {{place}}\n- Karte: {{place.map}} (als Link „Auf der Karte ansehen“)\n- Datum des Schadens: {{happenedOn}}\n\nBeschreibung – wörtlich übernehmen:\n{{steps.summary}}\n\nDanach ein Abschnitt „Fotos“: alle Fotos der Person in einem Raster mit zwei Spalten, jedes mit der Bildunterschrift „Foto 1“, „Foto 2“ …\n\nAm Ende der Unterschriftsblock: das Bild der Unterschrift ({{signature}}, etwa 60 mm breit) über einer Linie, darunter „{{reporter}}, {{today}}“. Leere Angaben weglassen.",
          options: { template: "report" },
        },
        {
          id: "check",
          type: "review",
          title: "Stimmt der Bericht?",
          show: ["report"],
          regenerate: true,
        },
        {
          id: "done",
          type: "result",
          title: "Schadensbericht fertig",
          message: "Lade ihn herunter oder teile ihn direkt vom Handy.",
          deliverables: [
            { from: "report", label: "Schadensbericht", formats: ["pdf", "docx", "html"] },
            { from: "summary", label: "Beschreibung", formats: ["md", "txt"] },
          ],
        },
      ],
    },
  },
];

export function starterById(id: string): Starter | undefined {
  return STARTERS.find((s) => s.id === id);
}
