import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  defaultFeatures,
  formatFeatures,
  parseFeatures,
  resolveFeatures,
} from "@engenty-wizards/shared/features";
import { afterAll, describe, expect, it } from "vitest";
import { fileFeatures, writeFeature } from "../src/features.js";

const dir = mkdtempSync(join(tmpdir(), "features-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("feature switches", () => {
  it("reads every way a line or a list writes a switch", () => {
    expect(
      parseFeatures(`
        # a comment
        teamPlans
        +site
        -account
        !unsetConnectors
        ownKeys = off  # trailing comment
        contacts.leadScoring=yes
        Bad-Name
        nonsense=maybe
      `),
    ).toEqual({
      teamPlans: true,
      site: true,
      account: false,
      unsetConnectors: false,
      ownKeys: false,
      "contacts.leadScoring": true,
    });
    expect(parseFeatures("teamPlans,-site, account=0")).toEqual({
      teamPlans: true,
      site: false,
      account: false,
    });
  });

  it("lays the layers over each other, the last winning", () => {
    const all = resolveFeatures(defaultFeatures(), { teamPlans: true }, null, { teamPlans: false, site: true });
    expect(all).toMatchObject({ teamPlans: false, site: true, account: true, ownKeys: true });
  });

  it("writes the file and reads it again when it changed", () => {
    const file = join(dir, ".features");
    expect(fileFeatures(file)).toEqual({});
    writeFeature("teamPlans", true, file);
    writeFeature("site", false, file);
    expect(readFileSync(file, "utf8")).toBe("teamPlans\nsite=off\n");
    expect(fileFeatures(file)).toEqual({ teamPlans: true, site: false });
    writeFeature("teamPlans", null, file);
    expect(fileFeatures(file)).toEqual({ site: false });
    writeFeature("site", null, file);
    expect(existsSync(file)).toBe(false);
    writeFileSync(file, "contacts.leadScoring\n");
    // A fresh mtime: the file is read again.
    expect(formatFeatures(fileFeatures(file))).toBe("contacts.leadScoring\n");
  });
});
