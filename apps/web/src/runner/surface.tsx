import type { Surface, SurfaceComponent } from "@engenty-wizards/shared/surface";
import { bound } from "@engenty-wizards/shared/surface";
import type { ReactNode } from "react";
import { cn } from "../ui";

/**
 * A surface drawn with the runner's own components: the catalog in shared/surface.ts, nothing
 * else. Unknown components render nothing; a prop that is not there shows empty.
 */

export type SurfaceAction = { action: "regenerate" | "open"; target?: unknown };

interface Ctx {
  byId: Map<string, SurfaceComponent>;
  data: Record<string, unknown>;
  assetUrl: (id: string) => string;
  onAction?: (a: SurfaceAction) => void;
}

const text = (v: unknown): string =>
  v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

/** A picture: an asset of the run by id, or an address. */
function src(v: unknown, assetUrl: (id: string) => string): string | null {
  const s = text(v);
  if (!s) {
    return null;
  }
  return /^(https?:|data:|\/)/.test(s) ? s : assetUrl(s);
}

function prop(c: SurfaceComponent, key: string, ctx: Ctx, row?: unknown): unknown {
  return bound((c as Record<string, unknown>)[key], ctx.data, row);
}

/** Chart points from rows: their `label` and `value`, or the columns a chart names instead. */
function points(
  v: unknown,
  labelKey: unknown,
  valueKey: unknown,
): { label: string; value: number }[] {
  const l = text(labelKey) || "label";
  const k = text(valueKey) || "value";
  return Array.isArray(v)
    ? v.map((p) => ({ label: text((p as any)?.[l]), value: num((p as any)?.[k]) }))
    : [];
}

function Children({ c, ctx, row }: { c: SurfaceComponent; ctx: Ctx; row?: unknown }) {
  const kids = c.children;
  if (!kids) {
    return null;
  }
  if (Array.isArray(kids)) {
    return (
      <>
        {kids.map((id) => (
          <Node key={id} id={id} ctx={ctx} row={row} />
        ))}
      </>
    );
  }
  const items = bound({ path: kids.path }, ctx.data, row);
  return (
    <>
      {(Array.isArray(items) ? items : []).map((item, i) => (
        <Node key={i} id={kids.componentId} ctx={ctx} row={item} />
      ))}
    </>
  );
}

const TONES: Record<string, string> = {
  success: "bg-moss-tint text-moss",
  warning: "bg-amber-tint text-ink-2",
  default: "bg-paper-2 text-ink-2",
};

