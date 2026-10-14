import { type DateView, type Field, isDay, LOCALES } from "@engenty-wizards/shared/definition";
import { type DateBounds, dateBounds } from "@engenty-wizards/shared/field-checks";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { type Lang, type RunnerKey, t, useRunnerLang } from "./i18n.js";
import { cn, Dialog, IconButton, Input } from "./ui.js";

/**
 * A date field: typed in the person's own order (03.04.1985, 03/04/1985) or picked in a calendar
 * that goes straight to a year and a month, so a birth date is three taps away instead of
 * hundreds of months. What it keeps is a day as YYYY-MM-DD; what cannot be read as one is
 * handed on as typed, for the page's check to name.
 */

type Part = "day" | "month" | "year";

interface Ymd {
  y: number;
  /** 1–12 */
  m: number;
  d: number;
}

const pad = (n: number, width = 2) => String(n).padStart(width, "0");
const toIso = ({ y, m, d }: Ymd) => `${pad(y, 4)}-${pad(m)}-${pad(d)}`;

function fromIso(s: string): Ymd | null {
  if (!isDay(s)) {
    return null;
  }
  const [y, m, d] = s.split("-").map(Number) as [number, number, number];
  return { y, m, d };
}

/** Midnight UTC of a day; years below 100 stay what they are. */
function utc({ y, m, d }: Ymd): Date {
  const date = new Date(0);
  date.setUTCFullYear(y, m - 1, d);
  return date;
}

function fromUtc(date: Date): Ymd {
  return { y: date.getUTCFullYear(), m: date.getUTCMonth() + 1, d: date.getUTCDate() };
}

function daysIn(y: number, m: number): number {
  return new Date(Date.UTC(2000, m, 0)).getUTCDate() - (m === 2 && !leap(y) ? 1 : 0);
}

