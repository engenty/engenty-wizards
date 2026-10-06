import {
  coerceColumnValue,
  type TableColumn,
  TableColumnValueError,
} from "./engenty/data-tables/index.js";

/**
 * What a space keeps as data: tables (typed columns, rows of cells, as engenty's data tables)
 * and pages (a title and markdown). Each belongs to the space, or to one of its wizards.
 */

export interface SpaceTableInfo {
  id: string;
  /** The wizard it belongs to; null: the space's own. */
  wizardId: string | null;
  /** The wizard's shared list it keeps; its columns come from the wizard. */
  list: string | null;
  title: string;
  rows: number;
  updatedAt: string;
}

export interface SpacePageInfo {
  id: string;
  wizardId: string | null;
  title: string;
  updatedAt: string;
}

/** The space's tables and pages, and its wizards to name whose they are. */
export interface SpaceData {
  tables: SpaceTableInfo[];
  pages: SpacePageInfo[];
  wizards: { id: string; title: string }[];
}

export interface SpaceTableRow {
  id: string;
  cells: Record<string, unknown>;
  updatedAt: string;
}

export interface SpaceTable {
  id: string;
  projectId: string;
  wizardId: string | null;
  list: string | null;
  title: string;
  columns: TableColumn[];
  rows: SpaceTableRow[];
  /** The space is not changed here: a local install's, or nothing is built on this runtime. */
  readOnly: boolean;
}

export interface SpacePage {
  id: string;
  projectId: string;
  wizardId: string | null;
  title: string;
  markdown: string;
  updatedAt: string;
  readOnly: boolean;
}

export const SPACE_DATA_LIMITS = {
  tables: 200,
  pages: 500,
  rowsPerTable: 5000,
  pageChars: 200_000,
};

/**
 * Cells a person typed, as stored: each value checked against its column. A blank cell is kept
 * empty even where the column is required, so a row can be filled one cell at a time; cells of
 * columns that no longer exist are dropped.
 */
export function editCells(
  columns: readonly TableColumn[],
  current: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const byId = new Map(columns.map((c) => [c.id, c]));
  const next: Record<string, unknown> = {};
  for (const [id, value] of Object.entries(current)) {
    if (byId.has(id)) {
      next[id] = value;
    }
  }
  for (const [id, value] of Object.entries(patch)) {
    const column = byId.get(id);
    if (!column) {
      throw new TableColumnValueError(id, `unknown column "${id}"`);
    }
    next[id] = coerceColumnValue({ ...column, required: false }, value);
  }
  return next;
}

/** A column id from its name: a lowercase slug, not one of `taken`. */
export function columnIdOf(name: string, taken: readonly string[]): string {
  const base =
    name
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .replace(/^[^a-z]+/, "")
      .slice(0, 48) || "column";
  let id = base;
  let i = 2;
  while (taken.includes(id)) {
    id = `${base}_${i++}`;
  }
  return id;
}
