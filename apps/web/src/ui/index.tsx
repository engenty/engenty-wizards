import {
  type ButtonHTMLAttributes,
  forwardRef,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
  useEffect,
  useLayoutEffect,
  useRef,
} from "react";
import { t } from "../lib/i18n";

export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

type Variant = "primary" | "secondary" | "ghost" | "quiet" | "danger";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-primary text-primary-foreground hover:brightness-[1.06] active:brightness-95 shadow-[0_1px_0_oklch(0%_0_0/0.08)]",
  secondary: "bg-card text-ink border border-border hover:bg-paper-2",
  ghost: "text-ink-2 hover:text-ink hover:bg-accent",
  quiet: "bg-paper-2 text-ink hover:bg-paper-3",
  danger: "text-rose hover:bg-rose-tint",
};

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: Variant;
    size?: "sm" | "md" | "lg";
    busy?: boolean;
  }
>(function Button(
  { variant = "primary", size = "md", busy, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      disabled={disabled || busy}
      className={cn(
        "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-full font-medium transition-[background,filter,color,transform] duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50",
        size === "sm" && "h-8 px-3 text-[13px] coarse:h-11 coarse:px-4",
        size === "md" && "h-10 px-4 text-sm coarse:h-11",
        size === "lg" && "h-12 px-6 text-[15px]",
        VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      {busy ? <Spinner className="size-4" /> : null}
      {children}
    </button>
  );
});

export function IconButton({
  label,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex size-9 shrink-0 items-center justify-center rounded-full text-ink-3 transition hover:bg-accent hover:text-ink disabled:opacity-40 coarse:size-11",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

const fieldBase =
  "rounded-lg border border-input bg-card px-3.5 text-[15px] text-ink shadow-[inset_0_1px_0_oklch(0%_0_0/0.02)] outline-none transition placeholder:text-ink-4 focus:border-focus focus:ring-4 focus:ring-focus-glow disabled:opacity-60";

/** A field fills its row unless the caller gives it a width. */
function fieldWidth(className?: string) {
  return /(^|\s)w-/.test(className ?? "") ? null : "w-full";
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...rest }, ref) {
    return (
      <input
        ref={ref}
        className={cn(fieldBase, fieldWidth(className), "h-11", className)}
        {...rest}
      />
    );
  },
);

/** The native colour picker as a swatch; its chip sits concentric in the frame. */
export function Swatch(props: Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "className">) {
  return (
    <input
      type="color"
      className="swatch size-11 shrink-0 cursor-pointer rounded-lg border border-input bg-card p-1"
      {...props}
    />
  );
}

/** A textarea that grows with its content. */
export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement> & { minRows?: number; maxRows?: number }
>(function Textarea({ className, minRows = 3, maxRows = 14, onChange, ...rest }, outer) {
  const inner = useRef<HTMLTextAreaElement | null>(null);
  const resize = () => {
    const el = inner.current;
    if (!el) {
      return;
    }
    const lh = Number.parseFloat(getComputedStyle(el).lineHeight) || 22;
    el.style.height = "auto";
    const max = lh * maxRows + 20;
    el.style.height = `${Math.min(Math.max(el.scrollHeight, lh * minRows + 20), max)}px`;
    el.style.overflowY = el.scrollHeight > max ? "auto" : "hidden";
  };
  useLayoutEffect(resize);
  return (
    <textarea
      ref={(el) => {
        inner.current = el;
        if (typeof outer === "function") {
          outer(el);
        } else if (outer) {
          outer.current = el;
        }
      }}
      className={cn(
        fieldBase,
        fieldWidth(className),
        "resize-none py-2.5 leading-[1.5]",
        className,
      )}
      onChange={(e) => {
        resize();
        onChange?.(e);
      }}
      {...rest}
    />
  );
});

export function Select({
  value,
  onChange,
  options,
  className,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string; disabled?: boolean }[];
  className?: string;
  placeholder?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(fieldBase, "h-11 w-full appearance-none pr-9")}
      >
        {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
      <svg
        className="-translate-y-1/2 pointer-events-none absolute top-1/2 right-3 size-4 text-ink-3"
        viewBox="0 0 16 16"
        fill="none"
      >
        <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </div>
  );
}

/** Pills for a handful of options — calmer than a dropdown. */
export function Segmented({
  value,
  onChange,
  options,
  multi,
}: {
  value: string | string[];
  onChange: (v: any) => void;
  options: string[];
  multi?: boolean;
}) {
  const selected = new Set(Array.isArray(value) ? value : value ? [value] : []);
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = selected.has(o);
        return (
          <button
            key={o}
            type="button"
            aria-pressed={on}
            onClick={() => {
              if (multi) {
                const next = new Set(selected);
                if (on) {
                  next.delete(o);
                } else {
                  next.add(o);
                }
                onChange(options.filter((x) => next.has(x)));
              } else {
                onChange(o);
              }
            }}
            className={cn(
              "h-10 rounded-full border px-4 text-sm transition coarse:h-11",
              on
                ? "border-ember bg-ember-tint text-ink"
                : "border-input bg-card text-ink-2 hover:border-ink-4 hover:text-ink",
            )}
          >
            {o}
          </button>
        );
      })}
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        // The track stays slim; the tap area around it is a full 44 px.
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition before:absolute before:-inset-x-1 before:-inset-y-2.5 before:content-['']",
        checked ? "bg-primary" : "bg-paper-3",
      )}
    >
      <span
        className={cn(
          "inline-block size-5 rounded-full bg-white shadow-sm transition-transform",
          checked ? "translate-x-[22px]" : "translate-x-[2px]",
        )}
      />
    </button>
  );
}