function leap(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

function addDays(day: Ymd, n: number): Ymd {
  return fromUtc(new Date(utc(day).getTime() + n * 86_400_000));
}

/** The same day some months on, or the month's last day where it is shorter. */
function addMonths(day: Ymd, n: number): Ymd {
  const index = day.y * 12 + (day.m - 1) + n;
  const y = Math.floor(index / 12);
  const m = (index % 12) + 1;
  return { y, m, d: Math.min(day.d, daysIn(y, m)) };
}

/** Without a bound of its own, the calendar keeps to years of four digits, as a day is kept. */
const FIRST_DAY = "1000-01-01";
const LAST_DAY = "9999-12-31";

function clamp(day: Ymd, given: DateBounds): Ymd {
  const bounds = { min: given.min ?? FIRST_DAY, max: given.max ?? LAST_DAY };
  if (day.y > 9999) {
    return fromIso(bounds.max) ?? day;
  }
  const s = toIso(day);
  if (bounds.min && bounds.max && bounds.min > bounds.max) {
    return day;
  }
  if (bounds.min && s < bounds.min) {
    return fromIso(bounds.min) ?? day;
  }
  if (bounds.max && s > bounds.max) {
    return fromIso(bounds.max) ?? day;
  }
  return day;
}

/** Whether no day from `first` to `last` (YYYY-MM-DD) can be picked. */
function outside(first: string, last: string, bounds: DateBounds): boolean {
  const min = bounds.min ?? FIRST_DAY;
  const max = bounds.max ?? LAST_DAY;
  // A year of five digits is past the last one, though "10000" sorts before "9999".
  return last < min || first > max || first.length > 10;
}

function todayOf(): Ymd {
  const now = new Date();
  return { y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() };
}

// --- the locale's order, names and letters ---------------------------------------------------

const orders = new Map<Lang, { order: Part[]; sep: string }>();

/** The order of day, month and year in the runner's locale, and what stands between them. */
function orderOf(lang: Lang): { order: Part[]; sep: string } {
  let found = orders.get(lang);
  if (!found) {
    const parts = new Intl.DateTimeFormat(LOCALES[lang], {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      timeZone: "UTC",
    }).formatToParts(new Date(Date.UTC(2001, 1, 3)));
    const order = parts
      .map((p) => p.type)
      .filter((type): type is Part => type === "day" || type === "month" || type === "year");
    found = {
      order: order.length === 3 ? order : ["day", "month", "year"],
      sep: parts.find((p) => p.type === "literal")?.value ?? ".",
    };
    orders.set(lang, found);
  }
  return found;
}

/** A day as the person reads and types it: 03.04.1985, 03/04/1985. */
export function formatDay(iso: string, lang: Lang): string {
  const day = fromIso(iso);
  if (!day) {
    return iso;
  }
  const { order, sep } = orderOf(lang);
  const text: Record<Part, string> = { day: pad(day.d), month: pad(day.m), year: pad(day.y, 4) };
  return order.map((p) => text[p]).join(sep);
}

/** What the field asks for: TT.MM.JJJJ, DD/MM/YYYY. */
function patternOf(lang: Lang): string {
  const { order, sep } = orderOf(lang);
  return order.map((p) => t(`calendar.letters.${p}` as RunnerKey)).join(sep);
}

/**
 * A typed day as YYYY-MM-DD, or null: in the locale's order with any marks between the parts
 * (3.4.1985, 3/4/85, 03041985), or already as 1985-04-03. A two-digit year is the latest one
 * that is not after `maxYear` (default: ten years from now).
 */
export function parseDay(text: string, lang: Lang, maxYear?: number): string | null {
  const s = text.trim();
  if (!s) {
    return null;
  }
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  let digits: Record<Part, string>;
  if (iso) {
    digits = { year: iso[1] ?? "", month: iso[2] ?? "", day: iso[3] ?? "" };
  } else {
    const { order } = orderOf(lang);
    let groups = s.split(/\D+/).filter(Boolean);
    // Typed without marks: two digits each for day and month, the rest for the year.
    if (groups.length === 1 && /^\d{6}(\d{2})?$/.test(groups[0] ?? "")) {
      const run = groups[0] ?? "";
      const yearLength = run.length - 4;
      groups = [];
      let at = 0;
      for (const part of order) {
        const length = part === "year" ? yearLength : 2;
        groups.push(run.slice(at, at + length));
        at += length;
      }
    }
    if (groups.length !== 3) {
      return null;
    }
    digits = Object.fromEntries(order.map((p, i) => [p, groups[i] ?? ""])) as Record<Part, string>;
  }
  if (digits.day.length > 2 || digits.month.length > 2) {
    return null;
  }
  let y = Number(digits.year);
  if (digits.year.length === 2) {
    y += 2000;
    if (y > (maxYear ?? new Date().getFullYear() + 10)) {
      y -= 100;
    }
  } else if (digits.year.length !== 4) {
    return null;
  }
  const out = toIso({ y, m: Number(digits.month), d: Number(digits.day) });
  return isDay(out) ? out : null;
}

function monthNames(lang: Lang): string[] {
  const format = new Intl.DateTimeFormat(LOCALES[lang], { month: "long", timeZone: "UTC" });
  return Array.from({ length: 12 }, (_, i) => format.format(new Date(Date.UTC(2001, i, 1))));
}

/** Monday first, as in both locales; short and long. */
function weekdayNames(lang: Lang): { short: string; long: string }[] {
  const short = new Intl.DateTimeFormat(LOCALES[lang], { weekday: "short", timeZone: "UTC" });
  const long = new Intl.DateTimeFormat(LOCALES[lang], { weekday: "long", timeZone: "UTC" });
  // 2001-01-01 was a Monday.
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(Date.UTC(2001, 0, 1 + i));
    return { short: short.format(date), long: long.format(date) };
  });
}

