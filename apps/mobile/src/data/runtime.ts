import type { PublicWizard, RunView } from "@engenty-wizards/shared/run";
import { visitorId } from "./visitor";

/**
 * The runtime's public API, as the web runner uses it: no session, the visitor `wz_vid`. The app
 * keeps one visitor id per runtime, puts it into the WebView as that cookie and sends it with its
 * own requests in the `x-wizards-visitor` header, so both are the same visitor.
 */

export class RuntimeError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function call<T>(runtime: string, path: string, init: RequestInit = {}): Promise<T> {
  const vid = await visitorId(runtime);
  const res = await fetch(`${runtime}${path}`, {
    ...init,
    headers: {
      accept: "application/json",
      ...visitorPair(vid),
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...init.headers,
    },
  });
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    throw new RuntimeError(body.error ?? `HTTP ${res.status}`, res.status);
  }
  return body as T;
}

export const getWizard = (runtime: string, token: string) =>
  call<PublicWizard>(runtime, `/api/public/wizards/${encodeURIComponent(token)}`);

/** A wizard's ID → its share token, at the runtime that made the ID. */
export const resolveCode = (runtime: string, code: string) =>
  call<{ token: string; url: string }>(runtime, `/api/public/codes/${encodeURIComponent(code)}`);

export const getRun = (runtime: string, runId: string) =>
  call<RunView>(runtime, `/api/runs/${encodeURIComponent(runId)}`);

export const shareRun = (runtime: string, runId: string) =>
  call<{ url: string; expiresAt: string | null }>(runtime, `/api/runs/${runId}/share`, {
    method: "POST",
    body: "{}",
  });

export const unshareRun = (runtime: string, runId: string) =>
  call<{ ok: boolean }>(runtime, `/api/runs/${runId}/share`, { method: "DELETE" });

/** The phone's push device for a run: the runtime tells it when the run is done or waits. */
export const registerDevice = (
  runtime: string,
  runId: string,
  device: { token: string; platform: "ios" | "android"; lang: "en" | "de" },
) =>
  call<{ push: boolean }>(runtime, `/api/runs/${runId}/notify`, {
    method: "POST",
    body: JSON.stringify(device),
  });

export const downloadUrl = (runtime: string, runId: string, stepId: string, format: string) =>
  `${runtime}/api/runs/${runId}/steps/${stepId}/download?format=${format}`;

export const assetUrl = (runtime: string, runId: string, assetId: string) =>
  `${runtime}/api/runs/${runId}/assets/${assetId}`;

/**
 * The visitor, as a runtime takes it: a header, not a Cookie header, which iOS merges with its
 * own cookie store into a value no runtime reads.
 */
const visitorPair = (vid: string) => ({ "x-wizards-visitor": vid });

/** The headers the app's own downloads carry: the same visitor as the WebView. */
export async function visitorHeaders(runtime: string): Promise<Record<string, string>> {
  return visitorPair(await visitorId(runtime));
}
