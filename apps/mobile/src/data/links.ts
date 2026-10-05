/**
 * What the person scanned, pasted or typed: a wizard's link `<runtime>/w/<token>`, a shared
 * result `<runtime>/s/<token>`, the app's own `engenty-wizards://w?url=…`, a wizard's ID
 * (8 capitals and digits, `GET /api/public/codes/:code`) or a bare share token.
 */
export type Parsed =
  | { kind: "wizard"; runtime: string; token: string; runId?: string }
  | { kind: "result"; runtime: string; token: string }
  | { kind: "code"; code: string }
  | { kind: "token"; token: string };

/** The runtime engenty.ai, where IDs are asked by default. */
export const DEFAULT_RUNTIME = "https://engenty.ai";

const TOKEN = /^[A-Za-z0-9_-]{6,64}$/;
/** Capitals and digits without look-alikes, as the runtime makes them. */
const CODE = /^[2-9A-HJ-NP-Z]{8}$/;

export const normalizeCode = (input: string) => input.toUpperCase().replace(/[\s-]/g, "");

/** `K7WM4TQ9` → `K7WM 4TQ9`. */
export const spacedCode = (code: string) => `${code.slice(0, 4)} ${code.slice(4)}`;

function fromUrl(url: URL): Parsed | null {
  if (url.protocol === "engenty-wizards:") {
    const inner = url.searchParams.get("url");
    if (!inner) {
      return null;
    }
    try {
      return fromUrl(new URL(inner));
    } catch {
      return null;
    }
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return null;
  }
  // A runtime may live under a base path: the last `/w/` or `/s/` names the wizard or result.
  const m = url.pathname.match(/^(.*?)\/(w|s)\/([A-Za-z0-9_-]{6,64})(?:\/([A-Za-z0-9_-]+))?\/?$/);
  if (!m) {
    return null;
  }
  const runtime = `${url.origin}${m[1]}`;
  if (m[2] === "s") {
    return { kind: "result", runtime, token: m[3] };
  }
  return m[4]
    ? { kind: "wizard", runtime, token: m[3], runId: m[4] }
    : { kind: "wizard", runtime, token: m[3] };
}

export function parseInput(input: string): Parsed | null {
  const text = input.trim();
  if (!text) {
    return null;
  }
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) {
    try {
      return fromUrl(new URL(text));
    } catch {
      return null;
    }
  }
  // A link without its scheme, as people paste it: engenty.ai/w/…
  if (/^[\w.-]+\.[a-z]{2,}(:\d+)?\/(w|s)\//i.test(text)) {
    return parseInput(`https://${text}`);
  }
  const code = normalizeCode(text);
  if (CODE.test(code)) {
    return { kind: "code", code };
  }
  if (TOKEN.test(text)) {
    return { kind: "token", token: text };
  }
  return null;
}

/** The runtime's host as people read it: none for engenty.ai. */
export function hostLabel(runtime: string): string | null {
  try {
    const url = new URL(runtime);
    return url.origin === DEFAULT_RUNTIME ? null : url.host;
  } catch {
    return runtime;
  }
}

export const wizardUrl = (runtime: string, token: string) => `${runtime}/w/${token}`;
