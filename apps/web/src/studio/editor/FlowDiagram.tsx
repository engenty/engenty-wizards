import dagre from "@dagrejs/dagre";
import type { Step, WizardDefinition } from "@engenty-wizards/shared/definition";
import type { RunEstimate } from "@engenty-wizards/shared/run";
import {
  BaseEdge,
  type Edge,
  type EdgeProps,
  getBezierPath,
  Handle,
  MarkerType,
  type Node,
  type NodeProps,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from "@xyflow/react";
import { AlertCircle, Check, Minus, Plus, Scan } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { Mascot } from "../../brand";
import { t } from "../../lib/i18n";
import { cn } from "../../ui";
import { useEstimate } from "./estimate";
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
  /** What the step is expected to cost, in credits. */
  cost: number | null;
  /** A run went through it already. */
  passed: boolean;
};
type StartData = { title: string; avatar: string; selected: boolean };

function StepNode({ data }: NodeProps<Node<StepData>>) {
  const { step, selected, issue, active, pulse, cost, passed } = data;
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
        <span className="font-medium text-[0.6875rem] text-ink-3 uppercase tracking-[0.07em]">
          {typeLabel(step)}
        </span>
        {issue ? (
          <AlertCircle className="ml-auto size-4 text-rose" />
        ) : passed && !active ? (
          <Check className="ml-auto size-4 text-moss" />
        ) : cost !== null ? (
          <span className="ml-auto text-[0.6875rem] text-ink-3 tabular-nums">
            ≈{" "}
            {cost < 10
              ? cost.toLocaleString(undefined, { maximumFractionDigits: 1 })
              : Math.round(cost)}{" "}
            cr
          </span>
        ) : null}
      </div>
      <div className="mt-1.5 truncate font-display font-semibold text-[0.9375rem] text-ink">
        {step.title}
      </div>
      <div className="truncate text-[0.75rem] text-ink-3">{stepSummary(step) || " "}</div>
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
      <span className="truncate font-display font-semibold text-[0.9375rem]">{data.title}</span>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

type Point = { x: number; y: number };
type BranchData = { points: Point[]; labelX: number; labelY: number };

/**
 * A branch that skips steps, drawn where the layout routed it: beside the steps it passes, with
 * its condition on the line. A straight line between the two steps would run behind them.
 */
function BranchEdge(props: EdgeProps<Edge<BranchData>>) {
  const { data, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition } = props;
  const text = {
    label: props.label,
    labelStyle: props.labelStyle,
    labelBgStyle: props.labelBgStyle,
    labelBgPadding: props.labelBgPadding,
    labelBgBorderRadius: props.labelBgBorderRadius,
    style: props.style,
    markerEnd: props.markerEnd,
  };
  if (!data?.points.length) {
    const [path, labelX, labelY] = getBezierPath({
      sourceX,
      sourceY,
      targetX,
      targetY,
      sourcePosition,
      targetPosition,
    });
    return <BaseEdge path={path} labelX={labelX} labelY={labelY} {...text} />;
  }
  // From the step's handle through the layout's points to the next handle; each stretch leaves
  // and arrives vertically, like the other lines.
  const stops = [{ x: sourceX, y: sourceY }, ...data.points, { x: targetX, y: targetY }];
  const path = stops
    .map((to, i) => {
      const from = stops[i - 1];
      if (!from) {
        return `M ${to.x} ${to.y}`;
      }
      const mid = (from.y + to.y) / 2;
      return `C ${from.x} ${mid} ${to.x} ${mid} ${to.x} ${to.y}`;
    })
    .join(" ");
  return <BaseEdge path={path} labelX={data.labelX} labelY={data.labelY} {...text} />;
}

const nodeTypes = { step: StepNode, start: StartNode };
const edgeTypes = { branch: BranchEdge };
/** A condition longer than this is cut on the line; the step's settings show it whole. */
const BRANCH_LABEL = 34;
const NO_COSTS: RunEstimate["steps"] = {};

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
      return t("editor.whenFilled", { field: rule.when.field });
    case "empty":
      return t("editor.whenEmpty", { field: rule.when.field });
  }
}

