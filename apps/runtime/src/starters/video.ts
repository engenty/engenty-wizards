import { filmFiles } from "./film.js";
import type { Starter } from "./types.js";

const STILLS_ONLY_AD = "Animierte Standbilder (günstig)";
const STILLS_ONLY_TOUR = "Animierte Fotos (günstig)";

/** Idea → stills → clips → a cut film with captions, voice-over and a closing call to action. */
export const VIDEO_AD: Starter = {
  id: "facebook-video-ad",
  title: "Facebook-Videoanzeige",
  pitch:
    "Idee → Bilder → Clips → fertig geschnittene 9:16-Anzeige mit Texten, Sprecher und Call-to-Action.",
  files: filmFiles({
    entry: "ad",
    portrait: true,
    script: `
var d = wizard.data;
var shots = Array.isArray(d.shots) ? d.shots : [];
var clips = d.clips || [], stills = d.stills || [];
var scenes = [];
for (var i = 0; i < Math.max(clips.length, stills.length); i++) {
  scenes.push({ media: clips[i] || stills[i], fallback: stills[i], caption: shots[i] ? shots[i].caption : "" });
}
Film.play({
  size: { width: 1080, height: 1920 },
  style: "ad",
  scenes: scenes,
  hook: d.hook,
  end: { title: d.headline, lines: [d.product], cta: d.cta },
  voice: d.voice,
  label: "KI-generiert",
  clipSeconds: 6,
  stillSeconds: 4.5
});`,
    sample: {
      clips: [],
      stills: ["sample-1.svg", "sample-2.svg"],
      shots: [{ caption: "Schluss mit stumpfen Messern" }, { caption: "Scharf in 30 Sekunden" }],
      hook: "Dein Messer schneidet nicht mehr?",
      headline: "Scharf wie am ersten Tag",
      cta: "Jetzt kaufen",
      product: "Klingenmeister Schärfer",
      voice: null,
    },
  }),
  definition: {
    version: 1,
    title: "Facebook-Videoanzeige",
    description:
      "Von der Produktidee zur fertig geschnittenen Video-Anzeige (9:16) mit Sprecher und Call-to-Action.",
    avatar: "drop",
    intro:
      "Wir bauen eine Video-Anzeige für Reels und Stories: erst das Konzept, dann die Bilder, dann der Film.",
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
            id: "productImage",
            label: "Produktfoto",
            kind: "image",
            help: "Jede Szene geht von diesem Foto aus – so bleibt dein Produkt echt. Ohne Foto wird es frei gezeichnet.",
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
            id: "length",
            label: "Länge",
            kind: "select",
            options: ["2 Szenen (ca. 15 Sekunden)", "3 Szenen (ca. 20 Sekunden)"],
            default: "2 Szenen (ca. 15 Sekunden)",
          },
          {
            id: "motion",
            label: "Bewegung",
            kind: "select",
            options: ["KI-Video-Clips (lebendig)", STILLS_ONLY_AD],
            default: "KI-Video-Clips (lebendig)",
            help: "Video-Clips kosten pro Szene etwa so viel wie 30 Bilder.",
          },
          { id: "voiceOn", label: "Mit Sprecherstimme", kind: "toggle", default: true },
        ],
      },
      {
        id: "script",
        type: "agent",
        title: "Konzept & Texte",
        working: "Entwickelt das Anzeigenkonzept …",
        instructions: `Entwickle eine Video-Anzeige für Facebook/Instagram Reels und Stories (9:16) für: {{product}}.
Besonderheit: {{usp}}
Zielgruppe: {{audience}}
Stimmung: {{mood}}
Länge: {{length}} – genau so viele Szenen, jede dauert 6 Sekunden; danach folgt automatisch eine Schlusskarte mit der Handlungsaufforderung „{{cta}}“.

Die Anzeige wird so gebaut: pro Szene entsteht zuerst ein Standbild, daraus ein Video-Clip, am Ende wird alles geschnitten, mit Einblendungen und Sprecherstimme. Liefere deshalb:

- hook: der Satz für die ersten zwei Sekunden, höchstens 7 Wörter. Er nennt ein Problem oder einen Wunsch der Zielgruppe, kein Werbe-Blabla.
- shots: eine Zeile pro Szene.
  - still: genaue Beschreibung des Standbilds, mit dem die Szene beginnt – Hochformat, was ist zu sehen, wo steht das Produkt, Umgebung, Licht, Bildausschnitt. Das Produkt sieht aus wie auf dem Produktfoto. Menschen nur von hinten, als Hände oder angeschnitten. Keine Schrift im Bild.
  - motion: was sich in den 6 Sekunden bewegt und wie die Kamera fährt (eine ruhige Bewegung, nichts verwandelt sich).
  - caption: die Einblendung zur Szene, höchstens 6 Wörter, konkret.
  Szene 1 zeigt das Problem oder den Moment, die letzte Szene das Produkt in Benutzung mit dem Ergebnis.
- voiceover: der Sprechertext für den ganzen Film, gesprochenes Deutsch, höchstens 2 Wörter pro Sekunde Filmlänge (2 Szenen: etwa 26 Wörter, 3 Szenen: etwa 38). Er beginnt mit dem Hook und endet mit der Handlungsaufforderung. Keine Regieanweisungen, keine Emojis.
- headline: Überschrift der Schlusskarte und der Anzeige, höchstens 40 Zeichen.
- primaryText: Primärtext der Anzeige, höchstens 125 Zeichen.
- description: Beschreibung, höchstens 30 Zeichen.
- cta: {{cta}}

Keine Versprechen, die das Produkt nicht hält, keine Superlative ohne Beleg.`,
        tools: [],
        output: {
          format: "json",
          fields: [
            { id: "hook", kind: "text", description: "Hook für die ersten 2 Sekunden" },
            {
              id: "shots",
              kind: "table",
              description: "Szenen: Standbild, Bewegung, Einblendung",
              columns: ["still", "motion", "caption"],
            },
            { id: "voiceover", kind: "text", description: "Sprechertext" },
            { id: "headline", kind: "text", description: "Überschrift, max. 40 Zeichen" },
            { id: "primaryText", kind: "text", description: "Primärtext, max. 125 Zeichen" },
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
        description: "Erst wenn das Konzept passt, entstehen Bilder und Clips.",
        show: ["script"],
        regenerate: true,
        next: [{ when: { field: "voiceOn", op: "notEquals", value: true }, goto: "stills" }],
      },
      {
        id: "voice",
        type: "generate",
        title: "Sprecher aufnehmen",
        working: "Nimmt die Sprecherstimme auf …",
        asset: "voice",
        prompt: "{{steps.script.voiceover}}",
        options: { style: "Werbesprecher: freundlich, klar, mit Energie, natürliches Tempo" },
      },
      {
        id: "stills",
        type: "generate",
        title: "Standbilder",
        working: "Zeichnet die Standbilder …",
        asset: "image",
        each: "steps.script.shots",
        referenceImage: "productImage",
        prompt:
          "Standbild für eine Video-Anzeige, Hochformat: {{item.still}}\nProdukt: {{product}} – genau so wie auf dem Produktfoto, Form, Farbe und Beschriftung unverändert. Stimmung: {{mood}}. Fotorealistisch, keine Schrift im Bild, Platz für eine Einblendung im unteren Drittel.",
        options: { aspectRatio: "9:16", style: "photorealistic commercial photography" },
      },
      {
        id: "stillsCheck",
        type: "review",
        title: "Passen die Bilder?",
        description:
          "Aus jedem Bild wird eine Szene. Du kannst einzelne Bilder neu zeichnen lassen.",
        show: ["stills"],
        regenerate: true,
        next: [{ when: { field: "motion", op: "equals", value: STILLS_ONLY_AD }, goto: "film" }],
      },
      {
        id: "clips",
        type: "generate",
        title: "Clips drehen",
        working: "Dreht die Clips …",
        asset: "video",
        each: "steps.script.shots",
        referenceImage: "stills",
        prompt:
          "{{item.motion}}\nEine durchgehende Einstellung, ruhige Kamerabewegung. Das Produkt bleibt unverändert, nichts verwandelt sich, keine Schrift. Stimmung: {{mood}}.",
        options: { aspectRatio: "9:16", duration: 6 },
      },
      {
        id: "film",
        type: "widget",
        title: "Film schneiden",
        working: "Schneidet den Film …",
        entry: "film/ad.html",
        sample: "film/ad.sample.json",
        size: { width: 1080, height: 1920 },
        video: true,
        data: {
          clips: "steps.clips",
          stills: "steps.stills",
          shots: "steps.script.shots",
          hook: "steps.script.hook",
          headline: "steps.script.headline",
          cta: "steps.script.cta",
          voice: "steps.voice",
          product: "product",
        },
      },
      {
        id: "filmCheck",
        type: "review",
        title: "Deine Anzeige",
        description: "Mit „Zurück“ kommst du zu den Bildern und zum Konzept.",
        show: ["film"],
      },
      {
        id: "done",
        type: "result",
        title: "Deine Anzeige ist fertig",
        message: "Lade Video und Texte herunter und lege die Anzeige im Werbeanzeigenmanager an.",
        deliverables: [
          { from: "film", label: "Video", formats: ["mp4", "png"] },
          { from: "script", label: "Anzeigentexte", formats: ["md", "json"] },
          { from: "stills", label: "Standbilder", formats: ["zip", "png"] },
        ],
      },
    ],
  },
};

