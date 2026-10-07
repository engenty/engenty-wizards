import { assembleSurface, parseWizard, type SurfaceStep } from "@engenty-wizards/shared/definition";
import { bound, pointer, validateSurface } from "@engenty-wizards/shared/surface";
import { describe, expect, it, vi } from "vitest";

const access = vi.hoisted(() => ({ value: null }));
const llm = vi.hoisted(() => ({ output: undefined as unknown }));
vi.mock("../src/models.js", () => ({
  systemOneAccess: async () => access.value,
  textModel: async () => ({ model: "test", vendor: "test" }),
  costOf: () => 0,
}));
vi.mock("ai", () => ({
  generateText: async () => ({ output: llm.output, usage: {} }),
  Output: { object: (o: unknown) => o },
}));

const { runSurfaceStep, surfaceData } = await import("../src/engine/surface");

const facts = [
  { id: "root", component: "Column", children: ["title", "figures", "list"] },
  { id: "title", component: "Text", text: "Angebote", variant: "h3" },
  { id: "figures", component: "Grid", columns: 2, children: ["count"] },
  { id: "count", component: "Metric", label: "Anbieter", value: { path: "/count" } },
  { id: "list", component: "List", children: { path: "/suppliers", componentId: "row" } },
  { id: "row", component: "Row", title: { path: "name" }, meta: { path: "price" } },
];

describe("the surface catalog", () => {
  it("accepts a well-formed surface", () => {
    expect(validateSurface(facts, ["count", "suppliers"])).toEqual([]);
  });

  it("names what is wrong", () => {
    const messages = validateSurface(
      [
        { id: "root", component: "Column", children: ["a", "ghost"] },
        { id: "a", component: "Metric", label: "x" },
        { id: "a", component: "Text", text: { path: "/nowhere" } },
        { id: "b", component: "Button", label: "Go", action: "delete" },
      ],
      ["count"],
    ).map((i) => i.message);
    expect(messages).toContain('Duplicate component id "a".');
    expect(messages).toContain('"root" names a child "ghost" that is not there.');
    expect(messages).toContain('Metric "a" needs "value".');
    expect(messages).toContain('"a" reads "/nowhere", which no data provides.');
    expect(messages.some((m) => m.includes("action is one of"))).toBe(true);
    expect(validateSurface([{ id: "x", component: "Text", text: "t" }]).map((i) => i.message)).toContain(
      'A surface has a component with id "root".',
    );
    expect(validateSurface([{ id: "root", component: "Sparkle" }])).not.toEqual([]);
  });

  it("finds a loop", () => {
    const messages = validateSurface([
      { id: "root", component: "Column", children: ["a"] },
      { id: "a", component: "Column", children: ["root"] },
    ]).map((i) => i.message);
    expect(messages).toContain("Components hold each other in a loop.");
  });

  it("binds props to data and to the repeated row", () => {
    const data = { count: 2, suppliers: [{ name: "Huber", price: 12 }] };
    expect(pointer(data, "/suppliers/0/name")).toBe("Huber");
    expect(bound({ path: "/count" }, data)).toBe(2);
    expect(bound({ path: "price" }, data, data.suppliers[0])).toBe(12);
    expect(bound("literal", data)).toBe("literal");
  });
});

