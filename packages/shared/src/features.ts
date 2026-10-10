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
export interface FeatureDeclaration {
  kind: "release" | "plan";
  /** What counts until a layer says otherwise. */
  default: boolean;
  /** A few words for the lists: `wizards features`, the admin's switches. */
  label: string;
  hint?: string;
}

/**
 * The core's own switches. A plugin declares its own in its manifest (`features`, keyed by the
 * short name; the switch is known as `<plugin id>.<name>`) and they join these at run time.
 */
export const FEATURES = {
  account: {
    kind: "release",
    default: true,
    label: "Account in a local install",
    hint: "Linking, Settings → Account, the offer to sign in.",
  },
  unsetConnectors: {
    kind: "release",
    default: false,
    label: "Connectors without an OAuth client",
    hint: "Built-in connectors are shown although their client is not set up.",
  },
  site: {
    kind: "release",
    default: false,
    label: "Link to the website in the setup",
    hint: "The local install's setup links the product's site.",
  },
  teamPlans: {
    kind: "release",
    default: false,
    label: "Team plans",
    hint: "The team page in the cloud studio, and plans that carry this switch on the account pages.",
  },
  ownKeys: {
    kind: "plan",
    default: true,
    label: "Own API keys",
    hint: "The team puts its providers' keys into the cloud studio instead of running on credits.",
  },
} as const satisfies Record<string, FeatureDeclaration>;

export type FeatureName = keyof typeof FEATURES;
export type FeatureKind = (typeof FEATURES)[FeatureName]["kind"];

/** A switch by name; a plugin's own switches carry its id: `contacts.leadScoring`. */
export type Features = Record<string, boolean>;

/** `teamPlans`, `contacts.leadScoring`. */
export const FEATURE_NAME = /^[a-z][a-zA-Z0-9]*(\.[a-z][a-zA-Z0-9]*)?$/;

export const FEATURE_NAMES = Object.keys(FEATURES) as FeatureName[];

/** What a manifest declares for one switch; what is left out is a release switch, off, named by its key. */
export interface FeatureDeclarationInput {
  kind?: "release" | "plan";
  default?: boolean;
  label?: string;
  hint?: string;
}

/** A plugin's declarations under its id: `contacts` + `leadScoring` → `contacts.leadScoring`. */
export function declaredByPlugin(
  pluginId: string,
  features: Record<string, FeatureDeclarationInput | boolean> | undefined,
): Record<string, FeatureDeclaration> {
  const out: Record<string, FeatureDeclaration> = {};
  for (const [key, raw] of Object.entries(features ?? {})) {
    const name = `${pluginId}.${key}`;
    if (!FEATURE_NAME.test(name)) {
      continue;
    }
    const d = typeof raw === "boolean" ? { default: raw } : raw;
    out[name] = {
      kind: d.kind ?? "release",
      default: d.default ?? false,
      label: d.label ?? key,
      ...(d.hint ? { hint: d.hint } : {}),
    };
  }
  return out;
}

/** The defaults of these declarations; without any, the core's. */
export function defaultFeatures(declared: Record<string, FeatureDeclaration> = FEATURES): Features {
  const out: Features = {};
  for (const [name, d] of Object.entries(declared)) {
    out[name] = d.default;
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
