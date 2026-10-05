import type { PublicWizard } from "@engenty-wizards/shared/run";
import { readSetting, saveWizard, type WizardInfo } from "./db";
import { DEFAULT_RUNTIME, type Parsed, parseInput } from "./links";
import { getWizard, RuntimeError, resolveCode } from "./runtime";

export interface Found {
  runtime: string;
  token: string;
  wizard: PublicWizard;
  /** A run named in the link (`/w/<token>/<runId>`), to open instead of a new one. */
  runId?: string;
}

export type FindError = "invalid" | "notFound" | "tooMany" | "offline";

export class FindFailed extends Error {
  constructor(readonly reason: FindError) {
    super(reason);
  }
}

/** The runtime that answers IDs and bare tokens: engenty.ai unless the settings name another. */
export const idRuntime = () => readSetting("idRuntime", DEFAULT_RUNTIME);

/** What the person typed, scanned or opened → the wizard behind it, not added yet. */
export async function findWizard(input: string | Parsed): Promise<Found> {
  const parsed = typeof input === "string" ? parseInput(input) : input;
  if (!parsed || parsed.kind === "result") {
    throw new FindFailed("invalid");
  }
  try {
    let runtime: string;
    let token: string;
    if (parsed.kind === "wizard") {
      runtime = parsed.runtime;
      token = parsed.token;
    } else if (parsed.kind === "code") {
      runtime = await idRuntime();
      token = (await resolveCode(runtime, parsed.code)).token;
    } else {
      runtime = await idRuntime();
      token = parsed.token;
    }
    const wizard = await getWizard(runtime, token);
    return {
      runtime,
      token,
      wizard,
      ...(parsed.kind === "wizard" && parsed.runId ? { runId: parsed.runId } : {}),
    };
  } catch (err) {
    if (err instanceof FindFailed) {
      throw err;
    }
    if (err instanceof RuntimeError) {
      throw new FindFailed(err.status === 429 ? "tooMany" : "notFound");
    }
    throw new FindFailed("offline");
  }
}

export const infoOf = (w: PublicWizard): WizardInfo => ({
  title: w.title,
  description: w.description,
  avatar: w.avatar,
  brand: w.brand,
  available: w.available,
});

/** Adds the wizard to the person's list (or updates it); answers its id in the app. */
export const addWizard = (found: Found) =>
  saveWizard(found.runtime, found.token, infoOf(found.wizard));
