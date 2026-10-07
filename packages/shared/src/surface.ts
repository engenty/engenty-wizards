import { z } from "zod";

/**
 * Surfaces: views composed from a small catalog of native components, bound to a run's data and
 * rendered by the runner itself — themed, on phones, no iframe and nothing to pay per run. A
 * surface is data, not code: only catalog components render, so it needs no sandbox. Between the
 * plain table a review shows and a widget, which is free HTML. As engenty-pro's A2UI catalog
 * (`engenty:core/v1`), kept to what a wizard's result needs.
 *
 * A surface is a flat list of components with ids; the one with id "root" is drawn, containers
 * name their children by id. A prop may be a literal or `{ "path": "/json/pointer" }` into the
 * surface's data. A `List` or `Table` repeats over an array: inside a repeated row, a path
 * without a leading slash reads the row ("name"), one with a slash the whole data.
 */

export const SURFACE_COMPONENTS = [
  "Column",
  "Text",
  "List",
  "Row",
  "DetailGrid",
  "Badge",
  "Grid",
  "Metric",
  "Table",
  "Image",
  "BarChart",
  "LineChart",
  "DonutChart",
  "Actions",
  "Button",
] as const;
export type SurfaceComponentName = (typeof SURFACE_COMPONENTS)[number];

/** Components that hold others by id. */
const CONTAINERS: ReadonlySet<string> = new Set(["Column", "List", "Grid", "Actions"]);

/** The props each component needs. */
const REQUIRED: Partial<Record<SurfaceComponentName, string[]>> = {
  Text: ["text"],
  Row: ["title"],
  DetailGrid: ["rows"],
  Badge: ["label"],
  Metric: ["label", "value"],
  Table: ["rows"],
  Image: ["src"],
  BarChart: ["points"],
  LineChart: ["points"],
  DonutChart: ["slices"],
  Button: ["label", "action"],
};

export const SURFACE_ACTIONS = ["regenerate", "open"] as const;

const id = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,40}$/, "ids are letters, digits, _ and -");

/** One component: its id, its kind, its children (ids, or a template repeated over an array). */
export const surfaceComponentSchema = z.looseObject({
  id,
  component: z.enum(SURFACE_COMPONENTS),
  children: z
    .union([z.array(z.string()), z.object({ path: z.string(), componentId: z.string() })])
    .optional(),
});
export type SurfaceComponent = z.infer<typeof surfaceComponentSchema>;

export const surfaceComponentsSchema = z.array(surfaceComponentSchema).min(1).max(200);

/** What a run shows: the components and the data they are bound to. */
export interface Surface {
  components: SurfaceComponent[];
  data: Record<string, unknown>;
}

export interface SurfaceIssue {
  message: string;
}

const isPath = (v: unknown): v is { path: string } =>
  Boolean(v && typeof v === "object" && !Array.isArray(v) && typeof (v as any).path === "string");

/** Every `{ path }` in a component's props, with whether it reads a repeated row. */
function pathsOf(c: SurfaceComponent): string[] {
  const out: string[] = [];
  const walk = (v: unknown) => {
    if (isPath(v)) {
      out.push(v.path);
    } else if (Array.isArray(v)) {
      v.forEach(walk);
    } else if (v && typeof v === "object") {
      Object.values(v).forEach(walk);
    }
  };
  for (const [key, value] of Object.entries(c)) {
    if (key !== "id" && key !== "component") {
      walk(
        key === "children" && !Array.isArray(value) && isPath(value) ? { path: value.path } : value,
      );
    }
  }
  return out;
}

/**
 * What can be wrong with a surface: an unknown or missing component, no root, a child that is
 * not there, an id twice, a loop, a prop missing, and — given the data keys a run will provide —
 * an absolute path into data nothing provides.
 */
