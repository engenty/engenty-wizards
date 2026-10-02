import { z } from "zod";
import { tableColumnsSchema } from "./engenty/data-tables/index.js";
import { CONNECTION_KINDS } from "./store.js";

/** The engenty avatars a wizard can wear. Same cast as engenty's ui-core. */
export const ENGENTY_KINDS = [
  "round",
  "drop",
  "dome",
  "flame",
  "oval",
  "bean",
  "pebble",
  "sprout",
  "tower",
  "wedge",
] as const;
export type EngentyKind = (typeof ENGENTY_KINDS)[number];

export const FIELD_KINDS = [
  "text",
  "textarea",
  "number",
  "select",
  "multiselect",
  "date",
  "email",
  "url",
  "toggle",
  "color",
  "image",
  "file",
  "items",
  "connection",
  "list",
] as const;
export type FieldKind = (typeof FIELD_KINDS)[number];

export const TOOL_IDS = ["web_search", "web_fetch", "browser", "sandbox", "image", "http"] as const;
export type ToolId = (typeof TOOL_IDS)[number];

export const ASSET_KINDS = ["image", "video", "document", "dashboard"] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

export const FORMATS = [
  "png",
  "mp4",
  "pdf",
  "docx",
  "html",
  "md",
  "txt",
  "csv",
  "xlsx",
  "json",
  "zip",
] as const;
export type Format = (typeof FORMATS)[number];

export const ASPECT_RATIOS = ["1:1", "16:9", "9:16", "4:5", "3:2", "2:3"] as const;

const id = z
  .string()
  .regex(/^[a-zA-Z][a-zA-Z0-9_]{0,40}$/, "ids are letters, digits and _ and start with a letter");

export const itemColumnSchema = z.object({
  id,
  label: z.string().min(1),
  kind: z.enum(["text", "number", "money"]),
});

export const fieldSchema = z.object({
  id,
  label: z.string().min(1),
  kind: z.enum(FIELD_KINDS),
  required: z.boolean().optional(),
  placeholder: z.string().optional(),
  help: z.string().optional(),
  /** Choices for select / multiselect. */
  options: z.array(z.string()).optional(),
  default: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]).optional(),
  /** Line-item columns for `items`. A row's amount is the product of its number and money columns. */
  columns: z.array(itemColumnSchema).optional(),
  /** VAT for `items`: a fixed rate in percent, or the id of a number/select field holding it. */
  vat: z.object({ rate: z.number().optional(), field: z.string().optional() }).optional(),
  currency: z.string().optional(),
  /** image / file: several files; the value is then a list. */
  multiple: z.boolean().optional(),
  /** file: also offer the camera, for documents the person only has on paper. Images always offer it. */
  camera: z.boolean().optional(),
  /** connection: id of the wizard connection the person connects here. */
  connection: z.string().optional(),
  /** list: id of the wizard list shown here for the person to check and correct. */
  list: z.string().optional(),
});
export type Field = z.infer<typeof fieldSchema>;

export const nextRuleSchema = z.object({
  when: z.object({
    field: z.string(),
    op: z.enum(["equals", "notEquals", "in", "notEmpty", "empty"]),
    value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]).optional(),
  }),
  /** A step id, or "end". */
  goto: z.string(),
});
export type NextRule = z.infer<typeof nextRuleSchema>;

const stepBase = {
  id,
  title: z.string().min(1),
  description: z.string().optional(),
  next: z.array(nextRuleSchema).optional(),
};

export const outputFieldSchema = z.object({
  id,
  kind: z.enum(["text", "number", "list", "table"]),
  description: z.string().optional(),
  /** Table only: the exact column keys every row has — what a widget reads. */
  columns: z.array(z.string().min(1)).optional(),
});

export const pageStepSchema = z.object({
  ...stepBase,
  type: z.literal("page"),
  fields: z.array(fieldSchema).min(1),
  cta: z.string().optional(),
});

