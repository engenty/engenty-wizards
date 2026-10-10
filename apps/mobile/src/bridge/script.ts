/**
 * The JavaScript the Run screen puts into the runner's page before it loads: `window.engentyApp`
 * (apps/web/src/lib/app.ts reads it), the visitor cookie, and the app's language and theme for
 * the runner. It runs in the top frame only, and only on the runtime the wizard was added from:
 * a page the WebView reaches elsewhere (a sign-in, a link) gets no bridge.
 */

/**
 * What this app may offer the runner; the web runner falls back to its own way for the rest.
 * `transcribe` and `think` are Apple's models on the phone (modules/apple-intelligence): named
 * to a page only where the phone has them (appAbilities in handle.ts).
 */
export const ABILITIES = [
  "scan",
  "share",
  "download",
  "keepAwake",
  "notify",
  "notifyPermission",
  "signIn",
  "run",
  "transcribe",
  "think",
] as const;

export type Ability = (typeof ABILITIES)[number];

/** What every phone offers. */
export const BASE_ABILITIES: Ability[] = [
  "scan",
  "share",
  "download",
  "keepAwake",
  "notify",
  "notifyPermission",
  "signIn",
  "run",
];

export const BRIDGE_VERSION = 1;

export interface BridgeRequest {
  bridge: "engenty-app";
  id: number;
  method: Ability;
  args: unknown;
}

export function isBridgeRequest(data: unknown): data is BridgeRequest {
  const d = data as BridgeRequest;
  return (
    typeof d === "object" &&
    d !== null &&
    d.bridge === "engenty-app" &&
    typeof d.id === "number" &&
    (ABILITIES as readonly string[]).includes(d.method)
  );
}

export function bridgeScript(opts: {
  origin: string;
  visitorId: string;
  lang: "en" | "de";
  secure: boolean;
  /** What this phone offers; the page reads it as `engentyApp.can`. */
  can: Ability[];
}): string {
  const cookie = `wz_vid=${opts.visitorId}; path=/; max-age=31536000; samesite=lax${opts.secure ? "; secure" : ""}`;
  return `(function () {
  if (window.top !== window.self || location.origin !== ${JSON.stringify(opts.origin)}) return;
  try {
    document.cookie = ${JSON.stringify(cookie)};
    localStorage.setItem("wizards.lang", ${JSON.stringify(opts.lang)});
    localStorage.setItem("wizards.theme", "dark");
  } catch (e) {}
  var pending = {};
  var next = 1;
  window.__engentyAppAnswer = function (id, ok, value) {
    var p = pending[id];
    if (!p) return;
    delete pending[id];
    if (ok) p.resolve(value); else p.reject(new Error(String(value)));
  };
  window.engentyApp = Object.freeze({
    version: ${BRIDGE_VERSION},
    can: ${JSON.stringify(opts.can)},
    call: function (method, args) {
      return new Promise(function (resolve, reject) {
        var id = next++;
        pending[id] = { resolve: resolve, reject: reject };
        window.ReactNativeWebView.postMessage(
          JSON.stringify({ bridge: "engenty-app", id: id, method: method, args: args === undefined ? null : args })
        );
      });
    }
  });
})();
true;`;
}

/** The answer to one call, run in the page. */
export function answerScript(id: number, ok: boolean, value: unknown): string {
  return `window.__engentyAppAnswer && window.__engentyAppAnswer(${id}, ${ok}, ${JSON.stringify(
    value ?? null,
  )}); true;`;
}
