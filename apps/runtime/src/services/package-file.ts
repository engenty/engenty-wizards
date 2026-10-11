import {
  type Manifest,
  manifestSchema,
  PACKAGE_FILES,
  PACKAGE_FORMAT,
  PACKAGE_MANIFEST,
  PACKAGE_MAX_BYTES,
} from "@engenty-wizards/shared/wizard-package";
import { cleanPath, WORKSPACE_LIMITS } from "@engenty-wizards/shared/workspace";
import { strFromU8, unzipSync } from "fflate";
import { ServiceError } from "./errors.js";

/**
 * Reading a `.wizard` package, with nothing of a project or a database: the studio's import and
 * `wizards validate` both start here.
 */

const invalid = (message: string) => new ServiceError("invalid", message);

export function json(data: Uint8Array): unknown {
  try {
    return JSON.parse(strFromU8(data));
  } catch {
    throw invalid("Das ist kein Wizard-Paket: wizard.json ist kein gültiges JSON.");
  }
}

/** A manifest, or a bare definition: a wizard without workspace is fully told by its JSON. */
export function readManifest(raw: unknown): Manifest {
  if ((raw as { format?: unknown } | null)?.format !== PACKAGE_FORMAT) {
    return { format: PACKAGE_FORMAT, version: 1, definition: raw, connectors: [], mcpServers: [] };
  }
  const parsed = manifestSchema.safeParse(raw);
  if (!parsed.success) {
    throw invalid("Dieses Wizard-Paket stammt aus einer neueren Version oder ist beschädigt.");
  }
  return parsed.data;
}

/** The package's content, checked against the workspace limits before anything is unpacked. */
export function readPackage(data: Uint8Array): {
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
    .filter((name) => name === PACKAGE_MANIFEST || name.endsWith(`/${PACKAGE_MANIFEST}`))
    .sort((a, b) => a.length - b.length)[0];
  if (manifestPath === undefined) {
    throw invalid("Das ist kein Wizard-Paket: wizard.json fehlt.");
  }
  const root = manifestPath.slice(0, -PACKAGE_MANIFEST.length);
  const files = Object.entries(entries)
    .filter(([name]) => name.startsWith(root + PACKAGE_FILES))
    .map(([name, content]) => {
      const path = cleanPath(name.slice(root.length + PACKAGE_FILES.length));
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