export const agentStepSchema = z.object({
  ...stepBase,
  type: z.literal("agent"),
  /** What the agent does. A template: {{field}}, {{steps.id}}, {{brand.name}}. */
  instructions: z.string().min(1),
  tools: z.array(z.enum(TOOL_IDS)).default([]),
  /** Ids of project MCP servers this step may use. */
  mcp: z.array(z.string()).optional(),
  /** Ids of wizard connections (the person's accounts) this step may use. */
  connections: z.array(z.string()).optional(),
  output: z
    .object({
      format: z.enum(["text", "markdown", "json"]),
      fields: z.array(outputFieldSchema).optional(),
    })
    .default({ format: "markdown" }),
  model: z.enum(["fast", "smart"]).optional(),
  /** Shown to the person while it works. */
  working: z.string().optional(),
});

export const generateStepSchema = z.object({
  ...stepBase,
  type: z.literal("generate"),
  asset: z.enum(ASSET_KINDS),
  /** For image/video the visual prompt; for document/dashboard the brief. A template. */
  prompt: z.string().min(1),
  options: z
    .object({
      aspectRatio: z.enum(ASPECT_RATIOS).optional(),
      /** Video length in seconds. */
      duration: z.number().optional(),
      style: z.string().optional(),
      /** Document flavour, steers the layout. */
      template: z.enum(["invoice", "offer", "briefing", "letter", "report", "free"]).optional(),
    })
    .optional(),
  /** An image field whose upload the image/video model starts from. */
  referenceImage: z.string().optional(),
  working: z.string().optional(),
});

export const widgetStepSchema = z.object({
  ...stepBase,
  type: z.literal("widget"),
  /** Workspace path of the widget's HTML. Written once; every run only brings new data. */
  entry: z.string().min(1),
  /** What the widget gets as `wizard.data`: key → a field id, steps.id, steps.id.key, brand.name or today. */
  data: z.record(z.string(), z.string()).default({}),
  /** Workspace path of example data (JSON) for previews before any run. */
  sample: z.string().optional(),
  /** The size the widget is designed for; previews scale it, PNG/PDF/MP4 render at it. */
  size: z
    .object({
      width: z.number().int().min(200).max(3840),
      height: z.number().int().min(200).max(3840),
    })
    .optional(),
  working: z.string().optional(),
});

export const reviewStepSchema = z.object({
  ...stepBase,
  type: z.literal("review"),
  /** Step ids whose output is shown. */
  show: z.array(z.string()).min(1),
  edit: z.boolean().optional(),
  regenerate: z.boolean().optional(),
});

export const deliverableSchema = z.object({
  from: z.string(),
  label: z.string().optional(),
  formats: z.array(z.enum(FORMATS)).min(1),
});

export const resultStepSchema = z.object({
  ...stepBase,
  type: z.literal("result"),
  message: z.string().optional(),
  deliverables: z.array(deliverableSchema),
});

export const stepSchema = z.discriminatedUnion("type", [
  pageStepSchema,
  agentStepSchema,
  generateStepSchema,
  widgetStepSchema,
  reviewStepSchema,
  resultStepSchema,
]);
export type Step = z.infer<typeof stepSchema>;
export type PageStep = z.infer<typeof pageStepSchema>;
export type AgentStep = z.infer<typeof agentStepSchema>;
export type GenerateStep = z.infer<typeof generateStepSchema>;
export type WidgetStep = z.infer<typeof widgetStepSchema>;
export type ReviewStep = z.infer<typeof reviewStepSchema>;
export type ResultStep = z.infer<typeof resultStepSchema>;
export type StepType = Step["type"];

export const listSchema = z.object({
  id,
  title: z.string().min(1),
  description: z.string().optional(),
  /** engenty data-table columns: `{ id, name, type, format }`. */
  columns: tableColumnsSchema,
  /** Column that identifies a row; saving a row with a known key updates it. */
  key: z.string().optional(),
});