function dayLabel(day: Ymd, lang: Lang): string {
  return new Intl.DateTimeFormat(LOCALES[lang], {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(utc(day));
}

// --- the field ---------------------------------------------------------------------------------

export function DateInput({
  field,
  value,
  onChange,
  aria,
}: {
  field: Field;
  value: string;
  onChange: (v: string) => void;
  aria: React.AriaAttributes & { "aria-labelledby"?: string };
}) {
  const lang = useRunnerLang();
  const bounds = dateBounds(field);
  const maxYear = bounds.max ? Number(bounds.max.slice(0, 4)) : undefined;
  const shown = (v: string) => (isDay(v) ? formatDay(v, lang) : v);
  const [text, setText] = useState(() => shown(value));
  const [open, setOpen] = useState(false);
  const hintId = useId();
  // What the text stands for: a value from elsewhere (a prefill, going back) is written anew.
  const last = useRef({ value, lang });
  // biome-ignore lint/correctness/useExhaustiveDependencies: `shown` follows value and lang
  useEffect(() => {
    if (value !== last.current.value || lang !== last.current.lang) {
      last.current = { value, lang };
      setText(shown(value));
    }
  }, [value, lang]);
  const take = (typed: string, day: string | null) => {
    setText(typed);
    const v = typed.trim() ? (day ?? typed) : "";
    last.current = { value: v, lang };
    onChange(v);
  };
  const pattern = patternOf(lang);
  return (
    <div className="flex gap-2">
      <Input
        {...aria}
        aria-describedby={[hintId, aria["aria-describedby"]].filter(Boolean).join(" ")}
        value={text}
        placeholder={field.placeholder ?? pattern}
        // Digits and a mark between them; on a phone the number pad has both.
        inputMode="decimal"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        onChange={(e) => take(e.target.value, parseDay(e.target.value, lang, maxYear))}
        onBlur={() => {
          if (isDay(value)) {
            setText(formatDay(value, lang));
          }
        }}
        className="w-full sm:w-44"
      />
      <span id={hintId} className="sr-only">
        {t("calendar.format", { pattern })}
      </span>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-label={t("calendar.open")}
        title={t("calendar.open")}
        onClick={() => setOpen(true)}
        className="inline-flex h-11 shrink-0 items-center justify-center rounded-lg border border-input bg-card px-3.5 text-ink-2 transition hover:border-ember hover:text-ink"
      >
        <CalendarDays className="size-4" aria-hidden="true" />
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title={field.label} label={field.label}>
        <Calendar
          value={isDay(value) ? value : null}
          bounds={bounds}
          lang={lang}
          startView={field.startView}
          startYear={field.startYear}
          onPick={(day) => {
            take(formatDay(day, lang), day);
            setOpen(false);
          }}
        />
      </Dialog>
    </div>
  );
}

// --- the calendar ------------------------------------------------------------------------------

/** How many years a page of years shows: five rows of four. */
const YEARS = 20;

/** Arrow keys, Home/End and Page Up/Down in each view: how far the focus moves. */
function moveBy(view: DateView, key: string, shift: boolean, at: Ymd): Ymd | null {
  if (view === "days") {
    const weekday = (utc(at).getUTCDay() + 6) % 7;
    switch (key) {
      case "ArrowLeft":
        return addDays(at, -1);
      case "ArrowRight":
        return addDays(at, 1);
      case "ArrowUp":
        return addDays(at, -7);
      case "ArrowDown":
        return addDays(at, 7);
      case "Home":
        return addDays(at, -weekday);
      case "End":
        return addDays(at, 6 - weekday);
      case "PageUp":
        return addMonths(at, shift ? -12 : -1);
      case "PageDown":
        return addMonths(at, shift ? 12 : 1);
    }
    return null;
  }
  if (view === "months") {
    switch (key) {
      case "ArrowLeft":
        return addMonths(at, -1);
      case "ArrowRight":
        return addMonths(at, 1);
      case "ArrowUp":
        return addMonths(at, -3);
      case "ArrowDown":
        return addMonths(at, 3);
      case "Home":
        return addMonths(at, 1 - at.m);
      case "End":
        return addMonths(at, 12 - at.m);
      case "PageUp":
        return addMonths(at, -12);
      case "PageDown":
        return addMonths(at, 12);
    }
    return null;
  }
  const first = at.y - (((at.y % YEARS) + YEARS) % YEARS);
  const years = (n: number) => addMonths(at, n * 12);
  switch (key) {
    case "ArrowLeft":
      return years(-1);
    case "ArrowRight":
      return years(1);
    case "ArrowUp":
      return years(-4);
    case "ArrowDown":
      return years(4);
    case "Home":
      return years(first - at.y);
    case "End":
      return years(first + YEARS - 1 - at.y);
    case "PageUp":
      return years(-YEARS);
    case "PageDown":
      return years(YEARS);
  }
  return null;
}

const cell =
  "w-full rounded-full text-sm tabular-nums transition outline-offset-2 focus-visible:outline-[1.5px] focus-visible:outline-(--focus-line) focus-visible:outline-solid aria-disabled:cursor-not-allowed aria-disabled:text-ink-4 aria-disabled:line-through";

function Calendar({
  value,
  bounds,
  lang,
  startView,
  startYear,
  onPick,
}: {
  value: string | null;
  bounds: DateBounds;
  lang: Lang;
  startView?: DateView;
  startYear?: number;
  onPick: (day: string) => void;
}) {
  const today = todayOf();
  const picked = value ? fromIso(value) : null;
  const [view, setView] = useState<DateView>(picked ? "days" : (startView ?? "days"));
  const [focus, setFocus] = useState<Ymd>(() => {
    if (picked) {
      return picked;
    }
    const start = startYear
      ? { y: startYear, m: today.m, d: Math.min(today.d, daysIn(startYear, today.m)) }
      : today;
    return clamp(start, bounds);
  });
  const grid = useRef<HTMLDivElement>(null);
  // After a key or a choice the focus follows to the cell that now stands for it; the arrows
  // beside the heading keep it, so they can be pressed again and again.
  const follow = useRef(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when the cell in focus changes
  useEffect(() => {
    if (follow.current) {
      follow.current = false;
      grid.current?.querySelector<HTMLElement>('[tabindex="0"]')?.focus();
    }
  }, [focus, view]);
  const go = (next: Ymd, nextView: DateView = view, keep = false) => {
    follow.current = !keep;
    setFocus(clamp(next, bounds));
    setView(nextView);
  };
  const months = monthNames(lang);
  const first = focus.y - (((focus.y % YEARS) + YEARS) % YEARS);

  // What the arrows beside the heading do, and whether there is anything to pick that way.
  const step = view === "days" ? 1 : view === "months" ? 12 : YEARS * 12;
  const shiftTo = (n: number): Ymd => addMonths(focus, n * step);
  const span = (dir: -1 | 1): [string, string] => {
    if (view === "days") {
      const m = addMonths({ ...focus, d: 1 }, dir);
      return [toIso(m), toIso({ ...m, d: daysIn(m.y, m.m) })];
    }
    const y0 = view === "months" ? focus.y + dir : first + dir * YEARS;
    const y1 = view === "months" ? y0 : y0 + YEARS - 1;
    return [`${pad(y0, 4)}-01-01`, `${pad(y1, 4)}-12-31`];
  };
  const blocked = (dir: -1 | 1) => outside(...span(dir), bounds);
  const heading =
    view === "days"
      ? `${months[focus.m - 1]} ${focus.y}`
      : view === "months"
        ? String(focus.y)
        : `${first} – ${first + YEARS - 1}`;

  const onKeyDown = (e: React.KeyboardEvent) => {
    const next = moveBy(view, e.key, e.shiftKey, focus);
    if (next) {
      e.preventDefault();
      go(next);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <IconButton
          label={t(`calendar.prev.${view}`)}
          disabled={blocked(-1)}
          onClick={() => go(shiftTo(-1), view, true)}
        >
          <ChevronLeft className="size-4" />
        </IconButton>
        <div className="flex items-center gap-1" aria-live="polite">
          {view === "days" ? (
            <button
              type="button"
              onClick={() => go(focus, "months")}
              aria-label={`${t("calendar.pickMonth")}: ${months[focus.m - 1]}`}
              className="h-10 rounded-full px-3 font-medium text-[0.9375rem] transition hover:bg-paper-2 coarse:h-11"
            >
              {months[focus.m - 1]}
            </button>
          ) : null}
          {view === "years" ? (
            <span className="px-3 font-medium text-[0.9375rem] tabular-nums">{heading}</span>
          ) : (
            <button
              type="button"
              onClick={() => go(focus, "years")}
              aria-label={`${t("calendar.pickYear")}: ${focus.y}`}
              className="h-10 rounded-full px-3 font-medium text-[0.9375rem] tabular-nums transition hover:bg-paper-2 coarse:h-11"
            >
              {focus.y}
            </button>
          )}
        </div>
        <IconButton
          label={t(`calendar.next.${view}`)}
          disabled={blocked(1)}
          onClick={() => go(shiftTo(1), view, true)}
        >
          <ChevronRight className="size-4" />
        </IconButton>
      </div>
      <div ref={grid} onKeyDown={onKeyDown}>
        {view === "days" ? (
          <DayGrid
            focus={focus}
            picked={picked}
            today={today}
            bounds={bounds}
            lang={lang}
            label={heading}
            onPick={(day) => onPick(toIso(day))}
          />
        ) : view === "months" ? (
          <fieldset
            aria-label={heading}
            className="m-0 grid min-w-0 grid-cols-3 gap-2 border-0 p-0"
          >
            {months.map((name, i) => {
              const m = i + 1;
              const off = outside(
                toIso({ y: focus.y, m, d: 1 }),
                toIso({ y: focus.y, m, d: daysIn(focus.y, m) }),
                bounds,
              );
              const on = picked?.y === focus.y && picked.m === m;
              return (
                <button
                  key={name}
                  type="button"
                  tabIndex={m === focus.m ? 0 : -1}
                  data-autofocus={m === focus.m ? "" : undefined}
                  aria-pressed={on}
                  aria-disabled={off || undefined}
                  onClick={() => {
                    if (!off) {
                      go({ y: focus.y, m, d: Math.min(focus.d, daysIn(focus.y, m)) }, "days");
                    }
                  }}
                  className={cn(cell, "h-11", on ? "bg-ember text-ember-on" : "hover:bg-paper-2")}
                >
                  {name}
                </button>
              );
            })}
          </fieldset>
        ) : (
          <fieldset
            aria-label={heading}
            className="m-0 grid min-w-0 grid-cols-4 gap-2 border-0 p-0"
          >
            {Array.from({ length: YEARS }, (_, i) => {
              const y = first + i;
              const off = outside(`${pad(y, 4)}-01-01`, `${pad(y, 4)}-12-31`, bounds);
              const on = picked?.y === y;
              return (
                <button
                  key={y}
                  type="button"
                  tabIndex={y === focus.y ? 0 : -1}
                  data-autofocus={y === focus.y ? "" : undefined}
                  aria-pressed={on}
                  aria-disabled={off || undefined}
                  onClick={() => {
                    if (!off) {
                      go({ y, m: focus.m, d: Math.min(focus.d, daysIn(y, focus.m)) }, "months");
                    }
                  }}
                  className={cn(
                    cell,
                    "h-11",
                    on ? "bg-ember text-ember-on" : "hover:bg-paper-2",
                    y === today.y && !on && "ring-1 ring-border",
                  )}
                >
                  {y}
                </button>
              );
            })}
          </fieldset>
        )}
      </div>
    </div>
  );
}

function DayGrid({
  focus,
  picked,
  today,
  bounds,
  lang,
  label,
  onPick,
}: {
  focus: Ymd;
  picked: Ymd | null;
  today: Ymd;
  bounds: DateBounds;
  lang: Lang;
  label: string;
  onPick: (day: Ymd) => void;
}) {
  const weekdays = weekdayNames(lang);
  const lead = (utc({ ...focus, d: 1 }).getUTCDay() + 6) % 7;
  const count = daysIn(focus.y, focus.m);
  const cells: (number | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: count }, (_, i) => i + 1),
  ];
  while (cells.length % 7) {
    cells.push(null);
  }
  const rows = Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));
  const same = (a: Ymd | null, d: number) => a?.y === focus.y && a.m === focus.m && a.d === d;
  return (
    <table aria-label={label} className="w-full table-fixed border-collapse">
      <thead>
        <tr>
          {weekdays.map((w) => (
            <th
              key={w.long}
              scope="col"
              abbr={w.long}
              className="pb-1 font-normal text-[0.75rem] text-ink-3"
            >
              {w.short}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.find((d) => d !== null)}>
            {row.map((d, i) => {
              if (d === null) {
                return <td key={`empty-${i}`} />;
              }
              const day = { y: focus.y, m: focus.m, d };
              const iso = toIso(day);
              const off = outside(iso, iso, bounds);
              const on = same(picked, d);
              return (
                <td key={d} className="p-0.5">
                  <button
                    type="button"
                    tabIndex={d === focus.d ? 0 : -1}
                    data-autofocus={d === focus.d ? "" : undefined}
                    data-day={iso}
                    aria-label={dayLabel(day, lang)}
                    aria-pressed={on}
                    aria-current={same(today, d) ? "date" : undefined}
                    aria-disabled={off || undefined}
                    onClick={() => {
                      if (!off) {
                        onPick(day);
                      }
                    }}
                    className={cn(
                      cell,
                      "h-10 coarse:h-11",
                      on ? "bg-ember text-ember-on" : "hover:bg-paper-2",
                      same(today, d) && !on && "ring-1 ring-ember",
                    )}
                  >
                    {d}
                  </button>
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
