import {
  isDecisionStep,
  MODEL_CLASSES,
  type ModelClass,
  type PageStep,
  ruleMatches,
  type Step,
  type WizardDefinition,
} from "@engenty-wizards/shared/definition";
import type { Capability } from "@engenty-wizards/shared/marketplace";
import type { ClosedChoice, MissingModel } from "@engenty-wizards/shared/run";
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
    case "page":
      // A voice note the page asks for is listened to before the next step reads it.
      return step.fields.some((f) => f.kind === "audio" && f.required) ? ["audio"] : [];
    default:
      // Reviews (they redo a generate step counted already), widgets, results.
      return [];
  }
}

/** The classes a step can do without: a voice note the person may leave out. */
export function optionalStepClasses(step: Step): ModelClass[] {
  return step.type === "page" &&
    step.fields.some((f) => f.kind === "audio" && !f.required) &&
    !stepClasses(step).includes("audio")
    ? ["audio"]
    : [];
}

/** The steps every run passes through: without one of them the end is not reachable. */
export function unavoidableSteps(def: WizardDefinition): Set<string> {
  return def.steps.length ? unavoidableFrom(def, def.steps[0].id, {}) : new Set();
}

/**
 * The steps every path from `from` to the end passes through. A rule on an answer in `known`
 * goes one way; a rule on anything else may go either way.
 */
export function unavoidableFrom(
  def: WizardDefinition,
  from: string,
  known: Record<string, unknown>,
): Set<string> {
  const index = new Map(def.steps.map((s, i) => [s.id, i]));
  const start = index.get(from) ?? 0;
  const successors = (i: number): number[] => {
    const out: number[] = [];
    for (const rule of def.steps[i].next ?? []) {
      const target = rule.goto === "end" ? def.steps.length : (index.get(rule.goto) ?? -1);
      if (!(rule.when.field in known)) {
        if (target >= 0) {
          out.push(target);
        }
        continue;
      }
      if (ruleMatches(rule, known)) {
        // The first rule that matches decides; nothing after it is tried.
        return target >= 0 ? [...out, target] : out;
      }
    }
    // No rule matching goes on to the next step (or ends after the last).
    out.push(i + 1);
    return out;
  };
  const reachesEnd = (without: number): boolean => {
    if (without === start) {
      return false;
    }
    const seen = new Set<number>([start]);
    const queue = [start];
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
  const needs = new Map<ModelClass, { step: Step; required: boolean }[]>();
  for (const step of def.steps) {
    for (const cls of new Set(stepClasses(step))) {
      needs.set(cls, [...(needs.get(cls) ?? []), { step, required: true }]);
    }
    for (const cls of optionalStepClasses(step)) {
      needs.set(cls, [...(needs.get(cls) ?? []), { step, required: false }]);
    }
  }
  const missing: MissingModel[] = [];
  for (const [cls, uses] of needs) {
    const problem = await classProblem(cls);
    if (problem) {
      missing.push({
        cls,
        problem,
        steps: uses.map(({ step }) => ({ id: step.id, title: step.title })),
        blocking: uses.some(({ step, required }) => required && unavoidable.has(step.id)),
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

/** The classes this runtime cannot serve. */
export async function missingClasses(): Promise<Set<ModelClass>> {
  const missing = new Set<ModelClass>();
  for (const cls of MODEL_CLASSES) {
    if (await classProblem(cls)) {
      missing.add(cls);
    }
  }
  return missing;
}

/**
 * The capabilities of a wizard that only some of its paths need: without them it still starts,
 * on the other paths (animated stills instead of video clips, no voice-over).
 */
export function optionalCapabilities(def: WizardDefinition): Set<Capability> {
  const unavoidable = unavoidableSteps(def);
  const required = new Set<ModelClass>();
  const any = new Set<ModelClass>();
  for (const step of def.steps) {
    for (const cls of stepClasses(step)) {
      any.add(cls);
      if (unavoidable.has(step.id)) {
        required.add(cls);
      }
    }
    for (const cls of optionalStepClasses(step)) {
      any.add(cls);
    }
  }
  const optional = new Set<Capability>();
  for (const [capability, cls] of Object.entries(CAPABILITY_CLASS)) {
    if (any.has(cls) && !required.has(cls)) {
      optional.add(capability as Capability);
    }
  }
  return optional;
}

/** The choices a page offers: each select's options, a toggle's on and off. */
interface Choice {
  field: string;
  values: (string | boolean)[];
}

function choicesOf(step: PageStep): Choice[] {
  return step.fields.flatMap((f): Choice[] => {
    if (f.kind === "select" && f.options?.length) {
      return [{ field: f.id, values: f.options }];
    }
    if (f.kind === "toggle") {
      return [{ field: f.id, values: [true, false] }];
    }
    return [];
  });
}

/**
 * The answers on a page that lead to a step this runtime has no model for: with them the run
 * would stop there, after what came before was paid for. The answers given already count; the
 * page's other fields may still go either way. A choice whose every value leads there is left
 * open: the run cannot go around it, and the start already warned. A voice note nothing here
 * can listen to is closed as a whole (no values).
 */
export async function closedChoices(
  def: WizardDefinition,
  step: PageStep,
  values: Record<string, unknown>,
): Promise<Record<string, ClosedChoice>> {
  const missing = await missingClasses();
  if (!missing.size) {
    return {};
  }
  const byId = new Map(def.steps.map((s) => [s.id, s]));
  const known = Object.fromEntries(
    Object.entries(values).filter(([id]) => !step.fields.some((f) => f.id === id)),
  );
  const out: Record<string, ClosedChoice> = {};
  // A voice note nothing here can listen to: the field is closed as a whole.
  if (missing.has("audio")) {
    for (const field of step.fields) {
      if (field.kind === "audio") {
        out[field.id] = { values: [], classes: ["audio"] };
      }
    }
  }
  for (const choice of choicesOf(step)) {
    const closed: ClosedChoice = { values: [], classes: [] };
    for (const value of choice.values) {
      const ahead = unavoidableFrom(def, step.id, { ...known, [choice.field]: value });
      const lacking = [...ahead].flatMap((id) => {
        const s = byId.get(id);
        return s ? stepClasses(s).filter((cls) => missing.has(cls)) : [];
      });
      if (lacking.length) {
        closed.values.push(value);
        closed.classes = [...new Set([...closed.classes, ...lacking])];
      }
    }
    if (closed.values.length && closed.values.length < choice.values.length) {
      out[choice.field] = closed;
    }
  }
  return out;
}

/** The answer a closed choice gets instead: its first value that stays open. */
export function openValue(
  step: PageStep,
  field: string,
  closed: ClosedChoice,
): string | boolean | undefined {
  const choice = choicesOf(step).find((c) => c.field === field);
  return choice?.values.find((v) => !closed.values.some((c) => String(c) === String(v)));
}
