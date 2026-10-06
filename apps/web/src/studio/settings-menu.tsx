import { ChevronDown, ChevronLeft, ChevronRight, type LucideIcon } from "lucide-react";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "../ui";

/**
 * The settings' left container shows one level at a time: the sections, or — one level down —
 * the menu of the section that has one (Models, Integrate). A section hands its menu up with
 * <SubMenu>; it lands in that container, and the section's page stays the main content.
 */
export interface SettingsMenu {
  /** Where the section's menu goes. */
  slot: HTMLElement | null;
  /** The narrow layout: the menus and the page take turns instead of standing side by side. */
  narrow: boolean;
  /** What the page shows inside the section, for the trail in the top bar ("Images"). */
  setDetail: (label: string | null) => void;
}

export const SettingsMenuContext = createContext<SettingsMenu>({
  slot: null,
  narrow: false,
  setDetail: () => undefined,
});

export function useSettingsMenu(): SettingsMenu {
  return useContext(SettingsMenuContext);
}

/** The section's menu, one level down in the settings' left container. */
export function SubMenu({ children }: { children: ReactNode }) {
  const { slot } = useSettingsMenu();
  return slot ? createPortal(children, slot) : null;
}

/** Names what the page shows in the top bar's trail, while it is shown. */
export function useDetail(label: string | null) {
  const { setDetail } = useSettingsMenu();
  useEffect(() => {
    setDetail(label);
    return () => setDetail(null);
  }, [label, setDetail]);
}

const NARROW = "(max-width: 767px)";

function onNarrowChange(listener: () => void) {
  const query = window.matchMedia(NARROW);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}

/** Below `md` the menus and the page take turns. */
export function useNarrow(): boolean {
  return useSyncExternalStore(onNarrowChange, () => window.matchMedia(NARROW).matches);
}

/** The entrance of a level: deeper from the right, back from the left, as in engenty-pro. */
export function stepClass(direction: "deeper" | "back" | null): string | false {
  return direction === "deeper"
    ? "animate-step-deeper"
    : direction === "back" && "animate-step-back";
}

/** The row at the top of a deeper level: back to the level above, named. */
export function BackRow({ label, onBack }: { label: string; onBack: () => void }) {
  return (
    <button
      type="button"
      onClick={onBack}
      className="-ml-1 flex items-center gap-1 rounded-lg py-1.5 pr-3 pl-1 text-[13px] text-ink-3 transition hover:text-ink"
    >
      <ChevronLeft className="size-4" />
      {label}
    </button>
  );
}

/**
 * On a phone a step deeper comes in from the right, a step back from the left: the direction of
 * the last change of level, kept until the next one.
 */
export function useStepDirection(level: number): "deeper" | "back" | null {
  const last = useRef({ level, direction: null as "deeper" | "back" | null });
  if (level !== last.current.level) {
    last.current = { level, direction: level > last.current.level ? "deeper" : "back" };
  }
  return last.current.direction;
}

/**
 * A group of a section's menu under its small heading. `collapsible`: the heading folds it, and
 * says how many rows it holds while folded.
 */
export function MenuGroup({
  label,
  collapsible,
  open: initiallyOpen = true,
  count,
  children,
}: {
  label: string;
  collapsible?: boolean;
  open?: boolean;
  count?: number;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  const heading = "font-medium text-[11px] text-ink-4 uppercase tracking-[0.12em]";
  return (
    <div className="mt-5 first:mt-0">
      {collapsible ? (
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className={cn(
            "mb-1 flex w-full items-center gap-1 px-2 text-left hover:text-ink-2",
            heading,
          )}
        >
          <span className="flex-1">{label}</span>
          {open ? null : <span className="tabular-nums tracking-normal">{count}</span>}
          <ChevronDown
            className={cn("size-3.5 transition-transform", open ? null : "-rotate-90")}
          />
        </button>
      ) : (
        <p className={cn("mb-1 px-2", heading)}>{label}</p>
      )}
      {open ? <ul className="flex flex-col gap-0.5">{children}</ul> : null}
    </div>
  );
}

/** How a row stands, as a dot at its end: works, runs on credits, in progress, missing. */
export type MenuTone = "done" | "credits" | "on" | "off";

/** A row of a section's menu: an icon, the name, at most a badge and a dot; the rest is the page's. */
export function MenuRow({
  icon: Icon,
  label,
  badge,
  tone,
  toneLabel,
  selected,
  disabled,
  onPick,
}: {
  icon: LucideIcon;
  label: string;
  badge?: ReactNode;
  tone?: MenuTone;
  /** What the dot means, for a pointer and a screen reader. */
  toneLabel?: string;
  selected: boolean;
  disabled?: boolean;
  onPick?: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onPick}
        disabled={disabled}
        aria-current={selected ? "page" : undefined}
        className={cn(
          "group flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-[14px] transition max-md:py-2",
          selected
            ? "bg-paper-2 font-medium text-ink"
            : "text-ink-2 hover:bg-accent hover:text-ink",
          disabled && "cursor-default opacity-50 hover:bg-transparent hover:text-ink-2",
        )}
      >
        <span className="grid size-7 shrink-0 place-items-center">
          <Icon
            className={cn(
              "size-4 transition-transform duration-200 ease-out",
              !disabled && "group-hover:scale-110",
              selected ? "text-ember-strong" : "text-ink-3",
            )}
          />
        </span>
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {badge}
        {tone ? (
          <span
            role="img"
            title={toneLabel}
            aria-label={toneLabel}
            className={cn(
              "size-2 shrink-0 rounded-full",
              tone === "done" && "bg-moss",
              tone === "credits" && "bg-amber",
              tone === "on" && "bg-ember",
              tone === "off" && "ring-1 ring-ink-4 ring-inset",
            )}
          />
        ) : null}
        {/* On a phone a row goes one step deeper. */}
        {disabled ? null : <ChevronRight className="size-4 shrink-0 text-ink-4 md:hidden" />}
      </button>
    </li>
  );
}
