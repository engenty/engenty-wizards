import type { ModelClass, WizardDefinition } from "@engenty-wizards/shared/definition";
import { describe, expect, it, vi } from "vitest";
import { blockingMessage, missingModels, unavoidableSteps } from "../src/engine/requirements";

const unavailable = new Set<ModelClass>();
vi.mock("../src/models", () => ({
  classProblem: async (cls: ModelClass) =>
    unavailable.has(cls) ? `Für ${cls} ist kein Modell eingerichtet.` : null,
}));

/** The property video's shape: voice and video sit behind a choice, the photos do not. */
const tour = {
  title: "Objektvideo",
  steps: [
    { id: "object", type: "page", title: "Welches Objekt?", fields: [] },
    {
      id: "plan",
      type: "agent",
      title: "Räume ansehen",
      tools: [],
      output: { format: "json", fields: [] },
      next: [{ when: { field: "voiceOn", op: "notEquals", value: true }, goto: "staged" }],
    },
    { id: "voice", type: "generate", title: "Sprecher aufnehmen", asset: "voice" },
    { id: "staged", type: "generate", title: "Fotos aufbereiten", asset: "image" },
    {
      id: "stagedCheck",
      type: "review",
      title: "Passen die Bilder?",
      show: ["staged"],
      next: [{ when: { field: "motion", op: "equals", value: "Fotos" }, goto: "film" }],
    },
    { id: "clips", type: "generate", title: "Rundgang drehen", asset: "video" },
    { id: "film", type: "widget", title: "Rundgang schneiden" },
    { id: "done", type: "result", title: "Fertig" },
  ],
} as unknown as WizardDefinition;

describe("what a wizard needs of the models before it starts", () => {
  it("finds the steps every run passes through", () => {
    const steps = unavoidableSteps(tour);
    expect([...steps].sort()).toEqual(
      ["object", "plan", "staged", "stagedCheck", "film", "done"].sort(),
    );
    expect(steps.has("voice")).toBe(false);
    expect(steps.has("clips")).toBe(false);
  });

  it("only warns when the missing models sit behind a choice", async () => {
    unavailable.clear();
    unavailable.add("video").add("speech");
    const missing = await missingModels(tour);
    expect(missing.map((m) => [m.cls, m.blocking])).toEqual([
      ["speech", false],
      ["video", false],
    ]);
    expect(blockingMessage(missing)).toBeNull();
  });

  it("refuses the start when a step on every path cannot run", async () => {
    unavailable.clear();
    unavailable.add("image");
    const missing = await missingModels(tour);
    expect(missing).toEqual([
      {
        cls: "image",
        problem: "Für image ist kein Modell eingerichtet.",
        steps: [{ id: "staged", title: "Fotos aufbereiten" }],
        blocking: true,
      },
    ]);
    expect(blockingMessage(missing)).toBe(
      "„Fotos aufbereiten“: Für image ist kein Modell eingerichtet.",
    );
  });
});
