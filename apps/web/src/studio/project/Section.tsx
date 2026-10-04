import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { t } from "../../lib/i18n";
import { Card, cn, Spinner } from "../../ui";
import type { SaveState } from "./data";

/**
 * One section of the project page, as engenty lays them out: the heading and what the section is
 * for stand above the card, the card holds the content. The heading says how the last save went.
 */
export function Section({
  title,
  hint,
  save,
  action,
  children,
}: {
  title: string;
  hint?: string;
  save?: { state: SaveState; error: string | null };
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex items-start justify-between gap-4 px-1">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <h2 className="font-display font-semibold text-lg leading-tight">{title}</h2>
            {save?.state === "saving" ? (
              <span className="inline-flex items-center gap-1.5 text-[12px] text-ink-3">
                <Spinner className="size-3" /> {t("project.saving")}
              </span>
            ) : save?.state === "saved" ? (
              <span className="inline-flex items-center gap-1 text-[12px] text-moss">
                <Check className="size-3.5" /> {t("settings.saved")}
              </span>
            ) : null}
          </div>
          {hint ? <p className="mt-1 text-[14px] text-ink-3 leading-snug">{hint}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <Card className="p-5">
        {children}
        {save?.state === "error" && save.error ? (
          <p className="mt-4 text-[14px] text-rose">{save.error}</p>
        ) : null}
      </Card>
    </section>
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
        "flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-input border-dashed text-[14px] text-ink-3 transition focus-within:border-focus focus-within:ring-4 focus-within:ring-focus-glow hover:border-ink-4 hover:text-ink data-[over]:border-focus data-[over]:bg-paper-2 data-[over]:text-ink",
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
