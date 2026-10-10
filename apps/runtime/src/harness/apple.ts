import { existsSync } from "node:fs";
import { release } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ModelUnavailableError } from "../model-errors.js";
import {
  type HarnessAnswer,
  type HarnessCall,
  HarnessModel,
  lastJson,
  runClient,
} from "./model.js";

/**
 * Apple Intelligence on this Mac as a model: the on-device foundation model of macOS 26, run
 * through `wizards-apple` (apps/runtime/apple/main.swift) — one process per call, as every
 * installed AI client is run. Nothing leaves the machine and nothing is signed in. It is offered
 * where it can run: a Mac with Apple silicon on macOS 26 or later with the helper built, and it
 * answers once Apple Intelligence is switched on. The model is small (about 3B parameters,
 * 4,096 tokens for prompt and answer together): a way for the Classifier and Standard classes,
 * not for research, long documents or code. `apple:default` is the model; `apple:tagging` is
 * Apple's adapter for tagging and extraction.
 */

/** The helper: built into dist/apple by `scripts/build-apple.mjs`, or named by the environment. */
export const APPLE_BIN =
  process.env.WIZARDS_APPLE_BIN?.trim() ||
  resolve(dirname(fileURLToPath(import.meta.url)), "../../dist/apple/wizards-apple");

export const APPLE = { id: "apple", name: "Apple Intelligence" } as const;

/** Why Apple Intelligence is not there: the device, the system, the helper, or a switch. */
export type AppleReason = "device" | "os" | "missing" | "off" | "loading";

export interface AppleStatus {
  /** A Mac with Apple silicon on macOS 26 or later with the helper built: the settings show the choice. */
  supported: boolean;
  /** Apple Intelligence answers right now. */
  available: boolean;
  reason: AppleReason | null;
}

interface HelperStatus {
  available: boolean;
  reason?: string;
  os?: string;
}

interface HelperAnswer {
  text?: string;
  error?: { kind: string; message: string };
}

/** Darwin 25 is macOS 26: the first system with the Foundation Models framework. */
const DARWIN_OF_MACOS_26 = 25;

/** What this machine is, before the helper is asked: a Mac with Apple silicon on macOS 26 or later. */
export function appleMachine(
  platform = process.platform,
  arch = process.arch,
  darwin = release(),
): AppleReason | null {
  if (platform !== "darwin" || arch !== "arm64") {
    return "device";
  }
  return Number.parseInt(darwin, 10) >= DARWIN_OF_MACOS_26 ? null : "os";
}

/** The helper's reason, as the status names it. */
export function appleReasonOf(helper: string | undefined): AppleReason {
  switch (helper) {
    case "appleIntelligenceNotEnabled":
      return "off";
    case "modelNotReady":
      return "loading";
    default:
      return "device";
  }
}

/**
 * Without instructions the model refuses guided calls as "likely unsafe" (seen on macOS 26.5
 * with a billing complaint); any instruction settles it. A step always brings its own.
 */
const DEFAULT_INSTRUCTIONS = "Answer what the prompt asks, precisely and briefly.";

const helperEnv = () => ({
  PATH: process.env.PATH ?? "/usr/bin:/bin",
  HOME: process.env.HOME ?? "",
  LANG: process.env.LANG ?? "en_US.UTF-8",
});

let detected: { at: number; value: AppleStatus } | null = null;

/** Apple Intelligence as it is now; asked again after a minute — the person may switch it on meanwhile. */
export async function appleStatus(force = false): Promise<AppleStatus> {
  if (!force && detected && Date.now() - detected.at < 60_000) {
    return detected.value;
  }
  const value = await detectApple();
  detected = { at: Date.now(), value };
  return value;
}

