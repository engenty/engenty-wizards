import type { Step } from "@shared/definition";
import {
  AppWindow,
  Bot,
  Eye,
  FileText,
  Flag,
  Image,
  LayoutDashboard,
  ListChecks,
  Video,
  Wand2,
} from "lucide-react";
import { t } from "../../lib/i18n";

export function stepIcon(step: Step) {
  switch (step.type) {
    case "page":
      return ListChecks;
    case "agent":
      return Bot;
    case "generate":
      return step.asset === "image"
        ? Image
        : step.asset === "video"
          ? Video
          : step.asset === "dashboard"
            ? LayoutDashboard
            : FileText;
    case "widget":
      return AppWindow;
    case "review":
      return Eye;
    case "result":
      return Flag;
  }
  return Wand2;
}

export const TYPE_TONE: Record<Step["type"], string> = {
  page: "bg-cobalt-tint text-cobalt",
  agent: "bg-ember-tint text-ember-strong",
  generate: "bg-amber-tint text-ink-2",
  widget: "bg-ember-veil text-ember-strong",
  review: "bg-moss-tint text-moss",
  result: "bg-paper-2 text-ink-2",
};

export function typeLabel(step: Step): string {
  return t(`type.${step.type}` as "type.page");
}

const TOOL_LABEL: Record<string, string> = {
  web_search: "Websuche",
  web_fetch: "Webseiten lesen",
  browser: "Browser",
  sandbox: "Code & Shell",
  image: "Bilder",
  http: "API",
};

export function toolLabel(id: string) {
  return TOOL_LABEL[id] ?? id;
}

/** One line under a node's title: what the step asks or does. */
export function stepSummary(step: Step): string {
  switch (step.type) {
    case "page":
      return step.fields.map((f) => f.label).join(" · ");
    case "agent": {
      const tools = step.tools.map(toolLabel);
      const mcp = step.mcp?.length ? [`MCP: ${step.mcp.join(", ")}`] : [];
      return [...tools, ...mcp].join(" · ") || step.instructions.slice(0, 90);
    }
    case "generate": {
      const parts: string[] = [step.asset];
      if (step.options?.aspectRatio) {
        parts.push(step.options.aspectRatio);
      }
      if (step.options?.duration) {
        parts.push(`${step.options.duration}s`);
      }
      if (step.options?.template) {
        parts.push(step.options.template);
      }
      return parts.join(" · ");
    }
    case "widget":
      return [step.entry, Object.keys(step.data).join(", ")].filter(Boolean).join(" · ");
    case "review":
      return [step.edit ? "bearbeitbar" : null, step.regenerate ? "neu erstellbar" : null]
        .filter(Boolean)
        .join(" · ");
    case "result":
      return step.deliverables
        .map((d) => `${d.label ?? d.from} (${d.formats.join(", ")})`)
        .join(" · ");
  }
  return "";
}
