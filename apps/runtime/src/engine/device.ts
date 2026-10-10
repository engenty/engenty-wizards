import type { TextClass } from "@engenty-wizards/shared/definition";
import type { LanguageModel } from "ai";
import { nanoid } from "nanoid";
import { parseJsonAnswer, renderPrompt } from "../harness/prompt.js";
import { signalDevice } from "./events.js";

/**
 * The device a run is watched from as a model: the mobile app (apps/mobile) offers Apple
 * Intelligence on the phone through the runner's bridge, and the runner tells this runtime so
 * (`POST /api/runs/:id/device`). From then on a text call of the classes it names goes to the
 * phone first — over the run's stream as a `device` event, answered with
 * `POST /api/runs/:id/device/:reqId` — and falls back to the runtime's own way when the phone
 * does not answer in time, the call needs tools, or the prompt is too long for a small model.
 * Tools: every agent step gets the generic ones (lists, the person's documents, the space's
 * knowledge); a step that declares none and has no uploads may be answered without them, as
 * the Mac's Apple Intelligence answers (`attach(tools, ignorable)`). Nothing is paid for an
 * answer from the phone, and the text never leaves it.
 */

export interface DeviceOffer {
  think?: {
    classes: TextClass[];
    /** The longest prompt the phone's model takes, as characters (4k tokens ≈ 12k chars). */
    maxChars: number;
  };
}

export interface DeviceRequest {
  id: string;
  kind: "think";
  system: string;
  prompt: string;
  schema: unknown | null;
}

export interface DeviceAnswer {
  text?: string;
  error?: string;
}

/** An offer not renewed for this long is forgotten: the person left the run. */
const OFFER_TTL_MS = 30 * 60_000;
/** How long the phone has to answer before the runtime thinks on its own. */
export const DEVICE_TIMEOUT_MS = 60_000;

const offers = new Map<string, { offer: DeviceOffer; at: number }>();
const pending = new Map<
  string,
  { runId: string; resolve: (text: string) => void; reject: (err: Error) => void }
>();

/** The runner says what the device around it can do; renewed on every (re)connect. */
export function offerDevice(runId: string, offer: DeviceOffer) {
  if (offer.think?.classes.length) {
    offers.set(runId, { offer, at: Date.now() });
  } else {
    offers.delete(runId);
  }
}

export function forgetDevice(runId: string) {
  offers.delete(runId);
}

/** Whether the device of this run thinks the class, and how much it takes. */
export function deviceThinks(runId: string, cls: string): { maxChars: number } | null {
  const hit = offers.get(runId);
  if (!hit || Date.now() - hit.at > OFFER_TTL_MS) {
    offers.delete(runId);
    return null;
  }
  const think = hit.offer.think;
  return think?.classes.includes(cls as TextClass) ? { maxChars: think.maxChars } : null;
}

/** Sends one call to the device and waits for its answer. */
export function askDevice(
  runId: string,
  request: Omit<DeviceRequest, "id">,
  timeoutMs = DEVICE_TIMEOUT_MS,
): Promise<string> {
  const id = nanoid(10);
  return new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error("the device did not answer in time"));
    }, timeoutMs);
    pending.set(id, {
      runId,
      resolve: (text) => {
        clearTimeout(timer);
        resolve(text);
      },
      reject: (err) => {
        clearTimeout(timer);
        reject(err);
      },
    });
    signalDevice(runId, { id, ...request });
  });
}

/** The device's answer to one call; false when the call is unknown or not this run's. */
export function answerDevice(runId: string, reqId: string, answer: DeviceAnswer): boolean {
  const hit = pending.get(reqId);
  if (!hit || hit.runId !== runId) {
    return false;
  }
  pending.delete(reqId);
  if (typeof answer.text === "string") {
    console.log(`[run ${runId}] the device answered a ${answer.text.length}-character call`);
    hit.resolve(answer.text);
  } else {
    hit.reject(new Error(answer.error || "the device could not answer"));
  }
  return true;
}

