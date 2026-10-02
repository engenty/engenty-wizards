import dagre from "@dagrejs/dagre";
import type { Step, WizardDefinition } from "@shared/definition";
import {
  type Edge,
  Handle,
  MarkerType,
  type Node,
  type NodeProps,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from "@xyflow/react";
import { AlertCircle, Minus, Plus, Scan } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { Mascot } from "../../brand";
import { cn } from "../../ui";
import { stepIcon, stepSummary, TYPE_TONE, typeLabel } from "./meta";

const NODE_W = 280;
const NODE_H = 92;

type StepData = {
  step: Step;
  selected: boolean;
  issue: boolean;
  index: number;
  active: boolean;
  /** Just changed from elsewhere (an MCP client). */
  pulse: boolean;
};
type StartData = { title: string; avatar: string; selected: boolean };

function StepNode({ data }: NodeProps<Node<StepData>>) {
  const { step, selected, issue, active, pulse } = data;
  const Icon = stepIcon(step);
  return (
    <div
      className={cn(
        "relative w-[280px] cursor-pointer rounded-xl bg-card px-4 py-3 text-left shadow-soft ring-1 transition",
        selected
          ? "shadow-elevated ring-2 ring-ember"
          : active
            ? "ring-2 ring-moss"
            : pulse
              ? "ring-2 ring-ember/60"
              : "ring-border-soft hover:shadow-elevated",
      )}
    >
      {active ? (
        <span className="-top-1 -right-1 absolute size-3 animate-breathe rounded-full bg-moss" />
      ) : pulse ? (
        <span className="-top-1 -right-1 absolute size-3 animate-breathe rounded-full bg-ember" />
      ) : null}
      <Handle type="target" position={Position.Top} />
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "inline-flex size-6 items-center justify-center rounded-md",
            TYPE_TONE[step.type],
          )}
        >
          <Icon className="size-3.5" />
        </span>
        <span className="font-medium text-[11px] text-ink-3 uppercase tracking-[0.07em]">
          {typeLabel(step)}
        </span>
        {issue ? <AlertCircle className="ml-auto size-4 text-rose" /> : null}
      </div>
      <div className="mt-1.5 truncate font-display font-semibold text-[15px] text-ink">
        {step.title}
      </div>
      <div className="truncate text-[12px] text-ink-3">{stepSummary(step) || " "}</div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

function StartNode({ data }: NodeProps<Node<StartData>>) {
  return (
    <div
      className={cn(
        "flex w-[280px] cursor-pointer items-center gap-3 rounded-full bg-paper-2 py-1.5 pr-5 pl-2 transition",
        data.selected ? "ring-2 ring-ember" : "hover:bg-paper-3",
      )}
    >
      <Mascot kind={data.avatar} size={40} interactive={false} />
      <span className="truncate font-display font-semibold text-[15px]">{data.title}</span>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

const nodeTypes = { step: StepNode, start: StartNode };

function conditionLabel(rule: NonNullable<Step["next"]>[number]): string {
  const v = Array.isArray(rule.when.value)
    ? rule.when.value.join(" / ")
    : String(rule.when.value ?? "");
  switch (rule.when.op) {
    case "equals":
      return `${rule.when.field} = ${v}`;
    case "notEquals":
      return `${rule.when.field} ≠ ${v}`;
    case "in":
      return `${rule.when.field} ∈ ${v}`;
    case "notEmpty":
      return `${rule.when.field} ausgefüllt`;
    case "empty":
      return `${rule.when.field} leer`;
  }
}

function layout(
  def: WizardDefinition,
  selected: string | null,
  issueSteps: Set<string>,
  activeStep: string | null,
  pulse: string[],
) {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "TB", nodesep: 48, ranksep: 46, marginx: 20, marginy: 20 });
  g.setDefaultEdgeLabel(() => ({}));
  g.setNode("__start", { width: NODE_W, height: 52 });
  for (const s of def.steps) {
    g.setNode(s.id, { width: NODE_W, height: NODE_H });
  }
  const edges: Edge[] = [];
  const edgeStyle = {
    markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: "var(--ink-4)" },
  };
  if (def.steps[0]) {
    g.setEdge("__start", def.steps[0].id);
    edges.push({ id: "e-start", source: "__start", target: def.steps[0].id, ...edgeStyle });
  }
  def.steps.forEach((s, i) => {
    const next = def.steps[i + 1];
    for (const [j, rule] of (s.next ?? []).entries()) {
      if (rule.goto === "end" || !def.steps.some((x) => x.id === rule.goto)) {
        continue;
      }
      g.setEdge(s.id, rule.goto);
      edges.push({
        id: `b-${s.id}-${j}`,
        source: s.id,
        target: rule.goto,
        label: conditionLabel(rule),
        labelStyle: { fontSize: 11, fill: "var(--ink-2)" },
        labelBgStyle: { fill: "var(--paper-2)" },
        labelBgPadding: [6, 3],
        labelBgBorderRadius: 8,
        style: { strokeDasharray: "5 4" },
        ...edgeStyle,
      });
    }
    if (next && s.type !== "result") {
      g.setEdge(s.id, next.id);
      edges.push({
        id: `n-${s.id}`,
        source: s.id,
        target: next.id,
        ...(s.next?.length
          ? {
              label: "sonst",
              labelStyle: { fontSize: 11, fill: "var(--ink-3)" },
              labelBgStyle: { fill: "var(--background)" },
            }
          : {}),
        ...edgeStyle,
      });
    }
  });
  dagre.layout(g);
  const nodes: Node[] = [
    {
      id: "__start",
      type: "start",
      position: { x: g.node("__start").x - NODE_W / 2, y: g.node("__start").y - 26 },
      data: { title: def.title, avatar: def.avatar, selected: selected === "__wizard" },
      draggable: false,
    },
    ...def.steps.map((s, index) => {
      const n = g.node(s.id);
      return {
        id: s.id,
        type: "step",
        position: { x: n.x - NODE_W / 2, y: n.y - NODE_H / 2 },
        data: {
          step: s,
          selected: selected === s.id,
          issue: issueSteps.has(s.id),
          index,
          active: activeStep === s.id,
          pulse: pulse.includes(s.id),
        },
        draggable: false,
      } satisfies Node<StepData>;
    }),
  ];
  return { nodes, edges };
}

