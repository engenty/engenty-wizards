import type { Format } from "@shared/definition";
import { formatTableCell, type TableColumn } from "@shared/engenty/data-tables";
import type { ShownList } from "@shared/run";
import type { ConnectionView, ConnectorOption, StoreFile } from "@shared/store";
import { Check, Database, FileText, Link2, Plus, Trash2, Unplug } from "lucide-react";
import { useEffect, useState } from "react";
import { ApiError, api } from "../lib/api";
import { lang, t } from "../lib/i18n";
import { Button, cn, Dialog, IconButton, Input, Label, Spinner } from "../ui";

// --- connecting an account -------------------------------------------------------

function CredentialsForm({
  runId,
  connectionId,
  connector,
  onCancel,
}: {
  runId: string;
  connectionId: string;
  connector: ConnectorOption;
  onCancel: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/api/runs/${runId}/connections/${connectionId}/credentials/${connector.id}`, {
        values,
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-card p-4 ring-1 ring-input">
      {(connector.fields ?? []).map((f) => (
        <div key={f.key}>
          <Label>{f.label}</Label>
          <Input
            type={f.secret ? "password" : "text"}
            autoComplete="off"
            value={values[f.key] ?? ""}
            placeholder={f.placeholder}
            onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
            onKeyDown={(e) => {
              // Enter connects; it must not submit the wizard page around this form.
              if (e.key === "Enter") {
                e.preventDefault();
                void submit();
              }
            }}
          />
        </div>
      ))}
      {connector.hint ? <p className="text-[13px] text-ink-3">{connector.hint}</p> : null}
      {error ? <p className="text-[13px] text-rose">{error}</p> : null}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
        <Button size="sm" busy={busy} onClick={() => void submit()}>
          {t("connect.go")}
        </Button>
      </div>
    </div>
  );
}

/** The person connects an account (their mailbox) to the wizard, or sees which one is connected. */
export function ConnectionField({
  runId,
  connection,
}: {
  runId: string;
  connection: ConnectionView | undefined;
}) {
  const [form, setForm] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!connection) {
    return null;
  }
  if (connection.account) {
    const name =
      connection.connectors.find((c) => c.id === connection.account?.connector)?.name ?? "";
    return (
      <div className="flex items-center gap-3 rounded-2xl bg-card p-3 ring-1 ring-input">
        <div className="flex size-10 items-center justify-center rounded-full bg-moss-tint text-moss">
          <Check className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium text-[15px]">{connection.account.label}</div>
          <div className="text-[13px] text-ink-3">{t("connect.connected", { name })}</div>
        </div>
        <IconButton
          label={t("connect.disconnect")}
          onClick={() => void api.del(`/api/runs/${runId}/connections/${connection.id}`)}
        >
          <Unplug className="size-4" />
        </IconButton>
      </div>
    );
  }
  const oauth = async (connector: ConnectorOption) => {
    setError(null);
    setLink(null);
    // Opened inside the click, before the address is known: a popup opened later is blocked.
    const popup = window.open("about:blank", "wizard-connect", "width=540,height=700");
    try {
      const { url } = await api.post<{ url: string }>(
        `/api/runs/${runId}/connections/${connection.id}/oauth/${connector.id}`,
      );
      if (popup) {
        popup.location.replace(url);
      } else {
        setLink(url);
      }
    } catch (err) {
      popup?.close();
      setError((err as Error).message);
    }
  };
  const open = connection.connectors.find((c) => c.id === form);
  if (!connection.connectors.length) {
    return <p className="text-[14px] text-ink-3">{t("connect.none")}</p>;
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {connection.connectors.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => (c.auth === "oauth2" ? void oauth(c) : setForm(form === c.id ? null : c.id))}
            className={cn(
              "inline-flex h-11 items-center gap-2 rounded-full px-4 font-medium text-[14px] ring-1 transition",
              form === c.id
                ? "bg-ember-veil text-ink ring-ember"
                : "bg-card text-ink-2 ring-input hover:text-ink hover:ring-ember",
            )}
          >
            <Link2 className="size-4" /> {c.name}
          </button>
        ))}
      </div>
      {open ? (
        <CredentialsForm
          runId={runId}
          connectionId={connection.id}
          connector={open}
          onCancel={() => setForm(null)}
        />
      ) : null}
      {link ? (
        <a href={link} target="_blank" rel="noreferrer" className="text-[14px] text-ember underline">
          {t("connect.openLink")}
        </a>
      ) : null}
      {error ? <p className="text-[13px] text-rose">{error}</p> : null}
    </div>
  );
}

// --- lists ---------------------------------------------------------------------

/** A cell's value as the text its input shows. */
function inputText(value: unknown): string {
  return value === null || value === undefined
    ? ""
    : Array.isArray(value)
      ? value.join(", ")
      : String(value);
}

/** What the person typed, as the value the column takes. */
function cellValue(column: TableColumn, text: string): unknown {
  if (text.trim() === "") {
    return null;
  }
  if (column.type === "number") {
    const n = Number(text.replace(/\s/g, "").replace(",", "."));
    return Number.isFinite(n) ? n : text;
  }
  if (column.type === "boolean") {
    return text === "true";
  }
  return text;
}

function CellInput({
  column,
  value,
  onCommit,
}: {
  column: TableColumn;
  value: unknown;
  onCommit: (value: unknown) => void;
}) {
  const [text, setText] = useState(inputText(value));
  useEffect(() => setText(inputText(value)), [value]);
  const base =
    "h-9 w-full min-w-0 rounded-lg border border-transparent bg-transparent px-2 text-[13px] outline-none hover:bg-paper-2 focus:border-ember focus:bg-card";
  if (column.type === "boolean") {
    return (
      <input
        type="checkbox"
        checked={value === true}
        onChange={(e) => onCommit(e.target.checked)}
        className="size-4 accent-[var(--ember)]"
      />
    );
  }
  if (column.type === "select" && !column.format.multiple && !column.format.allowCustom) {
    return (
      <select value={text} onChange={(e) => onCommit(e.target.value || null)} className={base}>
        <option value="" />
        {column.format.options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }
  const commit = () => {
    if (text !== inputText(value)) {
      onCommit(cellValue(column, text));
    }
  };
  return (
    <input
      aria-label={column.name}
      type={column.type === "date" && column.format.kind === "date" ? "date" : "text"}
      inputMode={column.type === "number" ? "decimal" : undefined}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          (e.target as HTMLInputElement).blur();
        }
      }}
      className={cn(base, column.type === "number" && "text-right tabular-nums")}
    />
  );
}

/** One of the wizard's stored lists: read, or edited in place by the person it belongs to. */
export function ListTable({
  runId,
  list,
  editable,
}: {
  runId: string;
  list: ShownList;
  editable?: boolean;
}) {
  const { def, rows } = list;
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const base = `/api/runs/${runId}/lists/${def.id}/rows`;
  const call = async (run: () => Promise<unknown>) => {
    setError(null);
    try {
      await run();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    }
  };
  const addRow = () =>
    call(async () => {
      await api.post(base, { cells: draft });
      setDraft({});
    });
  const hasDraft = Object.values(draft).some((v) => v !== null && v !== undefined && v !== "");
  if (!rows.length && !editable) {
    return <p className="text-[14px] text-ink-3">{t("list.empty")}</p>;
  }
  return (
    <div>
      <div className="overflow-x-auto rounded-xl ring-1 ring-border-soft">
        <table className="w-full text-[13px]">
          <thead className="bg-paper-2 text-ink-2">
            <tr>
              {def.columns.map((c) => (
                <th key={c.id} className="whitespace-nowrap px-3 py-2 text-left font-medium">
                  {c.name}
                </th>
              ))}
              {editable ? <th className="w-10" /> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-border-soft border-t align-top">
                {def.columns.map((c) => (
                  <td key={c.id} className={cn(editable ? "px-1 py-0.5" : "px-3 py-2")}>
                    {editable ? (
                      <CellInput
                        column={c}
                        value={row.cells[c.id]}
                        onCommit={(value) =>
                          void call(() => api.patch(`${base}/${row.id}`, { cells: { [c.id]: value } }))
                        }
                      />
                    ) : (
                      <span className={cn(c.type === "number" && "tabular-nums")}>
                        {formatTableCell(c, row.cells[c.id], lang)}
                      </span>
                    )}
                  </td>
                ))}
                {editable ? (
                  <td className="px-1 py-0.5">
                    <IconButton
                      label={t("list.delete")}
                      className="size-9"
                      onClick={() => void call(() => api.del(`${base}/${row.id}`))}
                    >
                      <Trash2 className="size-3.5" />
                    </IconButton>
                  </td>
                ) : null}
              </tr>
            ))}
            {editable ? (
              <tr className="border-border-soft border-t bg-paper">
                {def.columns.map((c) => (
                  <td key={c.id} className="px-1 py-0.5">
                    <CellInput
                      column={c}
                      value={draft[c.id]}
                      onCommit={(value) => setDraft((d) => ({ ...d, [c.id]: value }))}
                    />
                  </td>
                ))}
                <td className="px-1 py-0.5">
                  <IconButton
                    label={t("run.addRow")}
                    className="size-9"
                    onClick={() => (hasDraft ? void addRow() : undefined)}
                  >
                    <Plus className="size-4" />
                  </IconButton>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {error ? <p className="mt-2 text-[13px] text-rose">{error}</p> : null}
    </div>
  );
}

const LIST_FORMAT_LABEL: Partial<Record<Format, string>> = {
  xlsx: "Excel",
  csv: "CSV",
  json: "JSON",
  md: "Markdown",
};

export function ListDownloads({ runId, list }: { runId: string; list: ShownList }) {
  return (
    <div className="flex flex-wrap gap-2">
      {list.formats.map((f) => (
        <a
          key={f}
          href={`/api/runs/${runId}/lists/${list.def.id}/download?format=${f}`}
          className="inline-flex h-9 items-center rounded-full bg-paper-2 px-3.5 font-medium text-[13px] text-ink-2 transition hover:bg-paper-3 hover:text-ink"
        >
          {LIST_FORMAT_LABEL[f] ?? f}
        </a>
      ))}
    </div>
  );
}

// --- what the wizard keeps -------------------------------------------------------

interface StoreSummary {
  lists: { id: string; title: string; rows: number }[];
  files: StoreFile[];
  connections: ConnectionView[];
  keepsSignIns: boolean;
}

function bytes(n: number): string {
  return n > 1_000_000 ? `${(n / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1000))} KB`;
}

/** Everything the wizard keeps for this person between runs, and the way to delete it. */
export function StoreButton({ runId }: { runId: string }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<StoreSummary | null>(null);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    if (open) {
      setConfirm(false);
      void api.get<StoreSummary>(`/api/runs/${runId}/store`).then(setData);
    }
  }, [open, runId]);
  const empty =
    data &&
    !data.files.length &&
    !data.connections.length &&
    !data.keepsSignIns &&
    data.lists.every((l) => !l.rows);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-[13px] text-ink-4 transition hover:text-ink-2"
      >
        <Database className="size-3.5" /> {t("store.open")}
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title={t("store.title")} wide>
        {!data ? (
          <div className="flex justify-center py-8 text-ink-4">
            <Spinner />
          </div>
        ) : (
          <div className="flex flex-col gap-5 text-[14px]">
            <p className="text-ink-3">{t("store.explain")}</p>
            {empty ? <p className="text-ink-2">{t("store.empty")}</p> : null}
            {data.lists.some((l) => l.rows) ? (
              <ul className="flex flex-col gap-1">
                {data.lists
                  .filter((l) => l.rows)
                  .map((l) => (
                    <li key={l.id} className="flex justify-between gap-3">
                      <span>{l.title}</span>
                      <span className="text-ink-3 tabular-nums">{t("store.rows", { n: l.rows })}</span>
                    </li>
                  ))}
              </ul>
            ) : null}
            {data.connections.map((c) => (
              <div key={c.id} className="flex items-center gap-2">
                <Link2 className="size-4 text-ink-3" /> {c.account?.label}
              </div>
            ))}
            {data.keepsSignIns ? (
              <div className="flex items-center gap-2">
                <Check className="size-4 text-ink-3" /> {t("store.signIns")}
              </div>
            ) : null}
            {data.files.length ? (
              <div>
                <div className="mb-1 text-ink-3">
                  {t("store.files", {
                    n: data.files.length,
                    size: bytes(data.files.reduce((n, f) => n + f.size, 0)),
                  })}
                </div>
                <ul className="max-h-56 overflow-y-auto rounded-xl ring-1 ring-border-soft">
                  {data.files.map((f) => (
                    <li key={f.path} className="border-border-soft border-b last:border-0">
                      <a
                        href={`/api/runs/${runId}/store/files/${f.path}`}
                        className="flex items-center gap-2 px-3 py-2 text-[13px] hover:bg-paper-2"
                        title={f.source ?? undefined}
                      >
                        <FileText className="size-3.5 shrink-0 text-ink-3" />
                        <span className="min-w-0 flex-1 truncate">{f.path}</span>
                        <span className="text-ink-4 tabular-nums">{bytes(f.size)}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className="flex items-center justify-between gap-3 pt-1">
              {empty ? (
                <span />
              ) : confirm ? (
                <Button
                  variant="secondary"
                  onClick={async () => {
                    await api.del(`/api/runs/${runId}/store`);
                    setData(await api.get<StoreSummary>(`/api/runs/${runId}/store`));
                    setConfirm(false);
                  }}
                >
                  <Trash2 className="size-4" /> {t("store.confirmDelete")}
                </Button>
              ) : (
                <Button variant="ghost" onClick={() => setConfirm(true)}>
                  <Trash2 className="size-4" /> {t("store.delete")}
                </Button>
              )}
              <Button onClick={() => setOpen(false)}>{t("common.close")}</Button>
            </div>
          </div>
        )}
      </Dialog>
    </>
  );
}
