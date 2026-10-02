// Copies the engenty framework files this product builds on from a sibling engenty checkout
// (default ../engenty-pro, or ENGENTY_DIR). The copies are never edited by hand: only the
// `@engenty/*` import specifiers are pointed at their place in this tree. Run it to pick up
// upstream changes:  node scripts/sync-engenty.mjs
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const source = resolve(root, process.env.ENGENTY_DIR ?? "../engenty-pro");

/** [directory in engenty, directory here, files] */
const SETS = [
  [
    "packages/ai-core/src/data-tables",
    "shared/engenty/data-tables",
    ["columns.ts", "columns-value.ts", "columns-format.ts", "index.ts"],
  ],
  [
    "packages/connections-sdk/src",
    "server/engenty/connections-sdk",
    ["types.ts", "oauth2.ts", "registry.ts", "files-capability.ts", "storage-capability.ts"],
  ],
  [
    "modules/connections/providers/external/src",
    "server/engenty/connections-external",
    [
      "types.ts",
      "errors.ts",
      "registry-client.ts",
      "registry-source.ts",
      "import-service.ts",
      "build-connector.ts",
      "oauth-dcr.ts",
      "importer/classify.ts",
      "importer/map-auth.ts",
      "importer/normalize-mcp.ts",
      "importer/normalize-openapi.ts",
      "invoke/http-invoker.ts",
      "invoke/mcp-client.ts",
      "net/guarded-fetch.ts",
    ],
  ],
  ["packages/web-ingest/src/lib", "server/engenty/web-ingest", ["ssrf.ts"]],
  [
    "modules/connections/providers/google/src",
    "server/engenty/connections-google",
    [
      "shared.ts",
      "definitions.ts",
      "connectors/gmail.ts",
      "connectors/drive.ts",
      "connectors/calendar.ts",
      "connectors/contacts.ts",
    ],
  ],
  [
    "modules/connections/providers/microsoft/src",
    "server/engenty/connections-microsoft",
    ["graph.ts", "action.ts", "outlook.ts", "onedrive.ts"],
  ],
  ["modules/connections/providers/slack/src", "server/engenty/connections-slack", ["connector.ts"]],
  [
    "modules/connections/providers/github/src",
    "server/engenty/connections-github",
    ["connector.ts"],
  ],
  [
    "modules/connections/providers/hubspot/src",
    "server/engenty/connections-hubspot",
    ["connector.ts"],
  ],
  ["modules/connections/providers/s3/src", "server/engenty/connections-s3", ["s3.ts"]],
  [
    "packages/doc-converter/src",
    "server/engenty/doc-converter",
    ["interface.ts", "page-break.ts", "providers/local/index.ts"],
  ],
  [
    "packages/document-scanner/src/schemas",
    "server/engenty/document-scanner/schemas",
    ["classifier.ts", "invoice.ts", "receipt.ts", "shared.ts", "index.ts"],
  ],
  [
    "packages/csv-import/src",
    "server/engenty/csv-import",
    [
      "parse-csv.ts",
      "xlsx-workbook.ts",
      "csv-matrix.ts",
      "serialize-csv.ts",
      "types.ts",
      "import-sources.ts",
    ],
  ],
];

/** Where an `@engenty/*` package lives in this tree (a file, relative to the repo root). */
const PACKAGES = {
  "@engenty/connections-sdk": "server/engenty/shims/connections-sdk.ts",
  "@engenty/plugin-sdk": "server/engenty/shims/plugin-sdk.ts",
  "@engenty/web-ingest": "server/engenty/shims/web-ingest.ts",
};

function rewrite(text, file) {
  return text.replace(/(from\s+|import\(\s*)"(@engenty\/[a-z-]+)"/g, (whole, lead, name) => {
    const target = PACKAGES[name];
    if (!target) {
      throw new Error(`${file} imports ${name}, which this tree does not provide`);
    }
    let path = relative(dirname(join(root, file)), join(root, target)).replace(/\.ts$/, ".js");
    if (!path.startsWith(".")) {
      path = `./${path}`;
    }
    return `${lead}"${path}"`;
  });
}

const commit = execSync("git rev-parse --short HEAD", { cwd: source }).toString().trim();
const copied = [];
for (const [from, to, files] of SETS) {
  for (const file of files) {
    const target = join(to, file);
    mkdirSync(dirname(join(root, target)), { recursive: true });
    writeFileSync(join(root, target), rewrite(readFileSync(join(source, from, file), "utf8"), target));
    copied.push(`${from}/${file} → ${target}`);
  }
}

writeFileSync(
  join(root, "server/engenty/README.md"),
  `# engenty framework code

Files under \`server/engenty\` and \`shared/engenty\` are copies from the engenty monorepo
(commit \`${commit}\`). They are not edited here: change them upstream, then run
\`node scripts/sync-engenty.mjs\`. Only \`shims/\` is written for this product — it stands in for
the engenty packages the copies import.

${copied.map((c) => `- ${c}`).join("\n")}
`,
);
console.log(`engenty ${commit}: ${copied.length} files`);
