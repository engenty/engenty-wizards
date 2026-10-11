import {
  defaultFeatures,
  FEATURE_NAME,
  parseFeatures,
  resolveFeatures,
} from "@engenty-wizards/shared/features";
import { declaredFeatures, featuresFile, fileFeatures, writeFeature } from "../features.js";
import { discoverPlugins } from "../plugins/discovery.js";
import { pluginDirs } from "../plugins/loader.js";
import { proModulesDir } from "../plugins/pro-state.js";
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
    // The core's switches and those the plugins here declare, without loading them.
    const found = discoverPlugins([...pluginDirs(), proModulesDir()]).found;
    const declared = declaredFeatures(found);
    const fromEnv = parseFeatures(process.env.FEATURES ?? "");
    const fromFile = fileFeatures(file);
    const all = resolveFeatures(defaultFeatures(declared), fromEnv, fromFile);
    const names = [
      ...new Set([...Object.keys(declared), ...Object.keys(fromEnv), ...Object.keys(fromFile)]),
    ];
    for (const n of names) {
      const source = n in fromFile ? "file" : n in fromEnv ? "FEATURES" : "default";
      const d = declared[n];
      const kind = d ? d.kind : "?";
      console.log(
        `${all[n] ? "on " : "off"}  ${n.padEnd(28)} ${kind.padEnd(8)} ${source.padEnd(9)} ${d?.label ?? ""}`,
      );
    }
    console.log(
      `\nfile: ${file}\nAn account's or a team's switches come on top of these while the runtime runs.`,
    );
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
