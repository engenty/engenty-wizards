import { costTier, runsFor } from "@engenty-wizards/shared/cost-tier";
import { parseWizard, type WizardDefinition } from "@engenty-wizards/shared/definition";
import { describe, expect, it } from "vitest";
import { formulaEstimate } from "../src/credits/estimate.js";
import type { GatewayCatalog } from "../src/models.js";

// The gateway's prices from its own test (manage: apps/server/test/gateway.test.ts).
const catalog = {
  markup: 2,
  webSearchCredits: 2,
  classes: {
    classifier: { model: "c", kind: "text", inputCreditsPerMTok: 40, outputCreditsPerMTok: 250 },
    standard: { model: "s", kind: "text", inputCreditsPerMTok: 60, outputCreditsPerMTok: 500 },
    high: { model: "h", kind: "text", inputCreditsPerMTok: 150, outputCreditsPerMTok: 750 },
    image: { model: "i", kind: "image", creditsPerImage: 13.4 },
    video: { model: "v", kind: "video", creditsPerSecond: 16 },
  },
  models: [],
} as unknown as GatewayCatalog;

function wizard(steps: unknown[]): WizardDefinition {
  const parsed = parseWizard({ version: 1, title: "T", description: "D", avatar: "round", steps });
  if (!parsed.ok) {
    throw new Error(JSON.stringify(parsed.issues));
  }
  return parsed.wizard;
}

const done = (from: string) => ({
  id: "done",
  type: "result",
  title: "Done",
  deliverables: [{ from, formats: ["png"] }],
});

// The prompt call of a media step: 2000 in, 300 out on Standard.
const PROMPT = (2000 * 60 + 300 * 500) / 1e6;

describe("formulaEstimate", () => {
  it("prices an image step with each once per upload the field allows", () => {
    const def = wizard([
      {
        id: "upload",
        type: "page",
        title: "Photos",
        fields: [{ id: "photos", label: "Photos", kind: "image", multiple: true, max: 5 }],
      },
      { id: "art", type: "generate", title: "Art", asset: "image", prompt: "x", each: "photos" },
      done("art"),
    ]);
    expect(formulaEstimate(def, catalog).credits).toBeCloseTo(5 * 13.4 + PROMPT, 1);
  });

  it("prices a clip per still when a video step repeats an image step", () => {
    const def = wizard([
      {
        id: "upload",
        type: "page",
        title: "Photos",
        fields: [{ id: "photos", label: "Photos", kind: "image", multiple: true, max: 4 }],
      },
      { id: "stills", type: "generate", title: "Stills", asset: "image", prompt: "x", each: "photos" },
      {
        id: "clips",
        type: "generate",
        title: "Clips",
        asset: "video",
        prompt: "x",
        each: "stills",
        referenceImage: "stills",
        options: { duration: 6 },
      },
      done("clips"),
    ]);
    const stills = 4 * 13.4 + PROMPT;
    const clips = 4 * 6 * 16 + PROMPT;
    expect(formulaEstimate(def, catalog).credits).toBeCloseTo(stills + clips, 1);
  });

  it("holds twice the text but only a tenth more for clips, whose price is known", () => {
    const def = wizard([
      { id: "ask", type: "page", title: "Topic", fields: [{ id: "topic", label: "Topic", kind: "text" }] },
      { id: "clip", type: "generate", title: "Clip", asset: "video", prompt: "{{topic}}" },
      done("clip"),
    ]);
    const { high } = formulaEstimate(def, catalog);
    expect(high).toBe(Math.ceil(8 * 16 * 1.1 + PROMPT * 2));
  });

  it("keeps one result for a media step without each", () => {
    const def = wizard([
      { id: "ask", type: "page", title: "Topic", fields: [{ id: "topic", label: "Topic", kind: "text" }] },
      { id: "art", type: "generate", title: "Art", asset: "image", prompt: "{{topic}}" },
      done("art"),
    ]);
    expect(formulaEstimate(def, catalog).credits).toBeCloseTo(13.4 + PROMPT, 1);
  });

  it("finds a quiz with a Standard step and a widget light", () => {
    const def = wizard([
      {
        id: "you",
        type: "page",
        title: "You",
        fields: [{ id: "monday", label: "Monday", kind: "select", options: ["a", "b"] }],
      },
      {
        id: "read",
        type: "agent",
        title: "Read",
        instructions: "{{monday}}",
        tools: [],
        model: "standard",
        output: { format: "json", fields: [{ id: "kind", kind: "text", description: "k" }] },
      },
      { id: "card", type: "widget", title: "Card", entry: "card/index.html", data: { r: "steps.read" } },
      done("card"),
    ]);
    const { credits } = formulaEstimate(def, catalog);
    expect(costTier(credits)).toBe("light");
    expect(runsFor(500, credits)).toBeGreaterThanOrEqual(250);
  });
});

describe("costTier", () => {
  it("draws the lines at 2 and 25 credits", () => {
    expect([1.6, 2, 2.1, 25, 26, 340].map(costTier)).toEqual([
      "light",
      "light",
      "medium",
      "medium",
      "heavy",
      "heavy",
    ]);
  });
});
