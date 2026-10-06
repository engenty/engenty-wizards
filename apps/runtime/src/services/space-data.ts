import {
  type TableColumn,
  TableColumnValueError,
  tableColumnsSchema,
} from "@engenty-wizards/shared/engenty/data-tables";
import {
  editCells,
  SPACE_DATA_LIMITS,
  type SpaceData,
  type SpacePage,
  type SpaceTable,
} from "@engenty-wizards/shared/space-data";
import { rowKey } from "@engenty-wizards/shared/store";
import { and, asc, count, desc, eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db, schema } from "../db/client.js";
import { currentTenant } from "../tenants/tenant.js";
import { projectWritable, requireWritableProject } from "./access.js";
import { notFound, ServiceError } from "./errors.js";
import { ownedProject } from "./projects.js";

/**
 * The tables and pages a space keeps: its own, or one of its wizards'. Every write checks that
 * the space may be changed here; a read-only space (a local install's) shows them only.
 */

type TableRow = typeof schema.spaceTable.$inferSelect;
type PageRow = typeof schema.spacePage.$inferSelect;

/** A wizard of the space, or null for the space's own. */
async function ownerOf(projectId: string, wizardId: string | null | undefined) {
  if (!wizardId) {
    return null;
  }
  const w = await db.query.wizard.findFirst({
    where: and(eq(schema.wizard.id, wizardId), eq(schema.wizard.projectId, projectId)),
    columns: { id: true },
  });
  if (!w) {
    throw new ServiceError("invalid", "Diesen Wizard gibt es im Space nicht.");
  }
  return w.id;
}

function cellError(err: unknown): never {
  if (err instanceof TableColumnValueError) {
    throw new ServiceError("invalid", err.message, { column: err.columnId });
  }
  throw err;
}

function checkColumns(columns: unknown): TableColumn[] {
  const parsed = tableColumnsSchema.safeParse(columns);
  if (!parsed.success) {
    throw new ServiceError("invalid", parsed.error.issues[0]?.message ?? "Ungültige Spalten.");
  }
  return parsed.data;
}

export async function listSpaceData(userId: string, projectId: string): Promise<SpaceData> {
  const project = await ownedProject(userId, projectId);
  const [tables, rows, pages, wizards] = await Promise.all([
    db.query.spaceTable.findMany({
      where: eq(schema.spaceTable.projectId, project.id),
      orderBy: [asc(schema.spaceTable.title)],
      columns: { id: true, wizardId: true, list: true, title: true, updatedAt: true },
    }),
    db
      .select({ tableId: schema.spaceTableRow.tableId, n: count() })
      .from(schema.spaceTableRow)
      .innerJoin(schema.spaceTable, eq(schema.spaceTable.id, schema.spaceTableRow.tableId))
      .where(eq(schema.spaceTable.projectId, project.id))
      .groupBy(schema.spaceTableRow.tableId),
    db.query.spacePage.findMany({
      where: eq(schema.spacePage.projectId, project.id),
      orderBy: [asc(schema.spacePage.title)],
      columns: { id: true, wizardId: true, title: true, updatedAt: true },
    }),
    db.query.wizard.findMany({
      where: eq(schema.wizard.projectId, project.id),
      orderBy: [desc(schema.wizard.updatedAt)],
      columns: { id: true, title: true },
    }),
  ]);
  return {
    tables: tables.map((t) => ({
      ...t,
      rows: rows.find((r) => r.tableId === t.id)?.n ?? 0,
      updatedAt: t.updatedAt.toISOString(),
    })),
    pages: pages.map((p) => ({ ...p, updatedAt: p.updatedAt.toISOString() })),
    wizards,
  };
}

// --- tables --------------------------------------------------------------------

async function tableRow(tableId: string): Promise<TableRow> {
  const table = await db.query.spaceTable.findFirst({
    where: and(eq(schema.spaceTable.id, tableId), eq(schema.spaceTable.tenantId, currentTenant())),
  });
  if (!table) {
    throw notFound();
  }
  return table;
}