export const connectionSchema = z.object({
  id,
  /** A built-in kind of account … */
  kind: z.enum(CONNECTION_KINDS).optional(),
  /** … or the id of one of the project's imported connectors. */
  connector: z.string().optional(),
  /** Imported connectors: the actions steps may call. Default: every action that only reads. */
  actions: z.array(z.string()).max(200).optional(),
  /** Imported connectors, per action: "allow" runs it without asking, "ask" asks the person first. */
  policy: z.record(z.string(), z.enum(["allow", "ask"])).optional(),
  title: z.string().optional(),
  description: z.string().optional(),
});

export const wizardSchema = z.object({
  version: z.literal(1).default(1),
  title: z.string().min(1),
  description: z.string().default(""),
  avatar: z.enum(ENGENTY_KINDS).default("round"),
  /** Shown on the first page above the first question. */
  intro: z.string().optional(),
  /** Tabular data the wizard keeps between runs, per person. */
  lists: z.array(listSchema).max(12).optional(),
  /** Accounts the person connects; kept between runs, per person. */
  connections: z.array(connectionSchema).max(6).optional(),
  steps: z.array(stepSchema).min(1),
});
export type WizardDefinition = z.infer<typeof wizardSchema>;

export const INTERACTIVE: ReadonlySet<StepType> = new Set(["page", "review", "result"]);

export function isInteractive(step: Step): boolean {
  return INTERACTIVE.has(step.type);
}

/** Which formats each producing step can be downloaded in. */
export function formatsFor(step: Step): Format[] {
  if (step.type === "generate") {
    switch (step.asset) {
      case "image":
        return ["png"];
      case "video":
        return ["mp4"];
      case "document":
        return ["pdf", "docx", "html", "md", "png"];
      case "dashboard":
        return ["html", "pdf", "png"];
    }
  }
  if (step.type === "widget") {
    return ["html", "png", "pdf", "mp4", "json"];
  }
  if (step.type === "agent") {
    if (step.output.format === "json") {
      return ["json", "csv", "xlsx", "md", "zip"];
    }
    return ["md", "txt", "docx", "pdf", "html", "zip"];
  }
  return [];
}

/** Formats a stored list can be downloaded in. */
export const LIST_FORMATS: Format[] = ["xlsx", "csv", "json", "md"];

const LIST_REF = /^lists\.([a-zA-Z][a-zA-Z0-9_]*)$/;

/** "lists.providers" → "providers"; anything else → null. */
export function listRef(ref: string): string | null {
  return ref.match(LIST_REF)?.[1] ?? null;
}

export const DEFAULT_WIDGET_SIZE = { width: 1280, height: 720 };

export function widgetSize(step: WidgetStep) {
  return step.size ?? DEFAULT_WIDGET_SIZE;
}

/** A widget data reference without braces: "{{steps.x}}" and "steps.x" mean the same. */
export function dataRef(raw: string): string {
  return raw
    .trim()
    .replace(/^\{\{\s*/, "")
    .replace(/\s*\}\}$/, "");
}

export interface ValidationIssue {
  stepId?: string;
  message: string;
}

const TEMPLATE_RE = /\{\{\s*([^}]+?)\s*\}\}/g;

export function templateRefs(template: string): string[] {
  return [...template.matchAll(TEMPLATE_RE)].map((m) => m[1]);
}

/**
 * Structural checks the schema cannot express: ids, references between steps,
 * templates naming things that exist by the time the step runs.
 */
