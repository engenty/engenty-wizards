import {
  isDecisionStep,
  type ModelClass,
  type Step,
  type WizardDefinition,
} from "@engenty-wizards/shared/definition";
import type { Capability } from "@engenty-wizards/shared/marketplace";
import type { MissingModel } from "@engenty-wizards/shared/run";
import { classProblem } from "../models.js";

/**
 * What a wizard needs of the models before a run starts: each class its steps call, and whether
 * this runtime can serve it. A step every run passes through blocks the start when its class is
 * missing; a step behind a branch only warns, since the person may choose around it.
 */

/** The classes a step calls, as ../engine/steps.ts and ../media/generate.ts call them. */
export function stepClasses(step: Step): ModelClass[] {
  switch (step.type) {
    case "agent": {
      if (isDecisionStep(step)) {
        return ["classifier"];
      }
      const classes: ModelClass[] = [step.model ?? "high"];
      if (step.tools.includes("image")) {
        classes.push("image");
      }
      if (step.output.format === "json") {
        classes.push("classifier");
      }
      return classes;
    }
    case "generate":
      switch (step.asset) {
        case "image":
          return ["standard", "image"];
        case "video":
          return ["standard", "video"];
        case "voice":
          return ["speech"];
        default:
          return [step.model ?? "high"];
      }
    default:
      // Pages, reviews (they redo a generate step counted already), widgets, results.
      return [];
  }
}

/** The steps every run passes through: without one of them the end is not reachable. */
export function unavoidableSteps(def: WizardDefinition): Set<string> {
  const index = new Map(def.steps.map((s, i) => [s.id, i]));
  const successors = (i: number): number[] => {
    const out = (def.steps[i].next ?? [])
      .map((rule) => (rule.goto === "end" ? def.steps.length : (index.get(rule.goto) ?? -1)))
      .filter((j) => j >= 0);
    // No rule matching goes on to the next step (or ends after the last).
    out.push(i + 1);
    return out;
  };
  const reachesEnd = (without: number): boolean => {
    if (without === 0) {
      return false;
    }
    const seen = new Set<number>([0]);
    const queue = [0];
    while (queue.length) {
      const i = queue.shift()!;
      if (i >= def.steps.length) {
        return true;
      }
      for (const j of successors(i)) {
        if (j !== without && !seen.has(j)) {
          seen.add(j);
          queue.push(j);
        }
      }
    }
    return false;
  };
  return new Set(def.steps.filter((_, i) => !reachesEnd(i)).map((s) => s.id));
}

/** The classes this wizard needs that this runtime cannot serve; empty = every step can run. */
export async function missingModels(def: WizardDefinition): Promise<MissingModel[]> {
  const unavoidable = unavoidableSteps(def);
  const needs = new Map<ModelClass, Step[]>();
  for (const step of def.steps) {
    for (const cls of new Set(stepClasses(step))) {
      needs.set(cls, [...(needs.get(cls) ?? []), step]);
    }
  }
  const missing: MissingModel[] = [];
  for (const [cls, steps] of needs) {
    const problem = await classProblem(cls);
    if (problem) {
      missing.push({
        cls,
        problem,
        steps: steps.map((s) => ({ id: s.id, title: s.title })),
        blocking: steps.some((s) => unavoidable.has(s.id)),
      });
    }
  }
  return missing;
}

/** The message a run that cannot start gives, naming the steps and why. */
export function blockingMessage(missing: MissingModel[]): string | null {
  const blocking = missing.filter((m) => m.blocking);
  if (!blocking.length) {
    return null;
  }
  return blocking
    .map((m) => `${m.steps.map((s) => `„${s.title}“`).join(", ")}: ${m.problem}`)
    .join(" ");
}

/** The class a marketplace capability stands for; the rest need no model of their own. */
const CAPABILITY_CLASS: Partial<Record<Capability, ModelClass>> = {
  text: "standard",
  documents: "standard",
  image: "image",
  video: "video",
  speech: "speech",
  listening: "audio",
};

/** The capabilities this runtime has no model for. */
export async function missingCapabilities(): Promise<Set<Capability>> {
  const missing = new Set<Capability>();
  for (const [capability, cls] of Object.entries(CAPABILITY_CLASS)) {
    if (await classProblem(cls)) {
      missing.add(capability as Capability);
    }
  }
  return missing;
}
