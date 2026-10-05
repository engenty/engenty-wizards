import { and, eq, isNotNull, like } from "drizzle-orm";
import { accountToken, linkedAccount } from "../auth/account.js";
import { control, controlDb, db, schema } from "../db/client.js";
import { env } from "../env.js";
import { getBlob } from "../files/blobs.js";
import { managed } from "../manage.js";
import { deleteSetting, readSetting, writeSetting } from "../settings.js";
import { currentTenant } from "../tenants/tenant.js";
import { mainLogoId } from "./brand.js";
import { ServiceError } from "./errors.js";
import { projectFileContent, projectFiles } from "./project-files.js";
import { ownedProject } from "./projects.js";
import type { ServerProblem, SpaceInput, SyncResult } from "./spaces.js";
import { ownedWizard, publishedVersion, publishWizard } from "./wizards.js";

/**
 * A runtime that runs alone, linked to an account: what it publishes also goes to the account's
 * cloud runtime, which runs it for everyone (docs/manage-contract.md, "Spaces of a local
 * install"). Only the published version is sent, when it is published; drafts, runs and
 * connected accounts stay here. The cloud makes the link of its copy.
 */

export interface CloudCopy {
  /** The link of the copy in the cloud. */
  shareUrl: string;
  /** The wizard's ID for the mobile app; a cloud before it knew IDs sends none. */
  code?: string;
  /** The version last sent from here. */
  version: number;
  /** The version runs start on in the cloud; null when none could be published there. */
  publishedVersion: number | null;
  runnable: boolean;
  problems: ServerProblem[];
  syncedAt: string;
}

export interface CloudState {
  copy: CloudCopy | null;
  /** Why the last try did not arrive; the copy from before stays as it was. */
  error: { message: string; reason?: string; at: string } | null;
}

/** What the cloud lacks for a wizard, and what stays here: said before it is sent. */
export interface CloudCheck {
  problems: ServerProblem[];
  /** The project has documents; they are not sent, so steps there work without them. */
  documents: boolean;
}

const key = (wizardId: string) => `cloud:${wizardId}`;
const EMPTY: CloudState = { copy: null, error: null };

/** Whether this runtime sends what it publishes: it runs alone and an account is linked. */
export async function cloudLinked(): Promise<boolean> {
  return !managed && Boolean(await linkedAccount());
}

/** Where a local wizard stands in the cloud. */
export async function cloudState(wizardId: string): Promise<CloudState> {
  return (await readSetting<CloudState>(key(wizardId))) ?? EMPTY;
}

interface CloudAnswer<T> {
  ok: boolean;
  status: number;
  body: T & { error?: string; reason?: string };
}

