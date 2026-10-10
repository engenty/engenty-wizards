import {
  defaultFeatures,
  FEATURE_NAME,
  FEATURE_NAMES,
  FEATURES,
  parseFeatures,
  resolveFeatures,
} from "@engenty-wizards/shared/features";
import { featuresFile, fileFeatures, writeFeature } from "../features.js";
import { command } from "./home.js";

/**
 * `wizards features` — the feature switches of this install, from its `.features` file. Not in
 * the help: for whoever works on a part before it is on for everyone.
 *
 *   features                 what is on, and where that comes from
 *   features <name> on|off   put a switch into the file
 *   features <name> default  take it out again
 */
export function featuresCommand(args: string[]): number {
  const [name, value] = args;
  const file = featuresFile();
  if (!name) {
    const fromEnv = parseFeatures(process.env.FEATURES ?? "");
    const fromFile = fileFeatures(file);
    const all = resolveFeatures(defaultFeatures(), fromEnv, fromFile);
    const names = [
      ...new Set([...FEATURE_NAMES, ...Object.keys(fromEnv), ...Object.keys(fromFile)]),
    ];
    for (const n of names) {
      const source = n in fromFile ? file : n in fromEnv ? "FEATURES" : "default";
      const kind = n in FEATURES ? FEATURES[n as keyof typeof FEATURES].kind : "plugin";
      console.log(`${all[n] ? "on " : "off"}  ${n.padEnd(24)} ${kind.padEnd(8)} ${source}`);
    }
    console.log(`\nAn account's or a team's switches come on top of these while the runtime runs.`);
    return 0;
  }
  if (!FEATURE_NAME.test(name)) {
    console.error(`"${name}" is no switch name (teamPlans, contacts.leadScoring).`);
    return 2;
  }
  if (value === "on" || value === "off" || value === "default") {
    writeFeature(name, value === "default" ? null : value === "on", file);
    console.log(
      value === "default"
        ? `${name} follows the default again (${file}). A running runtime reads it at once.`
        : `${name} is ${value} on this machine (${file}). A running runtime reads it at once.`,
    );
    return 0;
  }
  console.error(`${command()} features ${name} on|off|default`);
  return 2;
}