function ZoomBar() {
  const rf = useReactFlow();
  const btn =
    "inline-flex size-8 items-center justify-center rounded-full text-ink-3 hover:bg-accent hover:text-ink";
  return (
    <div className="absolute bottom-4 left-4 z-10 flex items-center gap-0.5 rounded-full bg-card p-1 shadow-soft ring-1 ring-border-soft">
      <button type="button" className={btn} onClick={() => rf.zoomOut()} aria-label="Zoom out">
        <Minus className="size-4" />
      </button>
      <button
        type="button"
        className={btn}
        onClick={() => rf.fitView({ padding: 0.2, duration: 300 })}
        aria-label="Fit"
      >
        <Scan className="size-4" />
      </button>
      <button type="button" className={btn} onClick={() => rf.zoomIn()} aria-label="Zoom in">
        <Plus className="size-4" />
      </button>
    </div>
  );
}

const MIN_READABLE_ZOOM = 0.8;

function Inner({
  def,
  selected,
  onSelect,
  issueSteps,
  activeStep,
  pulse,
}: {
  def: WizardDefinition;
  selected: string | null;
  onSelect: (id: string | null) => void;
  issueSteps: Set<string>;
  activeStep: string | null;
  pulse?: string[];
}) {
  const { nodes, edges } = useMemo(
    () => layout(def, selected, issueSteps, activeStep, pulse ?? []),
    [def, selected, issueSteps, activeStep, pulse],
  );
  const rf = useReactFlow();
  const wrap = useRef<HTMLDivElement>(null);
  const shape = def.steps.map((s) => s.id).join("|");
  // Re-fit when the flow's shape changes (a step added or removed), not on every edit.
  // A long flow is not shrunk into illegibility: it starts readable at the top and scrolls.
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on the flow's shape
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const el = wrap.current;
      if (!el || !nodes.length) {
        return;
      }
      const xs = nodes.map((n) => n.position.x);
      const ys = nodes.map((n) => n.position.y);
      const bounds = {
        x: Math.min(...xs),
        y: Math.min(...ys),
        width: Math.max(...xs) + NODE_W - Math.min(...xs),
        height: Math.max(...ys) + NODE_H - Math.min(...ys),
      };
      const fit = Math.min(
        el.clientWidth / (bounds.width * 1.2),
        el.clientHeight / (bounds.height * 1.15),
        1,
      );
      const zoom = Math.max(fit, MIN_READABLE_ZOOM);
      const x = (el.clientWidth - bounds.width * zoom) / 2 - bounds.x * zoom;
      const y =
        fit >= MIN_READABLE_ZOOM
          ? (el.clientHeight - bounds.height * zoom) / 2 - bounds.y * zoom
          : 24 - bounds.y * zoom;
      void rf.setViewport({ x, y, zoom }, { duration: 400 });
    });
    return () => cancelAnimationFrame(id);
  }, [shape, rf]);
  return (
    <div ref={wrap} className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeClick={(_, n) => onSelect(n.id === "__start" ? "__wizard" : n.id)}
        onPaneClick={() => onSelect(null)}
        nodesConnectable={false}
        nodesDraggable={false}
        elementsSelectable={false}
        panOnScroll
        zoomOnScroll={false}
        zoomOnPinch
        minZoom={0.3}
        maxZoom={1.4}
        proOptions={{ hideAttribution: true }}
      >
        <ZoomBar />
      </ReactFlow>
    </div>
  );
}

export function FlowDiagram(props: {
  def: WizardDefinition;
  selected: string | null;
  onSelect: (id: string | null) => void;
  issueSteps: Set<string>;
  activeStep: string | null;
  pulse?: string[];
}) {
  return (
    <ReactFlowProvider>
      <Inner {...props} />
    </ReactFlowProvider>
  );
}