export function Label({
  children,
  hint,
  required,
}: {
  children: ReactNode;
  hint?: ReactNode;
  required?: boolean;
}) {
  return (
    <div className="mb-2">
      <div className="font-medium text-[14px] text-ink">
        {children}
        {required ? <span className="ml-1 text-ember">*</span> : null}
      </div>
      {hint ? <div className="mt-0.5 text-[13px] text-ink-3">{hint}</div> : null}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cn("size-5 animate-spin", className)} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function Card({
  className,
  children,
  ...rest
}: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-xl bg-card shadow-soft ring-1 ring-border-soft", className)}
      {...rest}
    >
      {children}
    </div>
  );
}

export function Chip({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "live" | "warn" | "ember";
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 font-medium text-[12px]",
        tone === "neutral" && "bg-paper-2 text-ink-2",
        tone === "live" && "bg-moss-tint text-moss",
        tone === "warn" && "bg-amber-tint text-ink-2",
        tone === "ember" && "bg-ember-tint text-ember-strong",
      )}
    >
      {tone === "live" ? <span className="size-1.5 rounded-full bg-moss" /> : null}
      {children}
    </span>
  );
}

/** A centred modal on the native <dialog>. */
export function Dialog({
  open,
  onClose,
  title,
  children,
  wide,
  bare,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  wide?: boolean;
  /**
   * The children are the panel: the dialog itself draws no card, clips nothing (a close button
   * may sit on the panel's edge) and fills the screen of a phone.
   */
  bare?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) {
      return;
    }
    if (open && !el.open) {
      el.showModal();
    } else if (!open && el.open) {
      el.close();
    }
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) {
          onClose();
        }
      }}
      className={cn(
        "m-auto p-0 text-ink backdrop:bg-[oklch(20%_0.01_60/0.28)] backdrop:backdrop-blur-[2px]",
        bare
          ? "w-[calc(100%-48px)] overflow-visible bg-transparent max-sm:m-0 max-sm:h-dvh max-sm:max-h-none max-sm:w-full max-sm:max-w-none"
          : "max-h-[calc(100dvh-32px)] w-[calc(100%-32px)] overflow-y-auto overscroll-contain rounded-2xl bg-card shadow-overlay",
        wide ? "sm:max-w-2xl" : "sm:max-w-md",
        !bare && (wide ? "max-w-2xl" : "max-w-md"),
      )}
    >
      {open && bare ? (
        children
      ) : open ? (
        <div className="p-5 sm:p-7">
          {title ? (
            <div className="mb-5 flex items-start justify-between gap-3">
              <h2 className="min-w-0 font-display font-semibold text-xl">{title}</h2>
              <IconButton label={t("common.close")} onClick={onClose} className="-mt-1.5 -mr-2">
                <svg viewBox="0 0 16 16" fill="none" className="size-4" aria-hidden="true">
                  <path
                    d="M4 4l8 8M12 4l-8 8"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </IconButton>
            </div>
          ) : null}
          {children}
        </div>
      ) : null}
    </dialog>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="py-16 text-center text-ink-3">{children}</div>;
}
