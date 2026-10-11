import type { TextClass } from "@engenty-wizards/shared/definition";
import { api } from "../lib/api";
import { appCall, appCan } from "../lib/app";

/**
 * The phone around the runner as a model: when the app offers `think` (Apple Intelligence on
 * the phone), the runner tells the runtime, which then sends short text calls of a run over its
 * stream as `device` events; the answer goes back by POST. Nothing is paid for them and the
 * text stays on the phone. The runtime thinks on its own where the phone does not answer.
 */

/** The classes a phone's small model takes, and the longest prompt (4k tokens ≈ 12k chars). */
const THINKS: TextClass[] = ["classifier", "standard"];
const MAX_CHARS = 12_000;

export interface DeviceRequest {
  id: string;
  kind: "think";
  system: string;
  prompt: string;
  schema: unknown | null;
}

/** Tells the runtime what the app offers this run; renewed on every connect of the stream. */
export function offerDevice(runId: string) {
  if (!appCan("think")) {
    return;
  }
  void api
    .post(`/api/runs/${runId}/device`, { think: { classes: THINKS, maxChars: MAX_CHARS } })
    .catch(() => undefined);
}

/** One call from the runtime, answered by the app. */
export async function answerDevice(runId: string, request: DeviceRequest) {
  if (request.kind !== "think") {
    return;
  }
  let answer: { text: string } | { error: string };
  try {
    const result = await appCall<{ text: string }>("think", {
      system: request.system,
      prompt: request.prompt,
      schema: request.schema,
    });
    answer = { text: String(result?.text ?? "") };
  } catch (err) {
    answer = { error: (err as Error).message.slice(0, 500) };
  }
  await api.post(`/api/runs/${runId}/device/${request.id}`, answer).catch(() => undefined);
}

/** A recording written down by the app on the phone; undefined when the app cannot. */
export async function transcribeOnDevice(file: Blob, lang: string): Promise<string | undefined> {
  if (!appCan("transcribe")) {
    return undefined;
  }
  try {
    const audio = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
    const result = await appCall<{ text: string } | null>("transcribe", {
      audio,
      mime: file.type,
      lang,
    });
    return typeof result?.text === "string" ? result.text : undefined;
  } catch {
    return undefined;
  }
}