export function validateWizard(def: WizardDefinition, files?: string[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const stepIds = new Set<string>();
  const fieldIds = new Set<string>();
  const seenSteps = new Set<string>();
  const seenFields = new Set<string>();
  const listIds = new Set<string>();
  const connectionIds = new Set<string>();

  for (const list of def.lists ?? []) {
    if (listIds.has(list.id)) {
      issues.push({ message: `Duplicate list id "${list.id}".` });
    }
    listIds.add(list.id);
    if (list.key && !list.columns.some((c) => c.id === list.key)) {
      issues.push({ message: `List "${list.id}": key "${list.key}" is not one of its columns.` });
    }
  }
  for (const connection of def.connections ?? []) {
    if (connectionIds.has(connection.id)) {
      issues.push({ message: `Duplicate connection id "${connection.id}".` });
    }
    connectionIds.add(connection.id);
    if (Boolean(connection.kind) === Boolean(connection.connector)) {
      issues.push({
        message: `Connection "${connection.id}" needs either "kind" or "connector", not both.`,
      });
    }
  }

  for (const step of def.steps) {
    if (stepIds.has(step.id)) {
      issues.push({ stepId: step.id, message: `Duplicate step id "${step.id}".` });
    }
    stepIds.add(step.id);
    if (step.type === "page") {
      for (const field of step.fields) {
        if (fieldIds.has(field.id)) {
          issues.push({ stepId: step.id, message: `Duplicate field id "${field.id}".` });
        }
        fieldIds.add(field.id);
        if ((field.kind === "select" || field.kind === "multiselect") && !field.options?.length) {
          issues.push({ stepId: step.id, message: `Field "${field.id}" needs options.` });
        }
        if (field.kind === "items" && !field.columns?.length) {
          issues.push({ stepId: step.id, message: `Field "${field.id}" needs columns.` });
        }
        if (field.kind === "connection" && !connectionIds.has(field.connection ?? "")) {
          issues.push({
            stepId: step.id,
            message: `Field "${field.id}" needs "connection": the id of one of the wizard's connections.`,
          });
        }
        if (field.kind === "list" && !listIds.has(field.list ?? "")) {
          issues.push({
            stepId: step.id,
            message: `Field "${field.id}" needs "list": the id of one of the wizard's lists.`,
          });
        }
      }
    }
  }

  const last = def.steps.at(-1);
  if (last?.type !== "result") {
    issues.push({ message: "The last step must be a result step." });
  }

  const checkTemplate = (step: Step, template: string) => {
    for (const ref of templateRefs(template)) {
      const [head, second] = ref.split(".");
      if (head === "steps") {
        if (!second || !seenSteps.has(second)) {
          issues.push({
            stepId: step.id,
            message: `"{{${ref}}}" refers to a step that has not run before "${step.id}".`,
          });
        }
      } else if (head === "brand" || head === "today" || head === "notes") {
        // provided by the runner
      } else if (head === "lists") {
        if (!second || !listIds.has(second)) {
          issues.push({ stepId: step.id, message: `"{{${ref}}}" refers to an unknown list.` });
        }
      } else if (!seenFields.has(head)) {
        issues.push({
          stepId: step.id,
          message: `"{{${ref}}}" refers to a field that is not asked before "${step.id}".`,
        });
      }
    }
  };

  for (const step of def.steps) {
    switch (step.type) {
      case "page":
        for (const field of step.fields) {
          seenFields.add(field.id);
        }
        break;
      case "agent":
        checkTemplate(step, step.instructions);
        for (const c of step.connections ?? []) {
          if (!connectionIds.has(c)) {
            issues.push({ stepId: step.id, message: `Step uses unknown connection "${c}".` });
          }
        }
        break;
      case "generate":
        checkTemplate(step, step.prompt);
        if (step.referenceImage && !seenFields.has(step.referenceImage)) {
          issues.push({
            stepId: step.id,
            message: `referenceImage "${step.referenceImage}" is not an earlier field.`,
          });
        }
        break;
      case "widget":
        for (const [key, ref] of Object.entries(step.data)) {
          if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
            issues.push({
              stepId: step.id,
              message: `Widget data key "${key}" is not an identifier.`,
            });
          }
          checkTemplate(step, `{{${dataRef(ref)}}}`);
        }
        if (files && !files.includes(step.entry)) {
          issues.push({
            stepId: step.id,
            message: `Widget entry "${step.entry}" is not in the workspace.`,
          });
        }
        if (files && step.sample && !files.includes(step.sample)) {
          issues.push({
            stepId: step.id,
            message: `Widget sample "${step.sample}" is not in the workspace.`,
          });
        }
        break;
      case "review":
        for (const ref of step.show) {
          const list = listRef(ref);
          if (list ? !listIds.has(list) : !seenSteps.has(ref)) {
            issues.push({
              stepId: step.id,
              message: `Review shows unknown ${list ? "list" : "step"} "${ref}".`,
            });
          }
        }
        break;
      case "result":
        for (const d of step.deliverables) {
          const list = listRef(d.from);
          if (list ? !listIds.has(list) : !seenSteps.has(d.from)) {
            issues.push({
              stepId: step.id,
              message: `Deliverable from unknown ${list ? "list" : "step"} "${d.from}".`,
            });
          }
        }
        break;
    }
    for (const rule of step.next ?? []) {
      if (rule.goto !== "end" && !stepIds.has(rule.goto)) {
        issues.push({ stepId: step.id, message: `Branch goes to unknown step "${rule.goto}".` });
      }
      if (!fieldIds.has(rule.when.field)) {
        issues.push({
          stepId: step.id,
          message: `Branch reads unknown field "${rule.when.field}".`,
        });
      }
    }
    seenSteps.add(step.id);
  }
  return issues;
}

