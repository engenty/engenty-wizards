import { z } from "zod";

/**
 * Decisions: typed questions over a state, answered by a decision model (System One: TypeSafe's
 * Jev and models of its kind) or, where there is none, by a language model asked for the same
 * answers as structured output. Both ways give the same shapes; only a decision model gives
 * probabilities that mean something.
 */

/** Yes or no: P(yes). */
export interface NoulQuestion {
  type: "noul";
  instructions: string;
  criteria?: { true: string; false: string };
}

/** One of named options, each with what it covers (null: the name says it). */
export interface ChoiceQuestion {
  type: "choice";
  instructions: string;
  criteria: Record<string, string | null>;
}

/** A level on an ordered scale, lowest first. */
export interface ScoreQuestion {
  type: "score";
  instructions: string;
  criteria: string[];
}

export type DecisionQuestion = NoulQuestion | ChoiceQuestion | ScoreQuestion;

export interface NoulAnswer {
  type: "noul";
  /** P(yes), 0–1. A language model's answer is 1 or 0. */
  noul: number;
}

export interface ChoiceAnswer {
  type: "choice";
  choice: string;
  /** Per option; only from a decision model. */
  probabilities?: Record<string, number>;
  confidence?: number;
}

export interface ScoreAnswer {
  type: "score";
  /** Index of the level, lowest = 0. */
  level: number;
  /** The level's description, as the question lists it. */
  label: string;
  /** Per level index; only from a decision model. */
  probabilities?: Record<string, number>;
  confidence?: number;
}

export type DecisionAnswer = NoulAnswer | ChoiceAnswer | ScoreAnswer;

export type DecisionSource = "systemone" | "llm";

export interface Decision {
  answers: Record<string, DecisionAnswer>;
  /** Which way answered; with both, the language model filled what the decision model left open. */
  source: DecisionSource;
}

/** Probabilities sum to one within rounding. */
const SUM_TOLERANCE = 0.02;

function unit(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1;
}

/**
 * A distribution over exactly the offered keys that sums to one, with `pick` on top — so a
 * malformed or cut-off answer never counts. Engenty-pro's validateChoiceAnswer.
 */
function validDistribution(
  probabilities: unknown,
  offered: string[],
  pick: string,
): probabilities is Record<string, number> {
  if (!probabilities || typeof probabilities !== "object") {
    return false;
  }
  const p = probabilities as Record<string, unknown>;
  const keys = Object.keys(p);
  if (keys.length !== offered.length || !offered.every((k) => k in p)) {
    return false;
  }
  let sum = 0;
  let max = 0;
  for (const k of keys) {
    if (!unit(p[k])) {
      return false;
    }
    sum += p[k] as number;
    max = Math.max(max, p[k] as number);
  }
  return Math.abs(sum - 1) < SUM_TOLERANCE && (p[pick] as number) >= max - 1e-6;
}

/**
 * The answers a System One response gives that fit their questions; a question whose answer is
 * missing or does not fit is left out, for the language model to answer.
 */
export function readSystemOne(
  questions: Record<string, DecisionQuestion>,
  response: unknown,
): Record<string, DecisionAnswer> {
  const raw = (response as { answers?: Record<string, any> } | null)?.answers ?? {};
  const out: Record<string, DecisionAnswer> = {};
  for (const [name, q] of Object.entries(questions)) {
    const a = raw[name];
    if (!a || typeof a !== "object") {
      continue;
    }
    if (q.type === "noul" && a.type === "noul" && unit(a.noul)) {
      out[name] = { type: "noul", noul: a.noul };
    } else if (q.type === "choice" && a.type === "choice") {
      const offered = Object.keys(q.criteria);
      if (
        typeof a.choice === "string" &&
        offered.includes(a.choice) &&
        validDistribution(a.probabilities, offered, a.choice)
      ) {
        out[name] = {
          type: "choice",
          choice: a.choice,
          probabilities: a.probabilities,
          ...(unit(a.confidence) ? { confidence: a.confidence } : {}),
        };
      }
    } else if (q.type === "score" && a.type === "score") {
      const offered = q.criteria.map((_, i) => String(i));
      const probabilities = a.probabilities as Record<string, number> | undefined;
      const top = probabilities
        ? Object.entries(probabilities).sort((x, y) => y[1] - x[1])[0]?.[0]
        : undefined;
      if (top !== undefined && validDistribution(probabilities, offered, top)) {
        const level = Number(top);
        out[name] = {
          type: "score",
          level,
          label: q.criteria[level],
          probabilities,
          ...(unit(a.confidence) ? { confidence: a.confidence } : {}),
        };
      }
    }
  }
  return out;
}

/** The questions as one structured-output object a language model fills. */
export function decisionSchema(questions: Record<string, DecisionQuestion>) {
  const shape: Record<string, z.ZodType> = {};
  for (const [name, q] of Object.entries(questions)) {
    if (q.type === "noul") {
      const hint = q.criteria ? ` (true: ${q.criteria.true}; false: ${q.criteria.false})` : "";
      shape[name] = z.boolean().describe(`${q.instructions}${hint}`);
    } else if (q.type === "choice") {
      const options = Object.keys(q.criteria) as [string, ...string[]];
      const hints = Object.entries(q.criteria)
        .filter(([, d]) => d)
        .map(([k, d]) => `${k}: ${d}`)
        .join("; ");
      shape[name] = z
        .enum(options)
        .describe(hints ? `${q.instructions} (${hints})` : q.instructions);
    } else {
      shape[name] = z
        .enum(q.criteria as [string, ...string[]])
        .describe(`${q.instructions} (lowest to highest)`);
    }
  }
  return z.object(shape);
}

/** What a language model filled in, as answers; null when it does not fit. */
export function readObject(
  questions: Record<string, DecisionQuestion>,
  object: unknown,
): Record<string, DecisionAnswer> | null {
  if (!object || typeof object !== "object") {
    return null;
  }
  const o = object as Record<string, unknown>;
  const out: Record<string, DecisionAnswer> = {};
  for (const [name, q] of Object.entries(questions)) {
    const v = o[name];
    if (q.type === "noul" && typeof v === "boolean") {
      out[name] = { type: "noul", noul: v ? 1 : 0 };
    } else if (q.type === "choice" && typeof v === "string" && v in q.criteria) {
      out[name] = { type: "choice", choice: v };
    } else if (q.type === "score" && typeof v === "string" && q.criteria.includes(v)) {
      out[name] = { type: "score", level: q.criteria.indexOf(v), label: v };
    } else {
      return null;
    }
  }
  return out;
}

/**
 * How sure the answer is that it picked rightly, as the margin between the winner and the
 * runner-up; null where there are no probabilities (a language model's answer).
 */
export function marginOf(answer: DecisionAnswer): number | null {
  if (answer.type === "noul") {
    return null;
  }
  const p = Object.values(answer.probabilities ?? {}).sort((a, b) => b - a);
  return p.length >= 2 ? p[0] - p[1] : null;
}

/** The probability of what was answered: P(yes) for a yes/no, P(pick) otherwise; 1 without. */
export function pOf(answer: DecisionAnswer): number {
  if (answer.type === "noul") {
    return answer.noul;
  }
  const key = answer.type === "choice" ? answer.choice : String(answer.level);
  return answer.probabilities?.[key] ?? 1;
}
