import { Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { t } from "../../lib/i18n";
import { cn } from "../../ui";

const HOLD_MS = 2000;

/**
 * Deleting by holding: pressed, the button turns into "Löschen" and fills up; held for two
 * seconds it deletes, let go earlier nothing happens. A short click says to hold. Space and
 * Enter hold it from the keyboard.
 */
export function HoldToDelete({ label, onDelete }: { label: string; onDelete: () => void }) {
  const [holding, setHolding] = useState(false);
  const [hint, setHint] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const done = useRef(false);
  useEffect(
    () => () => {
      for (const t of [timer.current, hintTimer.current]) {
        if (t) {
          clearTimeout(t);
        }
      }
    },
    [],
  );
  const start = () => {
    if (timer.current) {
      return;
    }
    done.current = false;
    setHint(false);
    setHolding(true);
    timer.current = setTimeout(() => {
      timer.current = null;
      done.current = true;
      setHolding(false);
      onDelete();
    }, HOLD_MS);
  };
  const stop = () => {
    if (!timer.current) {
      return;
    }
    clearTimeout(timer.current);
    timer.current = null;
    setHolding(false);
    if (!done.current) {
      setHint(true);
      if (hintTimer.current) {
        clearTimeout(hintTimer.current);
      }
      hintTimer.current = setTimeout(() => setHint(false), 1800);
    }
  };
  const open = holding || hint;
  return (
    <button
      type="button"
      aria-label={`${label} – ${t("editor.holdToDelete")}`}
      title={t("editor.holdToDelete")}
      onPointerDown={(e) => {
        if (e.button === 0) {
          start();
        }
      }}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if ((e.key === " " || e.key === "Enter") && !e.repeat) {
          e.preventDefault();
          start();
        }
      }}
      onKeyUp={(e) => {
        if (e.key === " " || e.key === "Enter") {
          stop();
        }
      }}
      onBlur={stop}
      className={cn(
        "relative inline-flex h-9 shrink-0 touch-none select-none items-center justify-center gap-1.5 overflow-hidden rounded-full text-[0.75rem] transition-[width,background,color] duration-150",
        open
          ? "w-auto px-3 text-rose ring-1 ring-rose/40"
          : "w-9 text-ink-3 hover:bg-accent hover:text-rose",
      )}
    >
      {/* The fill: grows over the hold, from nothing to the whole button. */}
      <span
        aria-hidden
        className={cn(
          "absolute inset-y-0 left-0 bg-rose/25",
          holding ? "w-full transition-[width] ease-linear" : "w-0",
        )}
        style={holding ? { transitionDuration: `${HOLD_MS}ms` } : undefined}
      />
      <Trash2 className="relative size-4" />
      {open ? (
        <span className="relative whitespace-nowrap">
          {holding ? t("editor.deleting") : t("editor.holdToDelete")}
        </span>
      ) : null}
    </button>
  );
}