type V3 = Extract<LanguageModel, { specificationVersion: "v3" }>;
type CallOptions = Parameters<V3["doGenerate"]>[0];
type GenerateResult = Awaited<ReturnType<V3["doGenerate"]>>;
type StreamResult = Awaited<ReturnType<V3["doStream"]>>;
type StreamPart = StreamResult["stream"] extends ReadableStream<infer P> ? P : never;

/** A model that may run its tools itself (an installed AI client): the device model hands them on. */
interface Attachable {
  attach?(tools: Record<string, unknown>): void;
}

/**
 * The run's device first, the runtime's own model where the device cannot: a call with tools
 * or attachments, a prompt beyond what the phone takes, no answer in time, or an error there.
 */
export class DeviceModel implements V3 {
  readonly specificationVersion = "v3" as const;
  readonly provider = "device";
  readonly modelId: string;
  readonly supportedUrls = {};

  constructor(
    private readonly runId: string,
    private readonly fallback: LanguageModel,
    private readonly maxChars: number,
    private readonly timeoutMs = DEVICE_TIMEOUT_MS,
  ) {
    this.modelId = `device:${this.own().modelId}`;
  }

  private own(): V3 {
    return this.fallback as V3;
  }

  /** Whether the step's tools may be left out: it declared none, and nothing was uploaded. */
  private ignorable = false;

  attach(tools: Record<string, unknown>, ignorable = false) {
    this.ignorable = ignorable;
    (this.fallback as Attachable).attach?.(tools);
  }

  /** What the device can take: the prompt as text alone, short enough, without tools it needs. */
  private request(options: CallOptions): Omit<DeviceRequest, "id"> | null {
    if (options.tools?.length && !this.ignorable) {
      return null;
    }
    const format = options.responseFormat?.type ?? "text";
    if (format !== "text" && format !== "json") {
      return null;
    }
    const { system, prompt, warnings } = renderPrompt(options.prompt);
    if (warnings.length || system.length + prompt.length > this.maxChars) {
      return null;
    }
    return {
      kind: "think",
      system,
      prompt,
      schema:
        options.responseFormat?.type === "json" ? (options.responseFormat.schema ?? null) : null,
    };
  }

  async doGenerate(options: CallOptions): Promise<GenerateResult> {
    const request = this.request(options);
    if (request) {
      try {
        const text = await askDevice(this.runId, request, this.timeoutMs);
        return {
          content: [
            {
              type: "text",
              text: request.schema ? JSON.stringify(parseJsonAnswer(text)) : text,
            },
          ],
          finishReason: { unified: "stop", raw: "device" },
          usage: {
            inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
            outputTokens: { total: 0, text: 0, reasoning: undefined },
            raw: {},
          },
          providerMetadata: { device: { answered: true } },
          response: { modelId: this.modelId },
          warnings: [],
        };
      } catch (err) {
        console.warn(`[run ${this.runId}] device: ${(err as Error).message}; own model instead`);
      }
    }
    return this.own().doGenerate(options);
  }

  async doStream(options: CallOptions): Promise<StreamResult> {
    const request = this.request(options);
    if (!request) {
      return this.own().doStream(options);
    }
    const result = await this.doGenerate(options);
    if (result.providerMetadata?.device?.answered !== true) {
      // The device did not answer: the own model's answer is already here, as one piece.
    }
    const text = result.content.find((c) => c.type === "text");
    const parts: StreamPart[] = [
      { type: "stream-start", warnings: result.warnings },
      { type: "response-metadata", ...result.response },
      { type: "text-start", id: "0" },
      { type: "text-delta", id: "0", delta: text?.type === "text" ? text.text : "" },
      { type: "text-end", id: "0" },
      {
        type: "finish",
        usage: result.usage,
        finishReason: result.finishReason,
        providerMetadata: result.providerMetadata,
      },
    ];
    return {
      stream: new ReadableStream<StreamPart>({
        start(controller) {
          for (const part of parts) {
            controller.enqueue(part);
          }
          controller.close();
        },
      }),
    };
  }
}
