import { ArrowRight } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { EngentyLogoMark } from "../engenty/logo";
import { t } from "../lib/i18n";
import { cn } from "../ui";

// The parts of the studio's front doors that stand on the blue ground: the team's first visit
// (OnboardingPage) and a guest's first wizard (FirstWizard).

/** The ground the wizard stands on and the text on white, as on the landing page and the setup. */
export const GROUND = "oklch(50% 0.2 262)";
export const GROUND_INK = "oklch(32% 0.15 262)";
export const CREAM = "oklch(90% 0.1 80)";

export const ON_GROUND = {
  "--on": "white",
  "--dot": CREAM,
  "--ink-2": "oklch(96% 0.02 262)",
  "--ink-3": "oklch(90% 0.035 262)",
  "--moss": "oklch(90% 0.14 150)",
  "--rose": "oklch(89% 0.09 45)",
} as CSSProperties;

export const FIELD =
  "w-full rounded-[18px] border border-white/30 bg-white/15 px-6 py-5 text-[1.375rem] text-white outline-none placeholder:text-white/55 focus:border-white/60";

export function Wordmark() {
  return (
    <span className="inline-flex items-center gap-2.5">
      <EngentyLogoMark size={28} />
      <span className="font-display font-semibold text-[1.0625rem] tracking-tight">
        engenty
        <span className="mr-[0.09em] ml-[0.06em] text-(color:--dot)">.</span>
        <span className="font-normal text-white/70">wizards</span>
      </span>
    </span>
  );
}

/** The white pill that moves the wizard on. */
export function Next({
  children,
  busy,
  onClick,
  type = "button",
}: {
  children: ReactNode;
  busy?: boolean;
  onClick?: () => void;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      disabled={busy}
      onClick={onClick}
      className="inline-flex h-13 cursor-pointer items-center gap-2.5 rounded-full bg-white px-7 font-semibold text-[1rem] transition hover:bg-white/90 disabled:cursor-default disabled:opacity-70"
      style={{ color: GROUND_INK }}
    >
      {children}
      <ArrowRight className="size-[18px]" />
    </button>
  );
}

/** The quiet way on, beside the pill: skip, or another way to answer. */
export function Quiet({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="cursor-pointer font-semibold text-[0.9375rem] text-white/85 transition hover:text-white"
    >
      {children}
    </button>
  );
}

/** Dots: where the person stands in the wizard, out of `of`. */
export function Dots({ step, of = 4 }: { step: number; of?: number }) {
  return (
    <span
      className="ml-auto inline-flex gap-1.5"
      role="img"
      aria-label={t("onboard.step", { n: step })}
    >
      {Array.from({ length: of }, (_, i) => i + 1).map((n) => (
        <span
          key={n}
          className={cn("size-2 rounded-full", n === step ? "bg-white" : "bg-white/40")}
        />
      ))}
    </span>
  );
}

export const SMALL_FIELD =
  "w-full rounded-[14px] border border-white/30 bg-white/15 px-4 py-3 text-[1.0625rem] text-white outline-none placeholder:text-white/55 focus:border-white/60";

/** One of the four answers to "what for": a card that shows when it is picked. */
export function Choice({
  picked,
  label,
  sub,
  onClick,
}: {
  picked: boolean;
  label: string;
  sub: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={picked}
      onClick={onClick}
      className={cn(
        "flex cursor-pointer flex-col gap-1 rounded-[18px] border px-5 py-4 text-left transition",
        picked ? "border-white bg-white/25" : "border-white/30 bg-white/10 hover:bg-white/15",
      )}
    >
      <span className="font-display font-semibold text-[1.125rem]">{label}</span>
      <span className="text-[0.875rem] text-white/80">{sub}</span>
    </button>
  );
}

/** Pick one: the club's kind, a range, a role. */
export function Chips<T extends string>({
  label,
  options,
  value,
  text,
  onChange,
}: {
  label: string;
  options: readonly T[];
  value: string | null;
  text: (id: T) => string;
  onChange: (id: T) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-[0.9375rem] text-white/85">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((id) => (
          <button
            key={id}
            type="button"
            aria-pressed={value === id}
            onClick={() => onChange(id)}
            className={cn(
              "cursor-pointer rounded-full border px-4 py-2 text-[0.9375rem] transition",
              value === id ? "border-white bg-white" : "border-white/30 hover:bg-white/15",
            )}
            style={value === id ? { color: GROUND_INK } : undefined}
          >
            {text(id)}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