/** Listing photos polished and staged, then a walk-through with captions and facts. */
export const PROPERTY_FILM: Starter = {
  id: "property-film",
  title: "Objektvideo für Makler",
  pitch:
    "Objektfotos aufhellen, möblieren, ins richtige Licht setzen – und als Rundgang mit Bildunterschriften schneiden.",
  files: filmFiles({
    entry: "tour",
    portrait: false,
    script: `
var d = wizard.data;
var rooms = Array.isArray(d.rooms) ? d.rooms : [];
var clips = d.clips || [], stills = d.stills || [];
var scenes = [];
for (var i = 0; i < Math.max(clips.length, stills.length); i++) {
  var r = rooms[i] || {};
  scenes.push({ media: clips[i] || stills[i], fallback: stills[i], caption: r.room || "", sub: r.caption || "" });
}
var staged = /bliert|blieren/.test(String(d.staging || ""));
Film.play({
  size: { width: 1920, height: 1080 },
  style: "tour",
  scenes: scenes,
  hook: d.place,
  end: { title: d.title, lines: Array.isArray(d.facts) ? d.facts.slice(0, 4) : [], cta: "Jetzt besichtigen", note: d.contact },
  voice: d.voice,
  label: staged ? "Visualisierung · virtuell möbliert" : "Fotos KI-bearbeitet",
  clipSeconds: 4,
  stillSeconds: 3.6
});`,
    sample: {
      clips: [],
      stills: ["sample-1.svg", "sample-2.svg", "sample-3.svg"],
      rooms: [
        { room: "Wohnzimmer", caption: "32 m² mit Südbalkon" },
        { room: "Küche", caption: "Einbauküche mit Essplatz" },
        { room: "Schlafzimmer", caption: "Ruhig zum Innenhof" },
      ],
      title: "3-Zimmer-Altbau mit Balkon",
      facts: ["78 m² · 3 Zimmer", "Baujahr 1912, saniert", "€ 389.000"],
      place: "Graz · Geidorf",
      contact: "Anna Berger · 0660 1234567",
      staging: "Möblieren – modern & hell",
      voice: null,
    },
  }),
  definition: {
    version: 1,
    title: "Objektvideo für Makler",
    description:
      "Aus ein paar Objektfotos werden aufbereitete Bilder und ein Rundgang-Video mit Bildunterschriften.",
    avatar: "tower",
    intro:
      "Lade die Fotos der Immobilie hoch – ich bereite sie auf, richte die Räume ein und schneide einen Rundgang.",
    steps: [
      {
        id: "object",
        type: "page",
        title: "Welches Objekt?",
        fields: [
          {
            id: "photos",
            label: "Fotos der Räume",
            kind: "image",
            multiple: true,
            required: true,
            help: "3 bis 6 Fotos im Querformat, ein Raum pro Foto, in der Reihenfolge des Rundgangs.",
          },
          {
            id: "title",
            label: "Titel",
            kind: "text",
            required: true,
            placeholder: "z. B. 3-Zimmer-Altbau mit Balkon",
          },
          {
            id: "facts",
            label: "Eckdaten",
            kind: "textarea",
            placeholder: "z. B. 78 m², 3 Zimmer, Balkon, Baujahr 1912, € 389.000",
          },
          { id: "place", label: "Lage", kind: "text", placeholder: "z. B. Graz · Geidorf" },
          {
            id: "contact",
            label: "Kontakt für die Schlusskarte",
            kind: "text",
            placeholder: "z. B. Anna Berger · 0660 1234567",
          },
        ],
      },
      {
        id: "style",
        type: "page",
        title: "Wie sollen die Räume wirken?",
        fields: [
          {
            id: "staging",
            label: "Einrichtung",
            kind: "select",
            options: [
              "Nur aufhellen & geraderücken",
              "Möblieren – modern & hell",
              "Möblieren – skandinavisch",
              "Möblieren – klassisch elegant",
            ],
            default: "Möblieren – modern & hell",
            help: "Möblierte Bilder werden im Video als Visualisierung gekennzeichnet.",
          },
          {
            id: "light",
            label: "Licht",
            kind: "select",
            options: ["Helles Tageslicht", "Goldene Stunde", "Abendstimmung mit warmem Licht"],
            default: "Helles Tageslicht",
          },
          {
            id: "motion",
            label: "Rundgang",
            kind: "select",
            options: ["KI-Kamerafahrt je Raum", STILLS_ONLY_TOUR],
            default: "KI-Kamerafahrt je Raum",
            help: "Eine Kamerafahrt kostet pro Raum etwa so viel wie 20 Bilder.",
          },
          { id: "voiceOn", label: "Mit Sprecherstimme", kind: "toggle", default: true },
        ],
      },
      {
        id: "plan",
        type: "agent",
        title: "Räume ansehen",
        working: "Sieht sich die Fotos an …",
        instructions: `Du bereitest ein Rundgang-Video für eine Immobilie vor: „{{title}}“, Lage: {{place}}.
Eckdaten: {{facts}}

Sieh dir jedes Foto mit read_document an, in genau dieser Reihenfolge: {{photos}}

Liefere:
- rooms: GENAU eine Zeile pro Foto, in derselben Reihenfolge.
  - room: der Raum in einem bis zwei Wörtern („Wohnzimmer“, „Küche“, „Bad“, „Balkon“).
  - caption: eine Bildunterschrift, höchstens 6 Wörter, die sagt, was den Raum ausmacht – nur was auf dem Foto zu sehen ist oder in den Eckdaten steht.
  - staging: Anweisung für die Bildbearbeitung dieses Fotos, auf Englisch, zum Stil „{{staging}}“ und zum Licht „{{light}}“. Bei „Nur aufhellen“: keine Möbel ergänzen. Sonst: welche Möbel wohin kommen, passend zu Raum, Größe und Fenstern (leere Räume einrichten; vorhandene Möbel bleiben, Unordnung verschwindet). Bäder, Küchen, Balkone und Außenansichten werden nicht möbliert, nur aufgeräumt und ins Licht gesetzt.
  - motion: die Kamerafahrt für diesen Raum, auf Englisch, 4 Sekunden: eine langsame, ruhige Bewegung (sanfter Dolly nach vorn, leichter Schwenk), die zu Raum und Blickrichtung passt.
- title: der Titel für die Schlusskarte, höchstens 45 Zeichen.
- facts: 2 bis 4 kurze Zeilen für die Schlusskarte aus den Eckdaten (Fläche und Zimmer, Besonderheit, Preis) – Zahlen exakt wie angegeben.
- voiceover: ein Sprechertext für den Rundgang, gesprochenes Deutsch, etwa 9 Wörter pro Foto plus ein Schlusssatz mit der Einladung zur Besichtigung. Ruhig, konkret, keine Übertreibungen, nichts erfinden.`,
        tools: [],
        output: {
          format: "json",
          fields: [
            {
              id: "rooms",
              kind: "table",
              description: "Räume in der Reihenfolge der Fotos",
              columns: ["room", "caption", "staging", "motion"],
            },
            { id: "title", kind: "text", description: "Titel der Schlusskarte" },
            { id: "facts", kind: "list", description: "Eckdaten für die Schlusskarte" },
            { id: "voiceover", kind: "text", description: "Sprechertext" },
          ],
        },
        model: "high",
        next: [{ when: { field: "voiceOn", op: "notEquals", value: true }, goto: "staged" }],
      },
      {
        id: "voice",
        type: "generate",
        title: "Sprecher aufnehmen",
        working: "Nimmt die Sprecherstimme auf …",
        asset: "voice",
        prompt: "{{steps.plan.voiceover}}",
        options: { style: "ruhig, warm, einladend – wie bei einer persönlichen Besichtigung" },
      },
      {
        id: "staged",
        type: "generate",
        title: "Fotos aufbereiten",
        working: "Bereitet die Fotos auf …",
        asset: "image",
        each: "steps.plan.rooms",
        referenceImage: "photos",
        prompt:
          "Edit this real-estate photo of the {{item.room}}. KEEP the room exactly as built: walls, windows, doors, floor, ceiling, fixtures and the view stay where and how they are; same camera position. Straighten the vertical lines, correct white balance and exposure, remove clutter. {{item.staging}} Light: {{light}}. Photorealistic interior photography, wide angle, no people, no text, no watermark.",
        options: { aspectRatio: "16:9", style: "professional real-estate photography" },
      },
      {
        id: "stagedCheck",
        type: "review",
        title: "Passen die Bilder?",
        description:
          "Prüfe, ob jeder Raum noch stimmt. Einzelne Bilder kannst du neu machen lassen.",
        show: ["staged"],
        regenerate: true,
        next: [{ when: { field: "motion", op: "equals", value: STILLS_ONLY_TOUR }, goto: "film" }],
      },
      {
        id: "clips",
        type: "generate",
        title: "Rundgang drehen",
        working: "Dreht die Kamerafahrten …",
        asset: "video",
        each: "steps.plan.rooms",
        referenceImage: "staged",
        prompt:
          "{{item.motion}} Smooth steady gimbal movement through the {{item.room}}, real-estate walkthrough. The room and everything in it stay exactly as in the image: nothing appears, disappears or changes. No people, no text.",
        options: { aspectRatio: "16:9", duration: 4 },
      },
      {
        id: "film",
        type: "widget",
        title: "Rundgang schneiden",
        working: "Schneidet den Rundgang …",
        entry: "film/tour.html",
        sample: "film/tour.sample.json",
        size: { width: 1920, height: 1080 },
        video: true,
        data: {
          clips: "steps.clips",
          stills: "steps.staged",
          rooms: "steps.plan.rooms",
          title: "steps.plan.title",
          facts: "steps.plan.facts",
          voice: "steps.voice",
          place: "place",
          contact: "contact",
          staging: "staging",
        },
      },
      {
        id: "filmCheck",
        type: "review",
        title: "Dein Rundgang",
        description: "Mit „Zurück“ kommst du zu den Bildern.",
        show: ["film"],
      },
      {
        id: "done",
        type: "result",
        title: "Objektvideo fertig",
        message:
          "Video für Inserat, Website und Social Media – und die aufbereiteten Fotos einzeln.",
        deliverables: [
          { from: "film", label: "Rundgang", formats: ["mp4", "png"] },
          { from: "staged", label: "Aufbereitete Fotos", formats: ["zip", "png"] },
          { from: "plan", label: "Texte", formats: ["md", "json"] },
        ],
      },
    ],
  },
};
