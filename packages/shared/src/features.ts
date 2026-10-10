/**
 * Feature switches: which parts of a release are on. A switch names a part that ships in the
 * code but is not for everyone yet (`teamPlans`), or one a plan includes (`ownKeys`). The
 * runtime resolves them from the defaults here, what the Manage-App says for the team or the
 * linked account, and this install's `.features` file; the studio and plugins read the result.
 * The names stay in the code — no public page lists them.
 *
 * `release`: on or off for everyone by default; the Manage-App or a `.features` file turns it
 * on for a team or a machine before the default flips. A release switch whose default became
 * `true` is removed, with its branches, in the same release.
 * `plan`: part of a plan. On until the team's plan says `false`; alone nothing says so.
 */
export const FEATURES = {
  /** The account: linking a local install, Settings → Account, the offer to sign in. */
  account: { kind: "release", default: true },
  /** Built-in connectors whose OAuth client is not set up, shown anyway. */
  unsetConnectors: { kind: "release", default: false },
  /** The link to the product's own site from the setup. */
  site: { kind: "release", default: false },
  /** The Team plan: the team page in the cloud studio, the plan on the account pages. */
  teamPlans: { kind: "release", default: false },
  /** Own API keys in the cloud studio. */
  ownKeys: { kind: "plan", default: true },
} as const satisfies Record<string, { kind: "release" | "plan"; default: boolean }>;

export type FeatureName = keyof typeof FEATURES;
export type FeatureKind = (typeof FEATURES)[FeatureName]["kind"];

/** A switch by name; a plugin's own switches carry its id: `contacts.leadScoring`. */
export type Features = Record<string, boolean>;

/** `teamPlans`, `contacts.leadScoring`. */
export const FEATURE_NAME = /^[a-z][a-zA-Z0-9]*(\.[a-z][a-zA-Z0-9]*)?$/;

export const FEATURE_NAMES = Object.keys(FEATURES) as FeatureName[];

/** The defaults of the code. */
export function defaultFeatures(): Features {
  const out: Features = {};
  for (const name of FEATURE_NAMES) {
    out[name] = FEATURES[name].default;
  }
  return out;
}

/**
 * Switches as a file or an environment variable writes them, one per line or comma-separated:
 * `teamPlans` or `+teamPlans` turns one on, `-teamPlans`, `!teamPlans` or `teamPlans=off` turns
 * it off (`=on|off|true|false|yes|no|1|0`). `#` starts a comment. Unknown names are kept: a
 * plugin's switches are not known here.
 */
export function parseFeatures(text: string): Features {
  const out: Features = {};
  for (const raw of text.split(/[\n,]/)) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) {
      continue;
    }
    const m = /^([+\-!]?)\s*([A-Za-z0-9.]+)\s*(?:=\s*(\S+))?$/.exec(line);
    if (!m?.[2] || !FEATURE_NAME.test(m[2])) {
      continue;
    }
    const sign = m[1];
    const value = m[3]?.toLowerCase();
    let on = sign !== "-" && sign !== "!";
    if (value !== undefined) {
      if (["on", "true", "yes", "1"].includes(value)) {
        on = true;
      } else if (["off", "false", "no", "0"].includes(value)) {
        on = false;
      } else {
        continue;
      }
    }
    out[m[2]] = on;
  }
  return out;
}

/** The text of a `.features` file for these switches, one per line. */
export function formatFeatures(features: Features): string {
  const lines = Object.entries(features).map(([name, on]) => (on ? name : `${name}=off`));
  return lines.length ? `${lines.join("\n")}\n` : "";
}

/** Layers laid over each other, the last one winning; null layers are skipped. */
export function resolveFeatures(...layers: (Features | null | undefined)[]): Features {
  const out: Features = {};
  for (const layer of layers) {
    if (layer) {
      Object.assign(out, layer);
    }
  }
  return out;
}
