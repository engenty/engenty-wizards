import type { WizardDefinition } from "@engenty-wizards/shared/definition";
import { cleanPath, WORKSPACE_LIMITS } from "@engenty-wizards/shared/workspace";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { z } from "zod";
import { listConnectors } from "../connectors/external.js";
import { getBlob } from "../files/blobs.js";
import { requireAdmin } from "./access.js";
import { ServiceError } from "./errors.js";
import { draftFiles, writeFile } from "./files.js";
import { ownedProject } from "./projects.js";
import { createWizard, deleteWizard, draftIssues, ownedWizard, parseDraft } from "./wizards.js";

/**
 * A wizard as a file, `<title>.wizard`: a zip with `wizard.json` — the definition and what it
 * needs from its project — and the workspace under `files/`. What belongs to people (runs, lists, connected
 * accounts) and to the project (brand, credentials) stays where it is.
 */

const FORMAT = "engenty-wizard";
const MANIFEST = "wizard.json";
const FILES = "files/";
export const PACKAGE_EXTENSION = ".wizard";
/** A type of its own: under `application/zip` a browser may save the file as `.zip`. */
export const PACKAGE_MIME = "application/vnd.engenty.wizard+zip";
/** The workspace's 25 MB, with room for the manifest and the zip's own overhead. */
export const PACKAGE_MAX_BYTES = 30_000_000;

const manifestSchema = z.object({
  format: z.literal(FORMAT),
  version: z.literal(1),
  exportedAt: z.string().optional(),
  definition: z.unknown(),
  /** Imported connectors the wizard's connections name. No address: one pasted by hand can hold a secret. */
  connectors: z
    .array(
      z.object({
        id: z.string().max(60),
        name: z.string().max(120),
        domain: z.string().max(253).optional(),
        sourceKind: z.enum(["openapi", "mcp"]).optional(),
      }),
    )
    .max(50)
    .default([]),
  /** Project MCP servers the wizard's steps name — by name only, their address and headers are credentials. */
  mcpServers: z
    .array(z.object({ id: z.string().max(31), name: z.string().max(60) }))
    .max(10)
    .default([]),
});

type Manifest = z.infer<typeof manifestSchema>;

