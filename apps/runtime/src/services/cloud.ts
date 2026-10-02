import { accountToken } from "../auth/account.js";
import { env } from "../env.js";
import { getBlob } from "../files/blobs.js";
import { readSetting, writeSetting } from "../settings.js";
import { ServiceError } from "./errors.js";
import { draftFiles } from "./files.js";
import { ownedWizard, requireClean } from "./wizards.js";

interface CloudCopy {
  wizardId: string;
  shareUrl: string;
  version: number;
  publishedAt: string;
}

const key = (wizardId: string) => `cloud:${wizardId}`;

/** Where a local wizard was published to the cloud, if it was. */
export function cloudCopy(wizardId: string): Promise<CloudCopy | null> {
  return readSetting<CloudCopy>(key(wizardId));
}

/**
 * Publishes a local wizard to the cloud runtime of the linked account: definition and workspace
 * go through the cloud's import API, which validates them like any other write. Publishing
 * again updates the same cloud wizard, so its link stays.
 */
export async function publishToCloud(userId: string, wizardId: string): Promise<CloudCopy> {
  const w = await ownedWizard(userId, wizardId);
  const { definition } = await requireClean(w);
  const token = await accountToken();
  if (!token) {
    throw new ServiceError("refused", "Bitte zuerst in den Einstellungen ein Konto anmelden.");
  }
  const files = await Promise.all(
    (await draftFiles(w.id)).map(async (f) => ({
      path: f.path,
      mime: f.mime,
      data: (await getBlob(f.hash)).toString("base64"),
    })),
  );
  const before = await cloudCopy(w.id);
  const res = await fetch(`${env.local.cloudUrl}/api/v1/wizards/import`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ wizardId: before?.wizardId, definition, files, publish: true }),
    signal: AbortSignal.timeout(120_000),
  }).catch(() => null);
  if (!res) {
    throw new ServiceError("refused", "Die Cloud ist gerade nicht erreichbar.");
  }
  const body = (await res.json().catch(() => ({}))) as {
    wizardId?: string;
    shareUrl?: string;
    version?: number;
    error?: string;
    issues?: { stepId?: string; message: string }[];
  };
  if (!res.ok || !body.wizardId || !body.shareUrl) {
    throw new ServiceError(
      body.issues?.length ? "has_issues" : "refused",
      body.error ?? "Veröffentlichen in der Cloud hat nicht geklappt.",
      body.issues?.length ? { issues: body.issues } : {},
    );
  }
  const copy: CloudCopy = {
    wizardId: body.wizardId,
    shareUrl: body.shareUrl,
    version: body.version ?? 1,
    publishedAt: new Date().toISOString(),
  };
  await writeSetting(key(w.id), copy);
  return copy;
}
