import {
  type Condition,
  conditionMatches,
  conditionsOf,
  isDecidedField,
  isDecisionStep,
  isOtherwise,
  MODEL_CLASSES,
  type ModelClass,
  type NextRule,
  type PageStep,
  ruleMatches,
  type Step,
  type WizardDefinition,
} from "@engenty-wizards/shared/definition";
import type { Capability } from "@engenty-wizards/shared/marketplace";
import type { ClosedChoice, MissingModel } from "@engenty-wizards/shared/run";
import { classProblem, filmClient } from "../models.js";

/**
 * What a wizard needs of the models before a run starts: each class its steps call, and whether
 * this runtime can serve it. A step every run passes through blocks the start when its class is
 * missing; a step behind a branch only warns, since the person may choose around it.
 */

/**
 * The classes a step calls, as ../engine/steps.ts and ../media/generate.ts call them — and the
 * classifier where a decision picks its next step or a page's fields.
 */
export function stepClasses(step: Step): ModelClass[] {
  const own = ownClasses(step);
  const decides =
    step.next?.some((r) => r.ask) || (step.type === "page" && step.fields.some(isDecidedField));
  return decides && !own.includes("classifier") ? [...own, "classifier"] : own;
}

function ownClasses(step: Step): ModelClass[] {
  switch (step.type) {
    case "agent": {
      // A call runs one tool and no model.
      if (step.call) {
        return [];
      }
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
      if (step.output.surface && !classes.includes("standard")) {
        classes.push("standard");
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
    case "film":
      return [step.model ?? "standard"];
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
      if (isOtherwise(rule)) {
        continue;
      }
      const target = rule.goto === "end" ? def.steps.length : (index.get(rule.goto) ?? -1);
      if (rule.ask || !conditionsOf(rule.when).every((c) => c.field in known)) {
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
    // No rule matching goes on to the "otherwise" step, else the next (or ends after the last).
    out.push(otherwiseIndex(def, i, index));
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

/** Where step `i` goes when none of its rules holds, as an index; the length = the end. */
function otherwiseIndex(def: WizardDefinition, i: number, index: Map<string, number>): number {
  const goto = def.steps[i].next?.find(isOtherwise)?.goto;
  if (goto === undefined) {
    return i + 1;
  }
  return goto === "end" ? def.steps.length : (index.get(goto) ?? i + 1);
}

/** What the branches taken so far say about an answer. */
interface Known {
  is?: string;
  not: string[];
  filled?: boolean;
}
type Facts = Record<string, Known>;

/** Whether a rule matches given what is known: true, false, or null = it may go either way. */
function ruleHolds(rule: NextRule, facts: Facts): boolean | null {
  // A decision may go either way.
  if (rule.ask) {
    return null;
  }
  let all: boolean | null = true;
  for (const c of conditionsOf(rule.when)) {
    const holds = conditionHolds(c, facts);
    if (holds === false) {
      return false;
    }
    if (holds === null) {
      all = null;
    }
  }
  return all;
}

function conditionHolds(c: Condition, facts: Facts): boolean | null {
  const k = facts[c.field];
  const value = c.value;
  switch (c.op) {
    case "empty":
      return k?.filled === undefined ? (k?.is !== undefined ? false : null) : !k.filled;
    case "notEmpty":
      return k?.filled === undefined ? (k?.is !== undefined ? true : null) : k.filled;
    case "equals":
      return k?.is !== undefined
        ? k.is === String(value)
        : k?.not.includes(String(value))
          ? false
          : null;
    case "notEquals":
      return k?.is !== undefined
        ? k.is !== String(value)
        : k?.not.includes(String(value))
          ? true
          : null;
    case "in": {
      const list = Array.isArray(value) ? value.map(String) : [];
      if (k?.is !== undefined) {
        return list.includes(k.is);
      }
      return list.every((v) => k?.not.includes(v)) ? false : null;
    }
    case "gt":
    case "lt":
    case "contains":
      if (k?.is !== undefined) {
        return conditionMatches(c, { [c.field]: k.is });
      }
      return k?.filled === false ? false : null;
  }
}

/**
 * What is known once a rule did (`held`) or did not match. A rule of several conditions that
 * did not match says nothing about any one of them.
 */
function learn(rule: NextRule, held: boolean, facts: Facts): Facts {
  if (rule.ask) {
    return facts;
  }
  const conditions = conditionsOf(rule.when);
  if (held) {
    return conditions.reduce((known, c) => learnCondition(c, true, known), facts);
  }
  return conditions.length === 1 ? learnCondition(conditions[0], false, facts) : facts;
}

function learnCondition(c: Condition, held: boolean, facts: Facts): Facts {
  const field = c.field;
  const k: Known = { ...(facts[field] ?? { not: [] }) };
  k.not = [...k.not];
  const value = String(c.value);
  const op = c.op;
  if ((op === "equals" && held) || (op === "notEquals" && !held)) {
    k.is = value;
    k.filled = true;
  } else if ((op === "equals" && !held) || (op === "notEquals" && held)) {
    k.not.push(value);
  } else if (op === "in" && !held && Array.isArray(c.value)) {
    k.not.push(...c.value.map(String));
  } else if (op === "empty" || op === "notEmpty") {
    k.filled = (op === "notEmpty") === held;
  } else if ((op === "gt" || op === "lt" || op === "contains") && held) {
    k.filled = true;
  }
  return { ...facts, [field]: k };
}

/**
 * The most a run can add up to along one way through the wizard. A branch remembers what it
 * implies of the answers, so ways that contradict themselves (the 720p clips and the 480p
 * ones) are not added up. Steps in `closed` are not passed (no model for them here); where that
 * leaves no way to the end, they count again. A branch back to an earlier step is not followed
 * twice.
 */
export function mostAlongOnePath(
  def: WizardDefinition,
  cost: (step: Step) => number,
  closed: Set<string> = new Set(),
): number {
  const index = new Map(def.steps.map((s, i) => [s.id, i]));
  const end = def.steps.length;
  const walk = (avoid: Set<string>): number | null => {
    const best = (i: number, facts: Facts, seen: Set<number>): number | null => {
      if (i >= end) {
        return 0;
      }
      const step = def.steps[i];
      if (i < 0 || avoid.has(step.id) || seen.has(i)) {
        return null;
      }
      const passed = new Set(seen).add(i);
      let most: number | null = null;
      const consider = (j: number, known: Facts) => {
        const rest = best(j, known, passed);
        if (rest !== null && (most === null || rest > most)) {
          most = rest;
        }
      };
      // The rules are tried in order; the first that matches decides.
      let known = facts;
      let decided = false;
      for (const rule of step.next ?? []) {
        if (isOtherwise(rule)) {
          continue;
        }
        const holds = ruleHolds(rule, known);
        if (holds === false) {
          continue;
        }
        consider(
          rule.goto === "end" ? end : (index.get(rule.goto) ?? -1),
          learn(rule, true, known),
        );
        if (holds === true) {
          decided = true;
          break;
        }
        known = learn(rule, false, known);
      }
      if (!decided) {
        consider(otherwiseIndex(def, i, index), known);
      }
      return most === null ? null : most + cost(step);
    };
    return best(0, {}, new Set());
  };
  return walk(closed) ?? walk(new Set()) ?? def.steps.reduce((sum, s) => sum + cost(s), 0);
}

/** The steps that call a class this runtime cannot serve. */
export async function stepsWithoutModel(def: WizardDefinition): Promise<Set<string>> {
  const missing = await missingClasses();
  return new Set(
    def.steps.filter((s) => stepClasses(s).some((cls) => missing.has(cls))).map((s) => s.id),
  );
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
  // A film runs on an installed client only, whatever serves its class otherwise.
  for (const step of def.steps) {
    if (step.type !== "film") {
      continue;
    }
    const cls = step.model ?? "standard";
    const found = await filmClient(cls);
    if ("problem" in found) {
      missing.push({
        cls,
        problem: found.problem,
        steps: [{ id: step.id, title: step.title }],
        blocking: unavoidable.has(step.id),
      });
    }
  }
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
  if ("problem" in (await filmClient("standard"))) {
    missing.add("film");
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