function Bars({ data }: { data: { label: string; value: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="flex flex-col gap-1.5">
      {data.map((d, i) => (
        <div key={i} className="grid grid-cols-[minmax(0,8rem)_1fr_auto] items-center gap-2">
          <span className="truncate text-[0.8125rem] text-ink-2">{d.label}</span>
          <span className="h-2.5 rounded-full bg-paper-2">
            <span
              className="block h-full rounded-full bg-ember"
              style={{ width: `${(d.value / max) * 100}%` }}
            />
          </span>
          <span className="text-[0.8125rem] tabular-nums">{d.value.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}

function Line({ data }: { data: { label: string; value: number }[] }) {
  if (data.length < 2) {
    return <Bars data={data} />;
  }
  const w = 320;
  const h = 120;
  const max = Math.max(...data.map((d) => d.value));
  const min = Math.min(...data.map((d) => d.value));
  const span = max - min || 1;
  const xy = data.map((d, i) => [
    (i / (data.length - 1)) * (w - 8) + 4,
    h - 4 - ((d.value - min) / span) * (h - 8),
  ]);
  return (
    <figure>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full text-ember" role="img">
        <polyline
          points={xy.map(([x, y]) => `${x},${y}`).join(" ")}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        {xy.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="3" fill="currentColor">
            <title>{`${data[i].label}: ${data[i].value}`}</title>
          </circle>
        ))}
      </svg>
      <figcaption className="mt-1 flex justify-between text-[0.75rem] text-ink-3">
        <span>{data[0].label}</span>
        <span>{data.at(-1)?.label}</span>
      </figcaption>
    </figure>
  );
}

const DONUT = [
  "var(--color-ember)",
  "var(--color-cobalt)",
  "var(--color-moss)",
  "var(--color-amber)",
  "var(--color-ink-3)",
];

function Donut({ data }: { data: { label: string; value: number }[] }) {
  const total = data.reduce((a, d) => a + Math.max(0, d.value), 0) || 1;
  let at = 0;
  const r = 40;
  const length = 2 * Math.PI * r;
  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 100 100" className="size-28 shrink-0 -rotate-90" role="img">
        {data.map((d, i) => {
          const part = (Math.max(0, d.value) / total) * length;
          const el = (
            <circle
              key={i}
              cx="50"
              cy="50"
              r={r}
              fill="none"
              stroke={DONUT[i % DONUT.length]}
              strokeWidth="16"
              strokeDasharray={`${part} ${length - part}`}
              strokeDashoffset={-at}
            >
              <title>{`${d.label}: ${d.value}`}</title>
            </circle>
          );
          at += part;
          return el;
        })}
      </svg>
      <ul className="flex flex-col gap-1 text-[0.8125rem]">
        {data.map((d, i) => (
          <li key={i} className="flex items-center gap-2">
            <span
              className="size-2.5 rounded-full"
              style={{ background: DONUT[i % DONUT.length] }}
            />
            <span className="text-ink-2">{d.label}</span>
            <span className="tabular-nums">{d.value.toLocaleString()}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Titled({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl bg-card p-4 ring-1 ring-border-soft">
      {title ? <div className="mb-3 font-medium text-[0.875rem]">{title}</div> : null}
      {children}
    </div>
  );
}

function Node({ id, ctx, row }: { id: string; ctx: Ctx; row?: unknown }) {
  const c = ctx.byId.get(id);
  if (!c) {
    return null;
  }
  const p = (key: string) => prop(c, key, ctx, row);
  switch (c.component) {
    case "Column":
      return (
        <div className="flex flex-col gap-4">
          <Children c={c} ctx={ctx} row={row} />
        </div>
      );
    case "Text": {
      const variant = text(p("variant")) || "body";
      return (
        <p
          className={cn(
            variant === "h3" && "font-display font-semibold text-[1.25rem] leading-tight",
            variant === "h4" && "font-semibold text-[1rem]",
            variant === "body" && "text-[0.9375rem] leading-relaxed",
            variant === "muted" && "text-[0.8125rem] text-ink-3",
          )}
        >
          {text(p("text"))}
        </p>
      );
    }
    case "List":
      return (
        <div className="flex flex-col divide-y divide-border-soft overflow-hidden rounded-xl bg-card ring-1 ring-border-soft">
          <Children c={c} ctx={ctx} row={row} />
        </div>
      );
    case "Row": {
      const image = src(p("image"), ctx.assetUrl);
      const badge = text(p("badge"));
      return (
        <div className="flex items-center gap-3 px-4 py-3">
          {image ? (
            <img src={image} alt="" className="size-10 shrink-0 rounded-lg object-cover" />
          ) : null}
          <div className="min-w-0 flex-1">
            <div className="truncate text-[0.9375rem]">{text(p("title"))}</div>
            {p("subtitle") ? (
              <div className="truncate text-[0.8125rem] text-ink-3">{text(p("subtitle"))}</div>
            ) : null}
          </div>
          {p("meta") ? (
            <span className="shrink-0 text-[0.8125rem] text-ink-3 tabular-nums">
              {text(p("meta"))}
            </span>
          ) : null}
          {badge ? (
            <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[0.75rem]", TONES.default)}>
              {badge}
            </span>
          ) : null}
        </div>
      );
    }
    case "DetailGrid": {
      const rows = p("rows");
      return (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-xl bg-card p-4 text-[0.875rem] ring-1 ring-border-soft">
          {(Array.isArray(rows) ? rows : []).map((r, i) => (
            <div key={i} className="contents">
              <dt className="text-ink-3">{text(bound((r as any)?.label, ctx.data, row))}</dt>
              <dd className="break-words">{text(bound((r as any)?.value, ctx.data, row))}</dd>
            </div>
          ))}
        </dl>
      );
    }
    case "Badge":
      return (
        <span
          className={cn(
            "inline-flex w-fit rounded-full px-2.5 py-0.5 text-[0.75rem]",
            TONES[text(p("tone"))] ?? TONES.default,
          )}
        >
          {text(p("label"))}
        </span>
      );
    case "Grid": {
      const columns = Math.min(4, Math.max(1, num(p("columns")) || 2));
      return (
        <div
          className="grid gap-3"
          style={{
            gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${columns > 2 ? 9 : 12}rem), 1fr))`,
          }}
        >
          <Children c={c} ctx={ctx} row={row} />
        </div>
      );
    }
    case "Metric":
      return (
        <div className="rounded-xl bg-card p-4 ring-1 ring-border-soft">
          <div className="text-[0.75rem] text-ink-3 uppercase tracking-[0.06em]">
            {text(p("label"))}
          </div>
          <div className="mt-1 font-display font-semibold text-[1.5rem] tabular-nums">
            {text(p("value"))}
          </div>
          {p("caption") ? (
            <div className="text-[0.8125rem] text-ink-3">{text(p("caption"))}</div>
          ) : null}
        </div>
      );
    case "Table": {
      const rows = p("rows");
      const list = (Array.isArray(rows) ? rows : []) as Record<string, unknown>[];
      const declared = p("columns");
      const cols: { key: string; label: string }[] = Array.isArray(declared)
        ? declared.map((d: any) => ({ key: text(d?.key), label: text(d?.label ?? d?.key) }))
        : [...new Set(list.flatMap((r) => Object.keys(r ?? {})))].map((k) => ({
            key: k,
            label: k,
          }));
      return (
        <div className="overflow-x-auto rounded-xl ring-1 ring-border-soft">
          <table className="w-full text-[0.8125rem]">
            <thead className="bg-paper-2 text-ink-2">
              <tr>
                {cols.map((col) => (
                  <th key={col.key} className="px-3 py-2 text-left font-medium">
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.map((r, i) => (
                <tr key={i} className="border-border-soft border-t">
                  {cols.map((col) => (
                    <td key={col.key} className="px-3 py-2 tabular-nums">
                      {text(r?.[col.key])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    case "Image": {
      const url = src(p("src"), ctx.assetUrl);
      return url ? <img src={url} alt={text(p("alt"))} className="w-full rounded-xl" /> : null;
    }
    case "BarChart":
      return (
        <Titled title={text(p("title"))}>
          <Bars data={points(p("points"), p("labelKey"), p("valueKey"))} />
        </Titled>
      );
    case "LineChart":
      return (
        <Titled title={text(p("title"))}>
          <Line data={points(p("points"), p("labelKey"), p("valueKey"))} />
        </Titled>
      );
    case "DonutChart":
      return (
        <Titled title={text(p("title"))}>
          <Donut data={points(p("slices"), p("labelKey"), p("valueKey"))} />
        </Titled>
      );
    case "Actions":
      return (
        <div className="flex flex-wrap gap-2">
          <Children c={c} ctx={ctx} row={row} />
        </div>
      );
    case "Button": {
      const action = text(p("action")) as SurfaceAction["action"];
      if (!ctx.onAction && action !== "open") {
        return null;
      }
      return (
        <button
          type="button"
          onClick={() => {
            const target = p("target");
            if (action === "open") {
              const url = src(target, ctx.assetUrl);
              if (url) {
                window.open(url, "_blank", "noopener");
              }
              return;
            }
            ctx.onAction?.({ action, target });
          }}
          className="inline-flex h-9 items-center rounded-full bg-paper-2 px-4 text-[0.875rem] text-ink-2 hover:text-ink coarse:h-11"
        >
          {text(p("label"))}
        </button>
      );
    }
  }
  return null;
}

export function SurfaceView({
  surface,
  assetUrl,
  onAction,
}: {
  surface: Surface;
  assetUrl: (id: string) => string;
  onAction?: (a: SurfaceAction) => void;
}) {
  const ctx: Ctx = {
    byId: new Map(surface.components.map((c) => [c.id, c])),
    data: surface.data,
    assetUrl,
    onAction,
  };
  return <Node id="root" ctx={ctx} />;
}