async function detectApple(): Promise<AppleStatus> {
  const machine = appleMachine();
  if (machine) {
    return { supported: false, available: false, reason: machine };
  }
  if (!existsSync(APPLE_BIN)) {
    return { supported: false, available: false, reason: "missing" };
  }
  try {
    const { stdout } = await runClient(APPLE_BIN, ["status"], {
      cwd: process.cwd(),
      env: helperEnv(),
      signal: AbortSignal.timeout(15_000),
    });
    const status = lastJson<HelperStatus>(stdout);
    if (!status) {
      return { supported: true, available: false, reason: "missing" };
    }
    return status.available
      ? { supported: true, available: true, reason: null }
      : { supported: true, available: false, reason: appleReasonOf(status.reason) };
  } catch {
    return { supported: true, available: false, reason: "missing" };
  }
}

/** What to tell the person when Apple Intelligence cannot answer. */
export function appleUnavailable(status: AppleStatus): string {
  switch (status.reason) {
    case "off":
      return "Apple Intelligence ist auf diesem Mac ausgeschaltet. Einschalten unter Systemeinstellungen → Apple Intelligence & Siri.";
    case "loading":
      return "Apple lädt das Modell für Apple Intelligence noch auf diesen Mac. Gleich noch einmal versuchen.";
    case "missing":
      return "Der Helfer für Apple Intelligence (wizards-apple) fehlt in dieser Installation.";
    case "os":
      return "Apple Intelligence braucht macOS 26 oder neuer.";
    default:
      return "Apple Intelligence gibt es nur auf einem Mac mit Apple Silicon.";
  }
}

/** The failure the helper reports, as the person should read it. */
export function appleFailure(error: { kind: string; message: string }): Error {
  switch (error.kind) {
    case "unavailable":
      return new ModelUnavailableError(
        appleUnavailable({
          supported: true,
          available: false,
          reason: appleReasonOf(error.message),
        }),
      );
    case "rateLimited":
      return new ModelUnavailableError(
        "Apple Intelligence nimmt gerade keine weiteren Anfragen an. Gleich noch einmal versuchen.",
      );
    case "contextWindow":
      return new Error(
        "Apple Intelligence: Der Text ist zu lang für das Modell auf diesem Mac (4.096 Tokens für Frage und Antwort). Diese Klasse in den Einstellungen unter „Modelle & Konto“ auf ein anderes Modell legen.",
      );
    case "guardrail":
    case "refusal":
      return new Error(
        "Apple Intelligence hat die Anfrage abgelehnt: Apples Inhaltsregeln lassen sie nicht zu.",
      );
    case "language":
      return new Error("Apple Intelligence versteht die Sprache dieser Anfrage nicht.");
    case "schema":
      return new Error(
        `Apple Intelligence kann dieses Antwortformat nicht liefern: ${error.message}`,
      );
    default:
      return new Error(`Apple Intelligence: ${error.message}`.slice(0, 500));
  }
}

class AppleModel extends HarnessModel {
  readonly provider = "apple";
  /** The model keeps to the schema itself (guided generation). */
  protected override readonly nativeSchema = true;
  /** The helper calls no tools: a call with tools answers from the prompt alone. */
  protected override readonly usesTools = false;

  protected async invoke(call: HarnessCall): Promise<HarnessAnswer> {
    const { stdout, stderr, code } = await runClient(APPLE_BIN, ["generate"], {
      cwd: call.dir,
      env: helperEnv(),
      signal: call.signal,
      stdin: JSON.stringify({
        system: call.system || DEFAULT_INSTRUCTIONS,
        prompt: call.prompt,
        schema: call.schema,
        useCase: this.modelId === "tagging" ? "tagging" : "general",
      }),
    });
    const answer = lastJson<HelperAnswer>(stdout);
    if (!answer) {
      throw new Error(`Apple Intelligence: ${stderr.trim() || `exit ${code}`}`.slice(0, 500));
    }
    if (answer.error) {
      throw appleFailure(answer.error);
    }
    return { text: answer.text ?? "" };
  }
}

/** `apple:default` or `apple:tagging` as a language model. */
export function appleModel(alias: string): HarnessModel {
  return new AppleModel(APPLE, alias || "default");
}
