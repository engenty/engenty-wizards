import { describe, expect, it } from "vitest";
import {
  type AgentStep,
  branchValues,
  isDecisionStep,
  itemsTotals,
  nextStepId,
  parseWizard,
} from "@engenty-wizards/shared/definition";
import { STARTERS } from "../src/starters/index";

describe("starters", () => {
  for (const s of STARTERS) {
    it(`${s.id} is a valid wizard`, () => {
      const parsed = parseWizard(s.definition);
      expect(parsed.ok).toBe(true);
      expect(parsed.issues).toEqual([]);
    });
  }
});

describe("validator", () => {
  it("rejects a template naming a later field", () => {
    const parsed = parseWizard({
      title: "x",
      steps: [
        { id: "a", type: "agent", title: "A", instructions: "use {{topic}}", tools: [] },
        { id: "p", type: "page", title: "P", fields: [{ id: "topic", label: "T", kind: "text" }] },
        { id: "r", type: "result", title: "R", deliverables: [{ from: "a", formats: ["md"] }] },
      ],
    });
    expect(parsed.ok && parsed.issues.map((i) => i.message).join()).toContain("topic");
  });

  it("follows branches", () => {
    const parsed = parseWizard({
      title: "x",
      steps: [
        { id: "p", type: "page", title: "P", fields: [{ id: "kind", label: "K", kind: "select", options: ["a", "b"] }], next: [{ when: { field: "kind", op: "equals", value: "b" }, goto: "r" }] },
        { id: "q", type: "page", title: "Q", fields: [{ id: "x", label: "X", kind: "text" }] },
        { id: "r", type: "result", title: "R", deliverables: [] },
      ],
    });
    if (!parsed.ok) throw new Error("invalid");
    expect(nextStepId(parsed.wizard, "p", { kind: "b" })).toBe("r");
    expect(nextStepId(parsed.wizard, "p", { kind: "a" })).toBe("q");
  });
});

describe("decisions", () => {
  const fields = [
    { id: "refund", kind: "yesno", description: "Does the customer ask for money back?" },
    { id: "topic", kind: "choice", options: ["delivery", "billing"] },
  ];
  /** A wizard whose second step judges a mail; `step` overrides parts of that step. */
  const wizard = (step: Record<string, unknown> = {}) => ({
    title: "x",
    steps: [
      { id: "p", type: "page", title: "P", fields: [{ id: "mail", label: "M", kind: "textarea" }] },
      {
        id: "check",
        type: "agent",
        title: "Check",
        instructions: "Judge {{mail}}",
        model: "classifier",
        output: { format: "json", fields },
        ...step,
      },
      { id: "thanks", type: "agent", title: "Thanks", instructions: "Write a thank-you note." },
      { id: "refund", type: "agent", title: "Refund", instructions: "Write the refund note." },
      { id: "r", type: "result", title: "R", deliverables: [{ from: "check", formats: ["json"] }] },
    ],
  });
  const checkStep = (step: Record<string, unknown> = {}) => {
    const parsed = parseWizard(wizard(step));
    if (!parsed.ok) {
      throw new Error(parsed.issues.map((i) => i.message).join("; "));
    }
    return parsed.wizard.steps[1] as AgentStep;
  };

  it("takes yes/no and choice fields; a choice lists its options", () => {
    expect(isDecisionStep(checkStep())).toBe(true);
    const bare = parseWizard(
      wizard({ output: { format: "json", fields: [{ id: "topic", kind: "choice" }] } }),
    );
    expect(bare.ok).toBe(false);
  });

  it("is a decision only on the classifier class, without tools and other fields", () => {
    expect(isDecisionStep(checkStep({ model: "standard" }))).toBe(false);
    expect(isDecisionStep(checkStep({ tools: ["web_search"] }))).toBe(false);
    expect(
      isDecisionStep(
        checkStep({ output: { format: "json", fields: [...fields, { id: "why", kind: "text" }] } }),
      ),
    ).toBe(false);
  });

  it("branches on a yes/no answer", () => {
    const parsed = parseWizard(
      wizard({
        next: [{ when: { field: "steps.check.refund", op: "equals", value: true }, goto: "refund" }],
      }),
    );
    if (!parsed.ok) {
      throw new Error("invalid");
    }
    const after = (refund: boolean) =>
      nextStepId(
        parsed.wizard,
        "check",
        branchValues({ mail: "…" }, { check: { json: { refund, topic: "delivery" } } }),
      );
    expect(after(true)).toBe("refund");
    expect(after(false)).toBe("thanks");
  });

  it("refuses a branch on an output field the step does not have", () => {
    const parsed = parseWizard(
      wizard({
        next: [{ when: { field: "steps.check.nope", op: "equals", value: true }, goto: "refund" }],
      }),
    );
    expect(parsed.issues.map((i) => i.message)).toEqual([
      'Branch reads unknown field "steps.check.nope".',
    ]);
  });
});

describe("line items", () => {
  it("computes net, VAT and total", () => {
    const field = {
      id: "items",
      label: "Items",
      kind: "items" as const,
      columns: [
        { id: "d", label: "D", kind: "text" as const },
        { id: "q", label: "Q", kind: "number" as const },
        { id: "p", label: "P", kind: "money" as const },
      ],
      vat: { field: "tax" },
    };
    const t = itemsTotals(field, [{ d: "a", q: 2, p: 100 }, { d: "b", q: 1.5, p: 80.5 }], { tax: "20" });
    expect(t.net).toBe(320.75);
    expect(t.vat).toBe(64.15);
    expect(t.gross).toBe(384.9);
  });

  it("totals amounts typed with a decimal comma, as a German number pad gives them", () => {
    const field = {
      id: "items",
      label: "Items",
      kind: "items" as const,
      columns: [
        { id: "q", label: "Q", kind: "number" as const },
        { id: "p", label: "P", kind: "money" as const },
      ],
      vat: { rate: 20 },
    };
    const t = itemsTotals(field, [{ q: "42", p: "1,62" }, { q: "1", p: " 89,90 " }, { q: "x", p: "5" }], {});
    expect(t.net).toBe(157.94);
    expect(t.gross).toBe(189.53);
  });
});