async function writableTable(tableId: string): Promise<TableRow> {
  const table = await tableRow(tableId);
  await requireWritableProject(table.projectId);
  return table;
}

async function touchTable(tableId: string) {
  await db
    .update(schema.spaceTable)
    .set({ updatedAt: new Date() })
    .where(eq(schema.spaceTable.id, tableId));
}

export async function createTable(
  userId: string,
  projectId: string,
  input: { title: string; wizardId?: string | null; columns?: unknown },
) {
  const project = await ownedProject(userId, projectId);
  await requireWritableProject(project.id);
  const [{ n }] = await db
    .select({ n: count() })
    .from(schema.spaceTable)
    .where(eq(schema.spaceTable.projectId, project.id));
  if (n >= SPACE_DATA_LIMITS.tables) {
    throw new ServiceError(
      "refused",
      `Ein Space hat höchstens ${SPACE_DATA_LIMITS.tables} Tabellen.`,
    );
  }
  const columns = input.columns
    ? checkColumns(input.columns)
    : [{ id: "name", name: "Name", type: "text" as const }];
  const id = nanoid(12);
  await db.insert(schema.spaceTable).values({
    id,
    tenantId: currentTenant(),
    projectId: project.id,
    wizardId: await ownerOf(project.id, input.wizardId),
    title: input.title.trim() || "Tabelle",
    columns,
  });
  return { id };
}

export async function getTable(userId: string, tableId: string): Promise<SpaceTable> {
  const table = await tableRow(tableId);
  const project = await ownedProject(userId, table.projectId);
  const rows = await db.query.spaceTableRow.findMany({
    where: eq(schema.spaceTableRow.tableId, table.id),
    orderBy: [asc(schema.spaceTableRow.createdAt), asc(schema.spaceTableRow.id)],
  });
  return {
    id: table.id,
    projectId: table.projectId,
    wizardId: table.wizardId,
    list: table.list,
    title: table.title,
    columns: table.columns,
    rows: rows.map((r) => ({ id: r.id, cells: r.cells, updatedAt: r.updatedAt.toISOString() })),
    readOnly: !(await projectWritable(project)),
  };
}

/**
 * A new title, owner or columns. Rows keep their cells: a removed column's cells are dropped
 * the next time the row changes, and are not shown before.
 */
export async function updateTable(
  _userId: string,
  tableId: string,
  patch: { title?: string; wizardId?: string | null; columns?: unknown },
) {
  const table = await writableTable(tableId);
  if (table.list && (patch.columns !== undefined || patch.wizardId !== undefined)) {
    throw new ServiceError(
      "refused",
      "Diese Tabelle gehört zu einer Liste des Wizards: ihre Spalten kommen aus dem Wizard.",
    );
  }
  await db
    .update(schema.spaceTable)
    .set({
      ...(patch.title !== undefined ? { title: patch.title.trim() || table.title } : {}),
      ...(patch.wizardId !== undefined
        ? { wizardId: await ownerOf(table.projectId, patch.wizardId) }
        : {}),
      ...(patch.columns !== undefined ? { columns: checkColumns(patch.columns) } : {}),
      updatedAt: new Date(),
    })
    .where(eq(schema.spaceTable.id, table.id));
}

export async function deleteTable(_userId: string, tableId: string) {
  const table = await writableTable(tableId);
  await db.delete(schema.spaceTable).where(eq(schema.spaceTable.id, table.id));
}

/** The key a row of a shared list is matched on; tables made in the studio have none. */
function keyOf(table: TableRow, cells: Record<string, unknown>) {
  return table.keyColumn
    ? rowKey(
        { id: table.list ?? "", title: table.title, columns: table.columns, key: table.keyColumn },
        cells,
      )
    : null;
}

/** A row of a shared list whose key another row has already is refused: runs match on it. */
async function refuseClash(tableId: string, key: string | null, rowId: string | null) {
  if (!key) {
    return;
  }
  const other = await db.query.spaceTableRow.findFirst({
    where: and(eq(schema.spaceTableRow.tableId, tableId), eq(schema.spaceTableRow.key, key)),
    columns: { id: true },
  });
  if (other && other.id !== rowId) {
    throw new ServiceError("invalid", "Diesen Eintrag gibt es schon.");
  }
}