function fileName(title: string): string {
  const slug = title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${slug || "wizard"}${PACKAGE_EXTENSION}`;
}

export async function exportWizard(userId: string, wizardId: string) {
  const w = await ownedWizard(userId, wizardId);
  const project = await ownedProject(userId, w.projectId);
  const named = new Set((w.draft.connections ?? []).map((c) => c.connector));
  const servers = new Set(w.draft.steps.flatMap((s) => (s.type === "agent" ? (s.mcp ?? []) : [])));
  const manifest: Manifest = {
    format: FORMAT,
    version: 1,
    exportedAt: new Date().toISOString(),
    definition: w.draft,
    connectors: (await listConnectors(project.id))
      .filter((c) => c.sourceKind !== "builtin" && named.has(c.id))
      .map((c) => ({
        id: c.id,
        name: c.name,
        domain: c.domain,
        sourceKind: c.sourceKind as "openapi" | "mcp",
      })),
    mcpServers: project.mcpServers
      .filter((s) => servers.has(s.id))
      .map((s) => ({ id: s.id, name: s.name })),
  };
  const entries: Record<string, Uint8Array> = {
    [MANIFEST]: strToU8(JSON.stringify(manifest, null, 2)),
  };
  for (const f of await draftFiles(w.id)) {
    entries[FILES + f.path] = new Uint8Array(await getBlob(f.hash));
  }
  return { name: fileName(w.draft.title), zip: zipSync(entries, { level: 6 }) };
}

const invalid = (message: string) => new ServiceError("invalid", message);

function json(data: Uint8Array): unknown {
  try {
    return JSON.parse(strFromU8(data));
  } catch {
    throw invalid("Das ist kein Wizard-Paket: wizard.json ist kein gültiges JSON.");
  }
}

/** A manifest, or a bare definition: a wizard without workspace is fully told by its JSON. */
function readManifest(raw: unknown): Manifest {
  if ((raw as { format?: unknown } | null)?.format !== FORMAT) {
    return { format: FORMAT, version: 1, definition: raw, connectors: [], mcpServers: [] };
  }
  const parsed = manifestSchema.safeParse(raw);
  if (!parsed.success) {
    throw invalid("Dieses Wizard-Paket stammt aus einer neueren Version oder ist beschädigt.");
  }
  return parsed.data;
}

/** The package's content, checked against the workspace limits before anything is unpacked. */
function readPackage(data: Uint8Array): {
  manifest: Manifest;
  files: { path: string; data: Uint8Array }[];
} {
  const zipped = data[0] === 0x50 && data[1] === 0x4b;
  if (!zipped) {
    return { manifest: readManifest(json(data)), files: [] };
  }
  let total = 0;
  let count = 0;
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(data, {
      filter: (file) => {
        // Folders, and what the Finder adds when a package is zipped by hand.
        if (file.name.endsWith("/") || /(^|\/)(__MACOSX\/|\.DS_Store$)/.test(file.name)) {
          return false;
        }
        total += file.originalSize;
        count += 1;
        if (file.originalSize > WORKSPACE_LIMITS.fileBytes) {
          throw invalid(`${file.name} ist größer als 5 MB.`);
        }
        if (count > WORKSPACE_LIMITS.files + 1 || total > PACKAGE_MAX_BYTES) {
          throw invalid("Das Paket ist größer als ein Workspace sein darf (200 Dateien, 25 MB).");
        }
        return true;
      },
    });
  } catch (err) {
    throw err instanceof ServiceError ? err : invalid("Das Paket lässt sich nicht entpacken.");
  }
  // A package unpacked and zipped again often sits in a folder of its own.
  const manifestPath = Object.keys(entries)
    .filter((name) => name === MANIFEST || name.endsWith(`/${MANIFEST}`))
    .sort((a, b) => a.length - b.length)[0];
  if (manifestPath === undefined) {
    throw invalid("Das ist kein Wizard-Paket: wizard.json fehlt.");
  }
  const root = manifestPath.slice(0, -MANIFEST.length);
  const files = Object.entries(entries)
    .filter(([name]) => name.startsWith(root + FILES))
    .map(([name, content]) => {
      const path = cleanPath(name.slice(root.length + FILES.length));
      if (!path) {
        throw invalid(`"${name}" ist kein gültiger Dateipfad.`);
      }
      return { path, data: content };
    });
  if (files.reduce((n, f) => n + f.data.byteLength, 0) > WORKSPACE_LIMITS.totalBytes) {
    throw invalid("Der Workspace im Paket ist größer als 25 MB.");
  }
  return { manifest: readManifest(json(entries[manifestPath])), files };
}

/** What the wizard names that the project does not have, in words for the chat. */
async function missing(
  userId: string,
  projectId: string,
  draft: WizardDefinition,
  manifest: Manifest,
) {
  const project = await ownedProject(userId, projectId);
  const connectors = await listConnectors(project.id);
  const wanted = [...new Set((draft.connections ?? []).flatMap((c) => c.connector ?? []))];
  const servers = [
    ...new Set(draft.steps.flatMap((s) => (s.type === "agent" ? (s.mcp ?? []) : []))),
  ];
  return [
    ...wanted
      .filter((id) => !connectors.some((c) => c.id === id))
      .map((id) => {
        const told = manifest.connectors.find((c) => c.id === id);
        return `Connector „${told?.name ?? id}“${told?.domain ? ` (${told.domain})` : ""}`;
      }),
    ...servers
      .filter((id) => !project.mcpServers.some((s) => s.id === id))
      .map((id) => `MCP-Server „${manifest.mcpServers.find((s) => s.id === id)?.name ?? id}“`),
  ];
}

/** Makes a new wizard of a package in the project: the draft and its workspace, not published. */
export async function importWizard(
  userId: string,
  projectId: string,
  data: Uint8Array,
  name?: string,
) {
  await requireAdmin();
  const { manifest, files } = readPackage(data);
  // The shape is checked before anything is written; a wrong one leaves no wizard behind.
  const { draft } = parseDraft(
    manifest.definition,
    files.map((f) => f.path),
  );
  const lacks = await missing(userId, projectId, draft, manifest);
  const note = [
    `Importiert${name ? ` aus „${name}“` : ""}: ${draft.steps.length} Schritte, ${files.length} ${files.length === 1 ? "Datei" : "Dateien"}.`,
    lacks.length
      ? `Diesem Projekt fehlt noch: ${lacks.join(", ")} – in den Einstellungen unter „Connectors“ hinzufügen.`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  const { id } = await createWizard(userId, { projectId, definition: draft, note });
  try {
    for (const file of files) {
      await writeFile(userId, id, file.path, file.data);
    }
  } catch (err) {
    await deleteWizard(userId, id);
    throw err;
  }
  return { id, issues: await draftIssues(await ownedWizard(userId, id)) };
}