/** Parse + validate in one go. */
export function parseWizard(
  input: unknown,
  files?: string[],
):
  | { ok: true; wizard: WizardDefinition; issues: ValidationIssue[] }
  | { ok: false; issues: ValidationIssue[] } {
  const parsed = wizardSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((i) => ({ message: `${i.path.join(".")}: ${i.message}` })),
    };
  }
  const issues = validateWizard(parsed.data, files);
  return { ok: true, wizard: parsed.data, issues };
}

/** The step after `step`, honouring its branch rules. `null` = the end. */
export function nextStepId(
  def: WizardDefinition,
  stepId: string,
  values: Record<string, unknown>,
): string | null {
  const index = def.steps.findIndex((s) => s.id === stepId);
  const step = def.steps[index];
  if (!step) {
    return null;
  }
  for (const rule of step.next ?? []) {
    if (matches(rule, values)) {
      return rule.goto === "end" ? null : rule.goto;
    }
  }
  return def.steps[index + 1]?.id ?? null;
}

function isEmptyValue(v: unknown): boolean {
  return v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
}

function matches(rule: NextRule, values: Record<string, unknown>): boolean {
  const v = values[rule.when.field];
  switch (rule.when.op) {
    case "empty":
      return isEmptyValue(v);
    case "notEmpty":
      return !isEmptyValue(v);
    case "equals":
      return String(v) === String(rule.when.value);
    case "notEquals":
      return String(v) !== String(rule.when.value);
    case "in":
      return Array.isArray(rule.when.value) && rule.when.value.map(String).includes(String(v));
  }
}

// ---------------------------------------------------------------------------
// Line items

export interface ItemsTotals {
  rows: Record<string, unknown>[];
  net: number;
  vatRate: number;
  vat: number;
  gross: number;
  currency: string;
}

export function itemsTotals(
  field: Field,
  value: unknown,
  values: Record<string, unknown>,
): ItemsTotals {
  const rows = Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
  const numeric = (field.columns ?? []).filter((c) => c.kind !== "text");
  const withAmount = rows.map((row) => {
    const amount = numeric.length
      ? numeric.reduce((acc, c) => acc * (Number(row[c.id]) || 0), 1)
      : 0;
    return { ...row, amount: round2(amount) };
  });
  const net = round2(withAmount.reduce((a, r) => a + (r.amount as number), 0));
  let vatRate = field.vat?.rate ?? 0;
  if (field.vat?.field) {
    const raw = values[field.vat.field];
    const parsed = Number.parseFloat(String(raw ?? "").replace(",", "."));
    if (Number.isFinite(parsed)) {
      vatRate = parsed;
    }
  }
  const vat = round2((net * vatRate) / 100);
  return {
    rows: withAmount,
    net,
    vatRate,
    vat,
    gross: round2(net + vat),
    currency: field.currency ?? "EUR",
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function allFields(def: WizardDefinition): Field[] {
  return def.steps.flatMap((s) => (s.type === "page" ? s.fields : []));
}
