/**
 * The credits written by hand, shown above the generated list of dependencies
 * (oss-credits.json, `pnpm about:data`): the product itself and what it is mainly built with.
 */

export interface ProductCredit {
  name: string;
  description: { de: string; en: string };
  homepage: string;
  license: string;
}

/** The product and the engenty code it builds on. */
export const ENGENTY_CREDITS: ProductCredit[] = [
  {
    name: "engenty wizards",
    description: {
      de: "KI-Wizards aus einer Beschreibung, mit einem Link geteilt.",
      en: "AI wizards built from a description, shared with a link.",
    },
    homepage: "https://github.com/engenty/engenty-wizards",
    license: "FSL-1.1-MIT",
  },
  {
    name: "engenty",
    description: {
      de: "Konnektoren, Datentabellen, Suche und die Engenties stammen aus dem engenty-Framework.",
      en: "Connectors, data tables, search and the engenties come from the engenty framework.",
    },
    homepage: "https://github.com/engenty/engenty",
    license: "FSL-1.1-MIT",
  },
];

/** The main open-source building blocks. */
export const HIGHLIGHT_CREDITS: ProductCredit[] = [
  {
    name: "Mastra",
    description: {
      de: "Agent-Framework hinter den KI-Schritten.",
      en: "Agent framework behind the AI steps.",
    },
    homepage: "https://github.com/mastra-ai/mastra",
    license: "Apache-2.0",
  },
  {
    name: "AI SDK",
    description: {
      de: "Modell-Aufrufe für Text, Bild, Video und Sprache.",
      en: "Model calls for text, image, video and speech.",
    },
    homepage: "https://github.com/vercel/ai",
    license: "Apache-2.0",
  },
  {
    name: "Model Context Protocol",
    description: {
      de: "MCP-Server zum Bauen von Wizards, MCP-Client für Werkzeuge der Schritte.",
      en: "MCP server for building wizards, MCP client for the steps' tools.",
    },
    homepage: "https://github.com/modelcontextprotocol/typescript-sdk",
    license: "MIT",
  },
  {
    name: "Hono",
    description: { de: "HTTP-API der Runtime.", en: "The runtime's HTTP API." },
    homepage: "https://github.com/honojs/hono",
    license: "MIT",
  },
  {
    name: "Drizzle ORM",
    description: {
      de: "Schema und Migrationen der Datenbanken.",
      en: "Schema and migrations of the databases.",
    },
    homepage: "https://github.com/drizzle-team/drizzle-orm",
    license: "Apache-2.0",
  },
  {
    name: "libSQL",
    description: {
      de: "Eine Datenbank je Mandant, lokal als Datei oder bei Turso.",
      en: "One database per tenant, a local file or at Turso.",
    },
    homepage: "https://github.com/tursodatabase/libsql",
    license: "MIT",
  },
  {
    name: "Playwright",
    description: {
      de: "Browser-Schritte sowie PDF- und PNG-Export.",
      en: "Browser steps and the PDF and PNG export.",
    },
    homepage: "https://github.com/microsoft/playwright",
    license: "Apache-2.0",
  },
  {
    name: "agentOS",
    description: {
      de: "Sandbox für Code-Schritte ohne Docker.",
      en: "Sandbox for code steps without Docker.",
    },
    homepage: "https://github.com/rivet-dev/agentos",
    license: "Apache-2.0",
  },
  {
    name: "React",
    description: { de: "UI-Bibliothek der Web-App.", en: "UI library of the web app." },
    homepage: "https://github.com/facebook/react",
    license: "MIT",
  },
  {
    name: "Vite",
    description: { de: "Build-Werkzeug der Web-App.", en: "Build tool of the web app." },
    homepage: "https://github.com/vitejs/vite",
    license: "MIT",
  },
  {
    name: "Tailwind CSS",
    description: { de: "Styling der Oberfläche.", en: "Styling of the interface." },
    homepage: "https://github.com/tailwindlabs/tailwindcss",
    license: "MIT",
  },
  {
    name: "React Flow",
    description: {
      de: "Das Diagramm der Schritte im Editor.",
      en: "The diagram of steps in the editor.",
    },
    homepage: "https://github.com/xyflow/xyflow",
    license: "MIT",
  },
  {
    name: "TanStack Query",
    description: { de: "Server-Daten in der Web-App.", en: "Server data in the web app." },
    homepage: "https://github.com/TanStack/query",
    license: "MIT",
  },
  {
    name: "xterm.js",
    description: {
      de: "Das Terminal auf der Seite, in dem sich KI-Clients anmelden.",
      en: "The terminal on the page where AI clients sign in.",
    },
    homepage: "https://github.com/xtermjs/xterm.js",
    license: "MIT",
  },
  {
    name: "Lucide",
    description: { de: "Icons.", en: "Icons." },
    homepage: "https://github.com/lucide-icons/lucide",
    license: "ISC",
  },
  {
    name: "Geist & Geist Mono",
    description: { de: "Schrift der Oberfläche.", en: "Typeface of the interface." },
    homepage: "https://github.com/vercel/geist-font",
    license: "OFL-1.1",
  },
  {
    name: "Space Grotesk",
    description: { de: "Schrift der Überschriften.", en: "Typeface of the headings." },
    homepage: "https://github.com/floriankarsten/space-grotesk",
    license: "OFL-1.1",
  },
  {
    name: "git-cliff",
    description: {
      de: "Erzeugt den Changelog aus den Commits.",
      en: "Generates the changelog from the commits.",
    },
    homepage: "https://github.com/orhun/git-cliff",
    license: "MIT OR Apache-2.0",
  },
];