async function call<T>(
  method: string,
  path: string,
  body?: unknown,
  timeoutMs = 30_000,
): Promise<CloudAnswer<T>> {
  const token = await accountToken();
  if (!token) {
    throw new ServiceError("refused", "Das Konto ist nicht mehr angemeldet. Bitte neu anmelden.", {
      reason: "signed_out",
    });
  }
  const res = await fetch(`${env.local.cloudUrl}/api/v1${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  }).catch(() => null);
  if (!res) {
    throw new ServiceError("refused", "Die Cloud ist gerade nicht erreichbar.", {
      reason: "unreachable",
    });
  }
  const parsed = (await res.json().catch(() => ({}))) as T & { error?: string; reason?: string };
  return { ok: res.ok, status: res.status, body: parsed };
}

function refusal(answer: CloudAnswer<unknown>, fallback: string): ServiceError {
  const { error, reason, ...rest } = answer.body as Record<string, unknown>;
  const message =
    answer.status === 401
      ? "Das Konto ist nicht mehr angemeldet. Bitte neu anmelden."
      : typeof error === "string" && error
        ? error
        : fallback;
  return new ServiceError("refused", message, {
    reason: answer.status === 401 ? "signed_out" : typeof reason === "string" ? reason : "refused",
    ...(Array.isArray(rest.spaces) ? { spaces: rest.spaces } : {}),
  });
}

/** The project as the cloud keeps it: its name, what it says about itself, its logo. */
async function spaceOf(userId: string, projectId: string): Promise<SpaceInput> {
  const project = await ownedProject(userId, projectId);
  const logoId = await mainLogoId(project.id);
  const logo = logoId ? await projectFileContent(project.id, logoId).catch(() => null) : null;
  return {
    name: project.name,
    brand: {
      name: project.brand.name,
      about: project.brand.about,
      colors: project.brand.colors,
    },
    facts: project.facts,
    logo: logo
      ? {
          name: logo.row.name,
          mime: logo.row.mime,
          description: logo.row.description,
          data: Buffer.from(logo.data).toString("base64"),
        }
      : null,
  };
}

/**
 * Sends a wizard's published version to the cloud: the same wizard again updates its copy
 * there, whose link stays. What came back is kept; a try that failed is kept as such beside
 * the copy from before.
 */
export async function syncToCloud(userId: string, wizardId: string): Promise<CloudState> {
  const w = await ownedWizard(userId, wizardId);
  const version = await publishedVersion(w);
  if (!version) {
    throw new ServiceError("refused", "Bitte den Wizard zuerst veröffentlichen.");
  }
  const before = await cloudState(w.id);
  try {
    const files = await Promise.all(
      version.files.map(async (f) => ({
        path: f.path,
        mime: f.mime,
        data: (await getBlob(f.hash)).toString("base64"),
      })),
    );
    const answer = await call<SyncResult>(
      "PUT",
      `/spaces/${w.projectId}/wizards/${w.id}`,
      {
        space: await spaceOf(userId, w.projectId),
        version: version.version,
        definition: version.definition,
        files,
        shareEnabled: w.shareEnabled,
        dailyRunLimit: w.dailyRunLimit,
      },
      120_000,
    );
    if (!answer.ok || !answer.body.shareUrl) {
      throw refusal(answer, "Die Cloud hat den Wizard nicht angenommen.");
    }
    const state: CloudState = {
      copy: {
        shareUrl: answer.body.shareUrl,
        code: answer.body.code,
        version: version.version,
        publishedVersion: answer.body.publishedVersion,
        runnable: answer.body.runnable,
        problems: answer.body.problems ?? [],
        syncedAt: new Date().toISOString(),
      },
      error: null,
    };
    await writeSetting(key(w.id), state);
    return state;
  } catch (err) {
    const failed: CloudState = {
      copy: before.copy,
      error: {
        message: err instanceof ServiceError ? err.message : "Das Senden hat nicht geklappt.",
        reason: err instanceof ServiceError ? (err.data.reason as string | undefined) : undefined,
        at: new Date().toISOString(),
      },
    };
    await writeSetting(key(w.id), failed);
    if (!(err instanceof ServiceError)) {
      console.error("[cloud] sync failed:", err);
    }
    return failed;
  }
}

/**
 * Publishes here and, with an account linked, sends the version on. The cloud never holds the
 * publishing up or back: what it answered comes along as `cloud`.
 */
export async function publishAndSync(userId: string, wizardId: string) {
  const published = await publishWizard(userId, wizardId);
  const cloud = (await cloudLinked()) ? await syncToCloud(userId, wizardId) : null;
  return { ...published, cloud };
}

/** How a wizard is shared changed here: the copy in the cloud follows. */
export async function pushSharing(userId: string, wizardId: string): Promise<void> {
  if (!(await cloudLinked())) {
    return;
  }
  const state = await cloudState(wizardId);
  if (!state.copy) {
    return;
  }
  const w = await ownedWizard(userId, wizardId);
  await call("PATCH", `/spaces/${w.projectId}/wizards/${w.id}`, {
    shareEnabled: w.shareEnabled,
    dailyRunLimit: w.dailyRunLimit,
  }).catch((err) => console.error("[cloud] sharing not sent:", (err as Error).message));
}

/** A wizard is about to be deleted here: its copy in the cloud goes too. */
export async function removeFromCloud(userId: string, wizardId: string): Promise<void> {
  const state = await cloudState(wizardId);
  if (!state.copy && !state.error) {
    return;
  }
  const w = await ownedWizard(userId, wizardId).catch(() => null);
  await deleteSetting(key(wizardId));
  if (!w || !state.copy || !(await cloudLinked())) {
    return;
  }
  await call("DELETE", `/spaces/${w.projectId}/wizards/${w.id}`).catch((err) =>
    console.error("[cloud] copy not removed:", (err as Error).message),
  );
}

/** The account was unlinked: what this runtime kept of its cloud belongs to no account now. */
export async function forgetCloud(): Promise<void> {
  await controlDb.delete(control.setting).where(like(control.setting.key, "cloud:%"));
}

/** Sends every published wizard: once after an account was linked. */
export async function syncAllToCloud(userId: string): Promise<{ sent: number; failed: number }> {
  const wizards = await db
    .select({ id: schema.wizard.id })
    .from(schema.wizard)
    .where(
      and(eq(schema.wizard.tenantId, currentTenant()), isNotNull(schema.wizard.publishedVersion)),
    );
  let sent = 0;
  let failed = 0;
  for (const { id } of wizards) {
    const state = await syncToCloud(userId, id);
    if (state.error) {
      failed++;
      // A refusal that holds for every wizard (no room, signed out) is not asked again.
      if (state.error.reason && state.error.reason !== "refused") {
        break;
      }
    } else {
      sent++;
    }
  }
  return { sent, failed };
}

/** What the cloud would lack for the draft, asked before it is published. */
export async function checkForCloud(userId: string, wizardId: string): Promise<CloudCheck> {
  const w = await ownedWizard(userId, wizardId);
  const files = await db
    .select({ path: schema.wizardFile.path })
    .from(schema.wizardFile)
    .where(eq(schema.wizardFile.wizardId, w.id));
  const answer = await call<{ problems: ServerProblem[] }>("POST", "/spaces/check", {
    definition: w.draft,
    files: files.map((f) => f.path),
  });
  if (!answer.ok) {
    throw refusal(answer, "Die Cloud hat nicht geantwortet.");
  }
  const documents = await projectFiles(w.projectId, "document");
  return {
    problems: answer.body.problems ?? [],
    documents: documents.length > 0 && w.draft.steps.some((s) => s.type === "agent"),
  };
}

export interface CloudSpace {
  id: string;
  name: string;
  syncedAt: string | null;
  wizards: { id: string; title: string; publishedVersion: number | null; shareUrl: string }[];
}

/** The projects the account's cloud holds of local installs: this one's, or another machine's. */
export async function cloudSpaces(): Promise<CloudSpace[]> {
  const answer = await call<{ spaces: CloudSpace[] }>("GET", "/spaces");
  if (!answer.ok) {
    throw refusal(answer, "Die Cloud hat nicht geantwortet.");
  }
  return answer.body.spaces ?? [];
}

/**
 * Makes room for this install's project: the projects of other installs go from the cloud, with
 * their links, then everything published here is sent. For the person who moved to a new
 * machine or installed anew.
 */
export async function replaceCloudSpaces(userId: string) {
  const mine = new Set(
    (
      await db
        .select({ id: schema.project.id })
        .from(schema.project)
        .where(eq(schema.project.tenantId, currentTenant()))
    ).map((p) => p.id),
  );
  for (const space of await cloudSpaces()) {
    if (!mine.has(space.id)) {
      const answer = await call("DELETE", `/spaces/${space.id}`);
      if (!answer.ok) {
        throw refusal(answer, "Das Projekt in der Cloud ließ sich nicht entfernen.");
      }
    }
  }
  return syncAllToCloud(userId);
}
