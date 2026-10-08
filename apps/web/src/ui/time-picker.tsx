import { Clock } from "lucide-react";
import { type KeyboardEvent, useLayoutEffect, useRef } from "react";
import { t } from "../lib/i18n";
import { usePopover } from "./date-picker";
import { cn } from "./index";

/**
 * Picking a time of day, in the studio's look: a field that opens an hour and a minute column
 * below it. Times are "HH:MM", 24 hours. The arrow keys on the field move it by `step`.
 */

const pad = (n: number) => String(n).padStart(2, "0");
const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;
const minutesOf = (time: string) => {
  const m = TIME.exec(time);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
const timeOf = (minutes: number) => {
  const day = ((minutes % 1440) + 1440) % 1440;
  return `${pad(Math.floor(day / 60))}:${pad(day % 60)}`;
};

export function TimePicker({
  value,
  onChange,
  step = 5,
  disabled,
  placeholder = "--:--",
  compact,
  className,
  id,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  /** Minutes between two choices, and what an arrow key moves by. */
  step?: number;
  disabled?: boolean;
  placeholder?: string;
  /** A narrow field without the clock, as high as a small button. */
  compact?: boolean;
  className?: string;
  id?: string;
  /** For people who cannot see the field's label. */
  label?: string;
}) {
  const { open, setOpen, close, anchor, panel, place } = usePopover();
  const current = minutesOf(value);
  const hour = current === null ? null : Math.floor(current / 60);
  const minute = current === null ? null : current % 60;
  const minutes = Array.from({ length: Math.ceil(60 / step) }, (_, i) => i * step);
  // A time off the raster (typed elsewhere) still shows as chosen.
  if (minute !== null && !minutes.includes(minute)) {
    minutes.push(minute);
    minutes.sort((a, b) => a - b);
  }

  const nudge = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") {
      return;
    }
    event.preventDefault();
    const base = current ?? 9 * 60;
    const by = event.key === "ArrowUp" ? step : -step;
    // From a time off the raster, the first press lands on it.
    const next = base % step ? Math[by > 0 ? "ceil" : "floor"](base / step) * step : base + by;
    onChange(timeOf(next));
  };

  return (
    <div className={cn("relative min-w-0", className)}>
      <button
        ref={anchor}
        id={id}
        type="button"
        disabled={disabled}
        aria-label={label ? `${label}: ${value || placeholder}` : undefined}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        onKeyDown={nudge}
        className={cn(
          "flex w-full min-w-0 items-center rounded-lg border border-input bg-card text-ink tabular-nums outline-none transition hover:border-ink-4 focus-visible:border-focus focus-visible:ring-4 focus-visible:ring-focus-glow disabled:pointer-events-none disabled:opacity-60",
          compact
            ? "h-9 justify-center px-2 text-[14px] coarse:h-11"
            : "h-11 gap-2.5 px-3 text-left text-[0.9375rem]",
          open && "border-focus ring-4 ring-focus-glow",
        )}
      >
        {compact ? null : <Clock className="size-4 shrink-0 text-ink-3" />}
        <span className={cn("min-w-0 truncate", !value && "text-ink-4")}>
          {value || placeholder}
        </span>
      </button>
      {open ? (
        <div
          ref={panel}
          role="dialog"
          aria-label={label ?? t("time.pick")}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              close();
            }
          }}
          className="fixed z-50 flex animate-rise gap-1 rounded-xl bg-card p-1.5 shadow-overlay ring-1 ring-border-soft"
          style={place ? { top: place.top, left: place.left } : { visibility: "hidden" }}
        >
          <Column
            label={t("time.hour")}
            items={Array.from({ length: 24 }, (_, h) => h)}
            chosen={hour}
            onPick={(h) => onChange(timeOf(h * 60 + (minute ?? 0)))}
          />
          <div className="w-px self-stretch bg-border-soft" />
          <Column
            label={t("time.minute")}
            items={minutes}
            chosen={minute}
            onPick={(m) => {
              onChange(timeOf((hour ?? 9) * 60 + m));
              close();
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

/** One column of numbers, scrolled so the chosen one stands in the middle when it opens. */
function Column({
  label,
  items,
  chosen,
  onPick,
}: {
  label: string;
  items: number[];
  chosen: number | null;
  onPick: (n: number) => void;
}) {
  const list = useRef<HTMLDivElement>(null);
  // Only when the column opens: picking does not scroll it away from the pointer.
  useLayoutEffect(() => {
    const el = list.current?.querySelector<HTMLElement>("[aria-selected=true]");
    if (el && list.current) {
      list.current.scrollTop = el.offsetTop - list.current.clientHeight / 2 + el.clientHeight / 2;
    }
  }, []);
  return (
    <div
      ref={list}
      role="listbox"
      aria-label={label}
      className="flex max-h-56 w-14 flex-col gap-0.5 overflow-y-auto overscroll-contain [scrollbar-width:none]"
    >
      {items.map((n) => (
        <button
          key={n}
          type="button"
          role="option"
          aria-selected={n === chosen}
          onClick={() => onPick(n)}
          className={cn(
            "h-8 shrink-0 rounded-md text-[14px] tabular-nums transition",
            n === chosen
              ? "bg-primary font-medium text-primary-foreground"
              : "text-ink-2 hover:bg-paper-2 hover:text-ink",
          )}
        >
          {pad(n)}
        </button>
      ))}
    </div>
  );
}
