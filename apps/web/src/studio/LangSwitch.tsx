import { isLang, LANG_NAMES, LANGS } from "@engenty-wizards/shared/definition";
import { useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { type Lang, localSide, t, useLang } from "../lib/i18n";
import { usePickLang } from "../lib/session";
import { cn, Select } from "../ui";

/** Inner padding of each option, either side. */
const PAD_X = 12;
const EASE = "cubic-bezier(0.3, 0.7, 0.2, 1)";

const NARROW = "(max-width: 639px)";
/** A phone's width: there the switch names both languages by their code, EN · DE. */
function useNarrow(): boolean {
  return useSyncExternalStore(
    (listener) => {
      const query = window.matchMedia(NARROW);
      query.addEventListener("change", listener);
      return () => query.removeEventListener("change", listener);
    },
    () => window.matchMedia(NARROW).matches,
    () => false,
  );
}

/**
 * English and the person's own language (`localSide`), EN · DE as on the landing page: the
 * language in effect is lit and named in full. A thumb slides to the pick while the options grow
 * and shrink to their labels, and the app turns to that language in place. Nothing where the
 * person has no language beside English: the account page picks among all of them.
 * `ground`: on a vivid page; `surface`: on a card or menu.
 */
export function LangSwitch({
  tone = "ground",
  ink,
}: {
  tone?: "ground" | "surface";
  /** The text on the thumb of a `ground` switch: the page's colour, deep. */
  ink?: string;
}) {
  const lang = useLang();
  const pickLang = usePickLang();
  const narrow = useNarrow();
  const probes = useRef<Record<string, HTMLSpanElement | null>>({});
  const [sizes, setSizes] = useState<Record<string, number> | null>(null);
  const local = localSide();
  const langs: Lang[] = local ? ["en", local] : [];

  // The labels' widths as rendered; again once the web font is in.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the labels to measure follow the other side
  useLayoutEffect(() => {
    const measure = () => {
      const next: Record<string, number> = {};
      for (const [key, el] of Object.entries(probes.current)) {
        next[key] = el ? Math.ceil(el.getBoundingClientRect().width) : 0;
      }
      setSizes(next);
    };
    measure();
    void document.fonts?.ready.then(measure);
  }, [local]);

  const width = (code: Lang) =>
    sizes
      ? sizes[code === lang && !narrow ? `${code}-full` : `${code}-short`] + PAD_X * 2
      : undefined;
  const offset = sizes
    ? langs.slice(0, langs.indexOf(lang)).reduce((sum, code) => sum + (width(code) ?? 0), 0)
    : 0;
  const timing = `300ms ${EASE}`;
  const ground = tone === "ground";

  if (!local) {
    return null;
  }

  return (
    <fieldset
      className={cn(
        "relative inline-flex items-center rounded-full border-0 p-0.5 ring-1",
        ground ? "bg-white/10 ring-white/15" : "bg-paper-2 ring-border-soft",
      )}
    >
      <legend className="sr-only">{t("nav.language")}</legend>
      {sizes ? (
        <span
          aria-hidden="true"
          className={cn(
            "absolute top-0.5 bottom-0.5 left-0.5 rounded-full shadow-sm motion-reduce:transition-none",
            ground ? "bg-white" : "bg-card",
          )}
          style={{
            width: width(lang),
            transform: `translateX(${offset}px)`,
            transition: `transform ${timing}, width ${timing}`,
          }}
        />
      ) : null}
      {langs.map((code) => {
        const selected = code === lang;
        return (
          <button
            aria-pressed={selected}
            className={cn(
              "relative h-7 cursor-pointer overflow-hidden whitespace-nowrap rounded-full font-medium text-[0.75rem] motion-reduce:transition-none",
              ground
                ? selected
                  ? "text-[oklch(32%_0.15_262)]"
                  : "text-white/70"
                : selected
                  ? "text-ink"
                  : "text-ink-3",
            )}
            key={code}
            lang={code}
            onClick={() => {
              pickLang(code);
            }}
            style={{
              width: width(code),
              transition: `width ${timing}, color ${timing}`,
              ...(ground && selected && ink ? { color: ink } : {}),
            }}
            title={LANG_NAMES[code]}
            type="button"
          >
            {[LANG_NAMES[code], code.toUpperCase()].map((text, i) => {
              const shown = selected && !narrow ? i === 0 : i === 1;
              return (
                <span
                  key={text}
                  aria-hidden={!shown}
                  className="absolute inset-0 grid place-items-center motion-reduce:transition-none"
                  style={{ opacity: shown ? 1 : 0, transition: `opacity 220ms ${EASE}` }}
                >
                  {text}
                </span>
              );
            })}
            {/* Measured, never seen: the label widths the options size to. */}
            <span
              ref={(el) => {
                probes.current[`${code}-full`] = el;
              }}
              aria-hidden="true"
              className="invisible absolute"
            >
              {LANG_NAMES[code]}
            </span>
            <span
              ref={(el) => {
                probes.current[`${code}-short`] = el;
              }}
              aria-hidden="true"
              className="invisible absolute"
            >
              {code.toUpperCase()}
            </span>
            {/* Holds the height and, before the sizes are measured, the width. */}
            <span className="invisible px-3">
              {selected ? LANG_NAMES[code] : code.toUpperCase()}
            </span>
          </button>
        );
      })}
    </fieldset>
  );
}

/** Every language engenty speaks, for the account page: the pick also sets the switch's other side. */
export function LangPick() {
  const lang = useLang();
  const pickLang = usePickLang();
  return (
    <Select
      className="w-44"
      value={lang}
      onChange={(next) => {
        if (isLang(next)) {
          pickLang(next);
        }
      }}
      options={LANGS.map((code) => ({ value: code, label: LANG_NAMES[code] }))}
    />
  );
}