describe("surface steps", () => {
  const research = {
    id: "research",
    type: "agent",
    title: "Research",
    instructions: "find",
    tools: [],
    output: { format: "json", fields: [{ id: "suppliers", kind: "table", columns: ["name", "price"] }, { id: "count", kind: "number" }] },
  };

  it("are checked against their data", () => {
    const parsed = parseWizard({
      title: "x",
      steps: [
        research,
        { id: "view", type: "surface", title: "View", components: facts, data: { count: "steps.research.count", suppliers: "steps.research.suppliers" } },
        { id: "r", type: "result", title: "R", deliverables: [{ from: "view", formats: ["json"] }] },
      ],
    });
    expect(parsed.issues).toEqual([]);
    const broken = parseWizard({
      title: "x",
      steps: [
        research,
        { id: "view", type: "surface", title: "View", components: facts, data: { count: "steps.research.count" } },
        { id: "r", type: "result", title: "R", deliverables: [] },
      ],
    });
    expect(broken.issues.map((i) => i.message).join()).toContain('reads "/suppliers"');
    const both = parseWizard({
      title: "x",
      steps: [{ id: "view", type: "surface", title: "V", data: {} }, { id: "r", type: "result", title: "R", deliverables: [] }],
    });
    expect(both.ok).toBe(false);
  });

  it("read their data from the run", async () => {
    const parsed = parseWizard({
      title: "x",
      lists: [{ id: "seen", title: "Seen", columns: [{ id: "name", name: "Name", type: "text" }] }],
      steps: [
        { id: "p", type: "page", title: "P", fields: [{ id: "who", label: "Who", kind: "text" }] },
        research,
        { id: "view", type: "surface", title: "View", components: facts, data: { count: "steps.research.count", suppliers: "steps.research.suppliers", seen: "lists.seen", who: "who" } },
        { id: "r", type: "result", title: "R", deliverables: [] },
      ],
    });
    if (!parsed.ok) throw new Error("invalid");
    const state = {
      values: { who: "Ada" },
      outputs: { research: { json: { suppliers: [{ name: "Huber", price: 12 }], count: 1 }, at: "" } },
      history: [],
      notes: {},
    };
    const scope = { def: parsed.wizard, state, brand: {}, lists: { seen: { def: parsed.wizard.lists![0], rows: [{ id: "1", cells: { name: "Ben" }, updatedAt: "" }] } } };
    const view = parsed.wizard.steps[2] as SurfaceStep;
    const data = surfaceData(view.data, { def: parsed.wizard, state, scope } as never);
    expect(data).toEqual({ count: 1, suppliers: [{ name: "Huber", price: 12 }], seen: [{ name: "Ben" }], who: "Ada" });
    const out = await runSurfaceStep(view, { def: parsed.wizard, state, scope } as never);
    expect(out.surface?.components).toHaveLength(facts.length);
  });

  it("keep the pieces a decision chose", async () => {
    const step: SurfaceStep = {
      id: "view",
      type: "surface",
      title: "View",
      data: { suppliers: "steps.research.suppliers" },
      candidates: [
        { id: "head", description: "Title", required: true, components: [{ id: "head", component: "Text", text: "Angebote" }] },
        { id: "chart", description: "Prices as bars", components: [{ id: "chart", component: "BarChart", points: { path: "/suppliers" } }] },
        { id: "table", description: "All suppliers", components: [{ id: "table", component: "Table", rows: { path: "/suppliers" } }] },
      ],
    };
    llm.output = { p_chart: false, p_table: true };
    const ctx = {
      def: { title: "x", steps: [step] },
      state: { values: {}, outputs: { research: { json: { suppliers: [] }, at: "" } }, history: [], notes: {} },
      scope: { def: { title: "x", steps: [step] }, state: { values: {}, outputs: {}, history: [], notes: {} }, brand: {} },
      call: {},
      signal: new AbortController().signal,
      chargeUsd: async () => {},
    };
    const out = await runSurfaceStep(step, ctx as never);
    expect(out.surface?.components[0]).toEqual({ id: "root", component: "Column", children: ["head", "table"] });
  });

  it("assemble under one root column", () => {
    const parts = [
      { id: "a", components: [{ id: "a", component: "Text" as const, text: "A" }] },
      { id: "b", components: [{ id: "b", component: "Text" as const, text: "B" }] },
    ];
    expect(assembleSurface(parts, ["b"])).toEqual([
      { id: "root", component: "Column", children: ["b"] },
      { id: "b", component: "Text", text: "B" },
    ]);
  });
});