function layout(
  def: WizardDefinition,
  selected: string | null,
  issueSteps: ReadonlySet<string>,
  activeStep: string | null,
  pulse: string[],
  costs: RunEstimate["steps"],
  passed: ReadonlySet<string>,
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
    // One line per step a branch leads to, with all its conditions on it.
    const branches = new Map<string, string[]>();
    for (const rule of s.next ?? []) {
      if (rule.goto === "end" || !def.steps.some((x) => x.id === rule.goto)) {
        continue;
      }
      branches.set(rule.goto, [...(branches.get(rule.goto) ?? []), conditionLabel(rule)]);
    }
    for (const [goto, conditions] of branches) {
      const all = conditions.join(" · ");
      const label = all.length > BRANCH_LABEL ? `${all.slice(0, BRANCH_LABEL - 1)}…` : all;
      // The layout keeps room for the label, so the steps beside the line stand clear of it.
      g.setEdge(s.id, goto, { width: label.length * 6.2 + 16, height: 22, labelpos: "c" });
      edges.push({
        id: `b-${s.id}-${goto}`,
        type: "branch",
        source: s.id,
        target: goto,
        label,
        labelStyle: { fontSize: 11, fill: "var(--ink-2)" },
        labelBgStyle: { fill: "var(--paper-2)" },
        labelBgPadding: [6, 3],
        labelBgBorderRadius: 8,
        style: { strokeDasharray: "5 4" },
        ...edgeStyle,
      });
    }
    if (next && s.type !== "result") {
      if (!g.hasEdge(s.id, next.id)) {
        g.setEdge(s.id, next.id);
      }
      edges.push({
        id: `n-${s.id}`,
        source: s.id,
        target: next.id,
        ...(s.next?.length
          ? {
              label: t("editor.otherwise"),
              labelStyle: { fontSize: 11, fill: "var(--ink-3)" },
              labelBgStyle: { fill: "var(--background)" },
            }
          : {}),
        ...edgeStyle,
      });
    }
  });
  dagre.layout(g);
  for (const edge of edges) {
    if (edge.type !== "branch") {
      continue;
    }
    const route = g.edge(edge.source, edge.target) as { points?: Point[]; x?: number; y?: number };
    // Without the first and the last point: those are on the steps' borders, the line starts
    // and ends at their handles.
    const points = (route.points ?? []).slice(1, -1);
    if (points.length && route.x !== undefined && route.y !== undefined) {
      edge.data = { points, labelX: route.x, labelY: route.y } satisfies BranchData;
    }
  }
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
          cost: costs[s.id]?.credits ?? null,
          passed: passed.has(s.id),
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
const NONE: ReadonlySet<string> = new Set();

interface CanvasProps {
  def: WizardDefinition;
  selected: string | null;
  onSelect: (id: string | null) => void;
  issueSteps: ReadonlySet<string>;
  activeStep: string | null;
  pulse?: string[];
  costs?: RunEstimate["steps"];
  /** Steps a run went through. */
  passed?: ReadonlySet<string>;
  /** How far the first fit may shrink the flow; the studio keeps it readable and scrolls. */
  minFitZoom?: number;
  /** Fit again when this changes (the frame got larger), besides the flow's shape. */
  fitKey?: string;
}

function Inner({
  def,
  selected,
  onSelect,
  issueSteps,
  activeStep,
  pulse,
  costs = NO_COSTS,
  passed = NONE,
  minFitZoom = MIN_READABLE_ZOOM,
  fitKey,
}: CanvasProps) {
  const { nodes, edges } = useMemo(
    () => layout(def, selected, issueSteps, activeStep, pulse ?? [], costs, passed),
    [def, selected, issueSteps, activeStep, pulse, costs, passed],
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
      const zoom = Math.max(fit, minFitZoom);
      const x = (el.clientWidth - bounds.width * zoom) / 2 - bounds.x * zoom;
      const y =
        fit >= minFitZoom
          ? (el.clientHeight - bounds.height * zoom) / 2 - bounds.y * zoom
          : 24 - bounds.y * zoom;
      void rf.setViewport({ x, y, zoom }, { duration: 400 });
    });
    return () => cancelAnimationFrame(id);
  }, [shape, fitKey, rf]);
  return (
    <div ref={wrap} className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
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

/** The flow without the studio around it: the flow widget in AI apps draws it too. */
export function FlowCanvas(props: CanvasProps) {
  return (
    <ReactFlowProvider>
      <Inner {...props} />
    </ReactFlowProvider>
  );
}

/** The studio's flow, with what each step is expected to cost. */
export function FlowDiagram({ wizardId, ...props }: CanvasProps & { wizardId: string }) {
  const estimate = useEstimate(wizardId, props.def);
  return (
    <FlowCanvas {...props} costs={estimate.data?.available ? estimate.data.steps : NO_COSTS} />
  );
}
