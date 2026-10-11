import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { release } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { TranscriptionModel } from "ai";
import { nanoid } from "nanoid";
import { env } from "../env.js";
import { ffmpeg, hasFfmpeg } from "../media/ffmpeg.js";
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

type TranscriptionV3 = Extract<TranscriptionModel, { specificationVersion: "v3" }>;
type TranscribeOptions = Parameters<TranscriptionV3["doGenerate"]>[0];
type TranscribeResult = Awaited<ReturnType<TranscriptionV3["doGenerate"]>>;

/** The Mac's own language: what a voice note is most likely in, unless the call names one. */
function systemLocale(): string {
  const locale = Intl.DateTimeFormat().resolvedOptions().locale;
  return /^[a-z]{2}-[A-Z]{2}$/.test(locale) ? locale : locale.startsWith("de") ? "de-DE" : "en-US";
}

/** What AVAudioFile reads as it is; a browser's WebM or Ogg (Opus) is turned into WAV first. */
function audioExtension(mediaType: string): { ext: string; native: boolean } {
  const type = mediaType.split(";")[0].trim().toLowerCase();
  if (/mp4|m4a|aac/.test(type)) {
    return { ext: "m4a", native: true };
  }
  if (/wav/.test(type)) {
    return { ext: "wav", native: true };
  }
  if (/aiff/.test(type)) {
    return { ext: "aiff", native: true };
  }
  if (/mpeg|mp3/.test(type)) {
    return { ext: "mp3", native: true };
  }
  if (/ogg|opus/.test(type)) {
    return { ext: "ogg", native: false };
  }
  return { ext: "webm", native: false };
}

/**
 * `apple:transcribe`: a voice note written down on this Mac by SpeechAnalyzer (macOS 26). It
 * needs no Apple Intelligence, only the language's assets, which the system installs on the
 * first call. The recording goes through a file of its own, deleted afterwards; what the
 * system cannot read (a browser's WebM) becomes WAV through ffmpeg on the way.
 */
class AppleTranscriptionModel implements TranscriptionV3 {
  readonly specificationVersion = "v3" as const;
  readonly provider = "apple";
  readonly modelId = "transcribe";

  async doGenerate(options: TranscribeOptions): Promise<TranscribeResult> {
    const dir = join(env.dataDir, "harness", nanoid(10));
    mkdirSync(dir, { recursive: true });
    const { ext, native } = audioExtension(options.mediaType);
    const given = join(dir, `note.${ext}`);
    const locale = (options.providerOptions?.apple?.locale as string | undefined) ?? systemLocale();
    try {
      writeFileSync(
        given,
        typeof options.audio === "string" ? Buffer.from(options.audio, "base64") : options.audio,
      );
      let path = given;
      if (!native) {
        if (!(await hasFfmpeg())) {
          throw new Error(
            `Apple Intelligence liest ${options.mediaType} nicht; ohne ffmpeg bleibt die Aufnahme so. ffmpeg installieren oder im Browser als MP4 aufnehmen.`,
          );
        }
        path = join(dir, "note.wav");
        const { code, stderr } = await ffmpeg([
          "-y",
          "-i",
          given,
          "-ac",
          "1",
          "-ar",
          "16000",
          path,
        ]);
        if (code !== 0) {
          throw new Error(
            `Apple Intelligence: die Aufnahme ließ sich nicht wandeln: ${stderr.slice(-300)}`,
          );
        }
      }
      const { stdout, stderr, code } = await runClient(APPLE_BIN, ["transcribe", path, locale], {
        cwd: dir,
        env: helperEnv(),
        signal: options.abortSignal,
      });
      const answer = lastJson<HelperAnswer>(stdout);
      if (!answer) {
        throw new Error(`Apple Intelligence: ${stderr.trim() || `exit ${code}`}`.slice(0, 500));
      }
      if (answer.error) {
        throw appleFailure(answer.error);
      }
      return {
        text: answer.text ?? "",
        segments: [],
        language: locale.slice(0, 2),
        durationInSeconds: undefined,
        warnings: [],
        response: { timestamp: new Date(), modelId: this.modelId, headers: undefined },
      };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        throw new ModelUnavailableError(
          appleUnavailable({ supported: false, available: false, reason: "missing" }),
        );
      }
      throw err;
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
}

export function appleTranscriptionModel(): TranscriptionModel {
  return new AppleTranscriptionModel();
}