/** Adds a row; `cells` may leave columns empty, even required ones, to be filled later. */
export async function addTableRow(
  _userId: string,
  tableId: string,
  cells: Record<string, unknown> = {},
) {
  const table = await writableTable(tableId);
  const [{ n }] = await db
    .select({ n: count() })
    .from(schema.spaceTableRow)
    .where(eq(schema.spaceTableRow.tableId, table.id));
  if (n >= SPACE_DATA_LIMITS.rowsPerTable) {
    throw new ServiceError(
      "refused",
      `Eine Tabelle hat höchstens ${SPACE_DATA_LIMITS.rowsPerTable} Zeilen.`,
    );
  }
  let value: Record<string, unknown>;
  try {
    value = editCells(table.columns, {}, cells);
  } catch (err) {
    cellError(err);
  }
  const key = keyOf(table, value);
  await refuseClash(table.id, key, null);
  const row = { id: nanoid(14), tableId: table.id, key, cells: value, createdAt: new Date() };
  await db.insert(schema.spaceTableRow).values(row);
  await touchTable(table.id);
  return { id: row.id, cells: value };
}

/** Changes the cells named in `cells`; the others stay. */
export async function updateTableRow(
  _userId: string,
  tableId: string,
  rowId: string,
  cells: Record<string, unknown>,
) {
  const table = await writableTable(tableId);
  const row = await db.query.spaceTableRow.findFirst({
    where: and(eq(schema.spaceTableRow.id, rowId), eq(schema.spaceTableRow.tableId, table.id)),
  });
  if (!row) {
    throw notFound();
  }
  let value: Record<string, unknown>;
  try {
    value = editCells(table.columns, row.cells, cells);
  } catch (err) {
    cellError(err);
  }
  const key = keyOf(table, value);
  await refuseClash(table.id, key, row.id);
  await db
    .update(schema.spaceTableRow)
    .set({ cells: value, key, updatedAt: new Date() })
    .where(eq(schema.spaceTableRow.id, row.id));
  await touchTable(table.id);
  return { id: row.id, cells: value };
}

export async function deleteTableRows(_userId: string, tableId: string, rowIds: string[]) {
  const table = await writableTable(tableId);
  if (!rowIds.length) {
    return;
  }
  await db
    .delete(schema.spaceTableRow)
    .where(
      and(eq(schema.spaceTableRow.tableId, table.id), inArray(schema.spaceTableRow.id, rowIds)),
    );
  await touchTable(table.id);
}

// --- pages ---------------------------------------------------------------------

async function pageRow(pageId: string): Promise<PageRow> {
  const page = await db.query.spacePage.findFirst({
    where: and(eq(schema.spacePage.id, pageId), eq(schema.spacePage.tenantId, currentTenant())),
  });
  if (!page) {
    throw notFound();
  }
  return page;
}

function checkMarkdown(markdown: string) {
  if (markdown.length > SPACE_DATA_LIMITS.pageChars) {
    throw new ServiceError(
      "refused",
      `Eine Seite hat höchstens ${SPACE_DATA_LIMITS.pageChars.toLocaleString("de")} Zeichen.`,
    );
  }
  return markdown;
}

export async function createPage(
  userId: string,
  projectId: string,
  input: { title: string; wizardId?: string | null; markdown?: string },
) {
  const project = await ownedProject(userId, projectId);
  await requireWritableProject(project.id);
  const [{ n }] = await db
    .select({ n: count() })
    .from(schema.spacePage)
    .where(eq(schema.spacePage.projectId, project.id));
  if (n >= SPACE_DATA_LIMITS.pages) {
    throw new ServiceError("refused", `Ein Space hat höchstens ${SPACE_DATA_LIMITS.pages} Seiten.`);
  }
  const id = nanoid(12);
  await db.insert(schema.spacePage).values({
    id,
    tenantId: currentTenant(),
    projectId: project.id,
    wizardId: await ownerOf(project.id, input.wizardId),
    title: input.title.trim() || "Seite",
    markdown: checkMarkdown(input.markdown ?? ""),
  });
  return { id };
}