export function validateSurface(raw: unknown, dataKeys?: string[]): SurfaceIssue[] {
  const parsed = surfaceComponentsSchema.safeParse(raw);
  if (!parsed.success) {
    return parsed.error.issues.map((i) => ({ message: `${i.path.join(".")}: ${i.message}` }));
  }
  const components = parsed.data;
  const issues: SurfaceIssue[] = [];
  const byId = new Map<string, SurfaceComponent>();
  for (const c of components) {
    if (byId.has(c.id)) {
      issues.push({ message: `Duplicate component id "${c.id}".` });
    }
    byId.set(c.id, c);
  }
  if (!byId.has("root")) {
    issues.push({ message: 'A surface has a component with id "root".' });
  }
  for (const c of components) {
    for (const prop of REQUIRED[c.component] ?? []) {
      if ((c as Record<string, unknown>)[prop] === undefined) {
        issues.push({ message: `${c.component} "${c.id}" needs "${prop}".` });
      }
    }
    const action = (c as Record<string, unknown>).action;
    if (action !== undefined && !(SURFACE_ACTIONS as readonly unknown[]).includes(action)) {
      issues.push({
        message: `"${c.id}": action is one of ${SURFACE_ACTIONS.join(", ")}.`,
      });
    }
    const children = c.children;
    if (children && !CONTAINERS.has(c.component) && c.component !== "Table") {
      issues.push({ message: `${c.component} "${c.id}" holds no children.` });
    }
    const ids = Array.isArray(children) ? children : children ? [children.componentId] : [];
    for (const child of ids) {
      if (!byId.has(child)) {
        issues.push({ message: `"${c.id}" names a child "${child}" that is not there.` });
      }
    }
    if (dataKeys) {
      for (const path of pathsOf(c)) {
        const key = path.startsWith("/") ? path.split("/")[1] : null;
        if (key !== null && !dataKeys.includes(key)) {
          issues.push({ message: `"${c.id}" reads "${path}", which no data provides.` });
        }
      }
    }
  }
  // A child that holds its parent would draw forever.
  const seen = new Set<string>();
  const loops = (cid: string, stack: Set<string>): boolean => {
    if (stack.has(cid)) {
      return true;
    }
    if (seen.has(cid)) {
      return false;
    }
    seen.add(cid);
    const c = byId.get(cid);
    const kids = Array.isArray(c?.children)
      ? c.children
      : c?.children
        ? [c.children.componentId]
        : [];
    const next = new Set(stack).add(cid);
    return kids.some((k) => loops(k, next));
  };
  if (byId.has("root") && loops("root", new Set())) {
    issues.push({ message: "Components hold each other in a loop." });
  }
  return issues;
}

/** A JSON pointer into data: "/suppliers/0/name". */
export function pointer(data: unknown, path: string): unknown {
  let at: unknown = data;
  for (const part of path.split("/").slice(1)) {
    if (at === null || typeof at !== "object") {
      return undefined;
    }
    at = (at as Record<string, unknown>)[part.replace(/~1/g, "/").replace(/~0/g, "~")];
  }
  return at;
}

/**
 * A prop's value: a literal as it is, a path read from the data — or, without a leading slash,
 * from the row a List or Table repeats over.
 */
export function bound(value: unknown, data: unknown, row?: unknown): unknown {
  if (!isPath(value)) {
    return value;
  }
  if (value.path.startsWith("/")) {
    return pointer(data, value.path);
  }
  return row === undefined ? undefined : pointer(row, `/${value.path.replace(/\./g, "/")}`);
}

/** What a model needs to compose a surface: the catalog, briefly. */
export const SURFACE_GUIDE = `A surface is a flat JSON array of components; the one with id "root" is drawn. Containers list their children by id.
Components and props (a prop may be a literal or {"path": "/key/..."} into the data):
- Column { children: [ids] } — vertical stack (use for root)
- Text { text, variant?: "h3"|"h4"|"body"|"muted" }
- List { children: {"path": "/rows", "componentId": "<a Row id>"} } — one Row per array entry; inside, paths without "/" read the entry ("name")
- Row { title, subtitle?, meta?, badge?, image? }
- DetailGrid { rows: [{ label, value }] } — label/value facts
- Badge { label, tone?: "default"|"success"|"warning" }
- Grid { children: [ids], columns?: 2|3|4 } — tiles side by side
- Metric { label, value, caption? } — a key figure
- Table { rows: {"path": "/rows"}, columns?: [{ key, label }] }
- Image { src: an asset id or {"path": ...}, alt? }
- BarChart / LineChart { title?, points: [{ label, value }] or {"path": ...}, labelKey?, valueKey? }
- DonutChart { title?, slices: [{ label, value }] or {"path": ...}, labelKey?, valueKey? }
  (labelKey / valueKey: the columns of bound rows that hold the label and the number, e.g. "name", "price")
- Actions { children: [Button ids] } / Button { label, action: "regenerate"|"open" }
Keep it small: what the person needs to see first, then the details. Never invent numbers: bind them by path.`;
