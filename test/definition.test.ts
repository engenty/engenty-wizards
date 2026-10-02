import { describe, expect, it } from "vitest";
import { itemsTotals, nextStepId, parseWizard } from "../shared/definition";
import { STARTERS } from "../server/starters/index";

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
});