export async function getPage(userId: string, pageId: string): Promise<SpacePage> {
  const page = await pageRow(pageId);
  const project = await ownedProject(userId, page.projectId);
  return {
    id: page.id,
    projectId: page.projectId,
    wizardId: page.wizardId,
    title: page.title,
    markdown: page.markdown,
    updatedAt: page.updatedAt.toISOString(),
    readOnly: !(await projectWritable(project)),
  };
}

export async function updatePage(
  _userId: string,
  pageId: string,
  patch: { title?: string; wizardId?: string | null; markdown?: string },
) {
  const page = await pageRow(pageId);
  await requireWritableProject(page.projectId);
  await db
    .update(schema.spacePage)
    .set({
      ...(patch.title !== undefined ? { title: patch.title.trim() || page.title } : {}),
      ...(patch.wizardId !== undefined
        ? { wizardId: await ownerOf(page.projectId, patch.wizardId) }
        : {}),
      ...(patch.markdown !== undefined ? { markdown: checkMarkdown(patch.markdown) } : {}),
      updatedAt: new Date(),
    })
    .where(eq(schema.spacePage.id, page.id));
}

export async function deletePage(_userId: string, pageId: string) {
  const page = await pageRow(pageId);
  await requireWritableProject(page.projectId);
  await db.delete(schema.spacePage).where(eq(schema.spacePage.id, page.id));
}

// --- what runs read and write --------------------------------------------------
// A run writes the pages of its own wizard, on the runtime it runs on: a run on the server writes
// the server's, also in a space a local install synced, which the studio there only shows. It
// reads its wizard's pages and the space's own.

/** The pages a run can read: its wizard's, then the space's own. */
export async function runPages(projectId: string, wizardId: string) {
  const pages = await db.query.spacePage.findMany({
    where: eq(schema.spacePage.projectId, projectId),
    columns: { id: true, wizardId: true, title: true, markdown: true, updatedAt: true },
    orderBy: [asc(schema.spacePage.title)],
  });
  return pages
    .filter((p) => p.wizardId === wizardId || p.wizardId === null)
    .sort((a, b) => Number(b.wizardId === wizardId) - Number(a.wizardId === wizardId));
}

/** Writes a page of the run's wizard: a new one, or the one with this title, replaced or added to. */
export async function writeRunPage(
  projectId: string,
  wizardId: string,
  input: { title: string; markdown: string; append?: boolean },
) {
  const title = input.title.trim();
  if (!title) {
    throw new ServiceError("invalid", "A page needs a title.");
  }
  const existing = (
    await db.query.spacePage.findMany({
      where: and(
        eq(schema.spacePage.projectId, projectId),
        eq(schema.spacePage.wizardId, wizardId),
      ),
    })
  ).find((p) => p.title.toLowerCase() === title.toLowerCase());
  const markdown =
    existing && input.append
      ? `${existing.markdown.trimEnd()}\n\n${input.markdown.trim()}`
      : input.markdown;
  checkMarkdown(markdown);
  if (existing) {
    await db
      .update(schema.spacePage)
      .set({ markdown, updatedAt: new Date() })
      .where(eq(schema.spacePage.id, existing.id));
    return { id: existing.id, title: existing.title, chars: markdown.length, made: false };
  }
  const [{ n }] = await db
    .select({ n: count() })
    .from(schema.spacePage)
    .where(eq(schema.spacePage.projectId, projectId));
  if (n >= SPACE_DATA_LIMITS.pages) {
    throw new ServiceError("refused", `A space keeps at most ${SPACE_DATA_LIMITS.pages} pages.`);
  }
  const id = nanoid(12);
  await db.insert(schema.spacePage).values({
    id,
    tenantId: currentTenant(),
    projectId,
    wizardId,
    title: title.slice(0, 200),
    markdown,
  });
  return { id, title, chars: markdown.length, made: true };
}
