import { Moon, Sun } from "lucide-react";
import { t } from "../lib/i18n";
import { setTheme, type Theme, useTheme } from "../lib/theme";
import { cn } from "../ui";

const THEMES = [
  { theme: "light", icon: Sun, label: "theme.light" },
  { theme: "dark", icon: Moon, label: "theme.dark" },
] as const satisfies readonly { theme: Theme; icon: typeof Sun; label: string }[];
const EASE = "cubic-bezier(0.3, 0.7, 0.2, 1)";

/** Light · dark for a card or menu, in the look of the language switch: a thumb slides to the pick. */
export function ThemeSwitch() {
  const theme = useTheme();
  const index = THEMES.findIndex((option) => option.theme === theme);
  return (
    <fieldset className="relative inline-flex items-center rounded-full border-0 bg-paper-2 p-0.5 ring-1 ring-border-soft">
      <legend className="sr-only">{t("nav.theme")}</legend>
      <span
        aria-hidden="true"
        className="absolute top-0.5 bottom-0.5 left-0.5 w-9 rounded-full bg-card shadow-sm motion-reduce:transition-none"
        style={{ transform: `translateX(${index * 36}px)`, transition: `transform 300ms ${EASE}` }}
      />
      {THEMES.map(({ theme: option, icon: Icon, label }) => (
        <button
          aria-label={t(label)}
          aria-pressed={option === theme}
          className={cn(
            "relative grid h-7 w-9 cursor-pointer place-items-center rounded-full transition-colors motion-reduce:transition-none",
            option === theme ? "text-ink" : "text-ink-3 hover:text-ink-2",
          )}
          key={option}
          onClick={() => setTheme(option)}
          title={t(label)}
          type="button"
        >
          <Icon className="size-3.5" />
        </button>
      ))}
    </fieldset>
  );
}
