import { Check, LayoutGrid, List, Search } from "lucide-react";
import type { ReactNode } from "react";
import { t } from "../../lib/i18n";
import { Card, cn, IconButton, Spinner } from "../../ui";
import type { Layout, SaveState } from "./data";

/**
 * Where the sections menu jumps to (`projectSections`): the section's heading lands below the
 * sticky top bar, and below the section picker on narrow screens.
 */
export function Anchor({ id, children }: { id: string; children: ReactNode }) {
  return (
    <div id={id} className="scroll-mt-24 max-md:scroll-mt-36">
      {children}
    </div>
  );
}

/**
 * One section of the space page, as engenty lays them out: the heading and what the section is
 * for stand above the card, the card holds the content. The heading says how the last save went.
 * `plain`: the content draws its own cards, as a plugin's section does.
 */
export function Section({
  title,
  hint,
  save,
  action,
  locked,
  plain,
  children,
}: {
  title: string;
  hint?: string;
  save?: { state: SaveState; error: string | null };
  action?: ReactNode;
  /** The project is not changed here: every field and button of the section shows and takes nothing. */
  locked?: boolean;
  plain?: boolean;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex items-start justify-between gap-4 px-1">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <h2 className="font-display font-semibold text-lg leading-tight">{title}</h2>
            {save?.state === "saving" ? (
              <span className="inline-flex items-center gap-1.5 text-[0.75rem] text-ink-3">
                <Spinner className="size-3" /> {t("project.saving")}
              </span>
            ) : save?.state === "saved" ? (
              <span className="inline-flex items-center gap-1 text-[0.75rem] text-moss">
                <Check className="size-3.5" /> {t("settings.saved")}
              </span>
            ) : null}
          </div>
          {hint ? <p className="mt-1 text-[0.875rem] text-ink-3 leading-snug">{hint}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {plain ? (
        children
      ) : (
        <Card className="p-3.5 sm:p-5">
          {locked ? (
            <fieldset disabled className="min-w-0">
              {children}
            </fieldset>
          ) : (
            children
          )}
          {save?.state === "error" && save.error ? (
            <p className="mt-4 text-[0.875rem] text-rose">{save.error}</p>
          ) : null}
        </Card>
      )}
    </section>
  );
}

/**
 * The row above a list: a search field, and one icon that switches between list and cards (it
 * shows the other layout).
 */
export function ListControls({
  children,
  layout,
  onToggle,
}: {
  children: ReactNode;
  layout: Layout;
  onToggle: () => void;
}) {
  return (
    <div className="mb-3 flex items-start gap-2">
      {/* The search is small until it is used: it grows with the focus and stays so while it holds a question. */}
      <div className="min-w-0 flex-1">
        <div className="w-56 max-w-full transition-[width] duration-200 focus-within:w-full has-[input:not(:placeholder-shown)]:w-full">
          {children}
        </div>
      </div>
      <IconButton
        label={layout === "list" ? t("project.viewCards") : t("project.viewList")}
        onClick={onToggle}
      >
        {layout === "list" ? <LayoutGrid className="size-4" /> : <List className="size-4" />}
      </IconButton>
    </div>
  );
}

/** A small search field with the magnifier in it. */
export function SearchField({
  value,
  onChange,
  onEnter,
  placeholder,
  busy,
}: {
  value: string;
  onChange: (value: string) => void;
  onEnter?: () => void;
  placeholder: string;
  busy?: boolean;
}) {
  return (
    <div className="relative">
      <Search className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3 size-4 text-ink-4" />
      <input
        type="search"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onEnter?.()}
        className="h-9 w-full rounded-lg border border-input bg-card pr-3 pl-9 text-[0.875rem] text-ink outline-none transition placeholder:text-ink-4 focus:border-focus focus:ring-4 focus:ring-focus-glow"
      />
      {busy ? (
        <Spinner className="-translate-y-1/2 absolute top-1/2 right-3 size-4 text-ink-3" />
      ) : null}
    </div>
  );
}

/** Takes files by a click or by dropping them on it. */
export function DropArea({
  onFiles,
  accept,
  multiple = true,
  className,
  children,
}: {
  onFiles: (files: File[]) => void;
  accept?: string;
  multiple?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label
      onDragOver={(e) => {
        e.preventDefault();
        e.currentTarget.dataset.over = "1";
      }}
      onDragLeave={(e) => {
        delete e.currentTarget.dataset.over;
      }}
      onDrop={(e) => {
        e.preventDefault();
        delete e.currentTarget.dataset.over;
        const files = Array.from(e.dataTransfer.files);
        if (files.length) {
          onFiles(multiple ? files : files.slice(0, 1));
        }
      }}
      className={cn(
        "flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-input border-dashed text-[0.875rem] text-ink-3 transition focus-within:border-focus focus-within:ring-4 focus-within:ring-focus-glow hover:border-ink-4 hover:text-ink data-[over]:border-focus data-[over]:bg-paper-2 data-[over]:text-ink",
        className,
      )}
    >
      {children}
      <input
        className="sr-only"
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (files.length) {
            onFiles(files);
          }
        }}
      />
    </label>
  );
}
