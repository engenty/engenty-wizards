import type { Format, Step } from "@shared/definition";
import type { StepOutput } from "@shared/run";
import DOMPurify from "dompurify";
import { Check, Copy, Download, FileText, Maximize2 } from "lucide-react";
import { marked } from "marked";
import { useEffect, useMemo, useRef, useState } from "react";
import { t } from "../lib/i18n";
import { cn, Textarea } from "../ui";

export function Markdown({ text, className }: { text: string; className?: string }) {
  const html = useMemo(
    () => DOMPurify.sanitize(marked.parse(text, { async: false }) as string),
    [text],
  );
  return (
    // biome-ignore lint/security/noDangerouslySetInnerHtml: model output, sanitised by DOMPurify above
    <div className={cn("prose-zen", className)} dangerouslySetInnerHTML={{ __html: html }} />
  );
}

/**
 * Generated HTML in a sandboxed frame: scripts run (scrubbers, tabs, animations) but in an opaque
 * origin with no network. The frame is mounted only once its HTML is there — Chrome paints a
 * sandboxed frame whose content changes after mount blank. `page` is the layout width; the frame
 * is scaled to fit.
 */
export function HtmlFrame({
  src,
  page,
  height,
  fit,
}: {
  src: string;
  /** Layout width in CSS px; null = the frame's own width. */
  page: number | null;
  height: number;
  /** Scale up as well as down, so a fixed-size widget fills the width. */
  fit?: boolean;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = wrap.current;
    if (!el) {
      return;
    }
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const [html, setHtml] = useState<{ src: string; text: string } | null>(null);
  useEffect(() => {
    let alive = true;
    fetch(src, { credentials: "include" })
      .then((r) => (r.ok ? r.text() : ""))
      .then((text) => alive && setHtml({ src, text }));
    return () => {
      alive = false;
    };
  }, [src]);
  const layout = page ?? Math.max(width, 900);
  const scale = width ? (fit ? width / layout : Math.min(1, width / layout)) : 1;
  return (
    <div
      ref={wrap}
      className="relative overflow-hidden rounded-lg bg-white ring-1 ring-border-soft"
      style={{ height: height * scale }}
    >
      {html?.src === src ? (
        <iframe
          key={src}
          title="preview"
          srcDoc={html.text}
          sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
          className="absolute top-0 left-0 origin-top-left border-0"
          style={{ width: layout, height, transform: `scale(${scale})` }}
        />
      ) : (
        <div className="absolute inset-0 animate-pulse bg-paper-2" />
      )}
      <a
        href={src}
        target="_blank"
        rel="noreferrer"
        className="absolute top-3 right-3 inline-flex size-9 items-center justify-center rounded-full bg-card/90 text-ink-2 shadow-soft ring-1 ring-border-soft backdrop-blur hover:text-ink"
        aria-label="Open"
      >
        <Maximize2 className="size-4" />
      </a>
    </div>
  );
}

function labelFor(step: Step, key: string): string {
  if (step.type === "agent") {
    return step.output.fields?.find((f) => f.id === key)?.description ?? key;
  }
  return key;
}

function JsonView({ step, json }: { step: Step; json: unknown }) {
  if (!json || typeof json !== "object") {
    return <pre className="text-[13px]">{JSON.stringify(json, null, 2)}</pre>;
  }
  return (
    <div className="flex flex-col gap-4">
      {Object.entries(json as Record<string, unknown>).map(([key, v]) => (
        <div key={key}>
          <div className="mb-1 font-medium text-[12px] text-ink-3 uppercase tracking-[0.06em]">
            {labelFor(step, key)}
          </div>
          {typeof v === "string" || typeof v === "number" ? (
            <div className="whitespace-pre-wrap text-[15px]">{String(v)}</div>
          ) : Array.isArray(v) && v.every((x) => typeof x !== "object") ? (
            <ul className="list-disc pl-5 text-[14px]">
              {v.map((x, i) => (
                <li key={i} className="break-words">
                  {String(x)}
                </li>
              ))}
            </ul>
          ) : Array.isArray(v) && v.length && typeof v[0] === "object" ? (
            <Table rows={v as Record<string, unknown>[]} />
          ) : (
            <pre className="overflow-auto rounded-lg bg-paper-2 p-3 text-[12px]">
              {JSON.stringify(v, null, 2)}
            </pre>
          )}
        </div>
      ))}
    </div>
  );
}

function Table({ rows }: { rows: Record<string, unknown>[] }) {
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  return (
    <div className="overflow-x-auto rounded-lg ring-1 ring-border-soft">
      <table className="w-full text-[13px]">
        <thead className="bg-paper-2 text-ink-2">
          <tr>
            {cols.map((c) => (
              <th key={c} className="px-3 py-2 text-left font-medium">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-border-soft border-t">
              {cols.map((c) => (
                <td key={c} className="px-3 py-2 tabular-nums">
                  {r[c] === null || r[c] === undefined ? "" : String(r[c])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
      className="inline-flex h-8 items-center gap-1.5 rounded-full bg-paper-2 px-3 text-[13px] text-ink-2 hover:text-ink"
    >
      {done ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {done ? t("share.copied") : t("run.copy")}
    </button>
  );
}

/** One step's result: the right preview for what it produced. */
export function OutputView({
  base,
  step,
  output,
  editable,
  draft,
  onDraft,
}: {
  /** `/api/runs/<id>` or `/api/shares/<token>` — where the output's files are served. */
  base: string;
  step: Step;
  output: StepOutput | null;
  editable?: boolean;
  draft?: string;
  onDraft?: (text: string) => void;
}) {
  if (!output) {
    return null;
  }
  const assetUrl = (id: string) => `${base}/assets/${id}`;
  if (step.type === "widget") {
    const html = output.assets?.find((a) => a.mime === "text/html");
    const size = step.size ?? { width: 1280, height: 720 };
    return html ? (
      <HtmlFrame src={assetUrl(html.id)} page={size.width} height={size.height} fit />
    ) : null;
  }
  if (step.type === "generate") {
    const asset = output.assets?.[0];
    if (!asset) {
      return null;
    }
    if (step.asset === "image") {
      return (
        <img
          src={assetUrl(asset.id)}
          alt={step.title}
          className="w-full rounded-lg bg-paper-2 ring-1 ring-border-soft"
        />
      );
    }
    if (step.asset === "video") {
      return (
        // biome-ignore lint/a11y/useMediaCaption: generated clips have no caption track to offer
        <video
          src={assetUrl(asset.id)}
          controls
          playsInline
          loop
          className={cn(
            "mx-auto rounded-lg bg-black ring-1 ring-border-soft",
            step.options?.aspectRatio === "9:16" ? "max-h-[70vh]" : "w-full",
          )}
        />
      );
    }
    return step.asset === "document" ? (
      <HtmlFrame src={assetUrl(asset.id)} page={820} height={1100} />
    ) : (
      <HtmlFrame src={assetUrl(asset.id)} page={null} height={760} />
    );
  }
  if (step.type === "agent") {
    const images =
      output.assets?.filter((a) => a.kind !== "file" && a.mime.startsWith("image/")) ?? [];
    const files = output.assets?.filter((a) => a.kind === "file") ?? [];
    return (
      <div className="flex flex-col gap-4">
        {step.output.format === "json" && output.json !== undefined ? (
          <JsonView step={step} json={output.json} />
        ) : editable ? (
          <Textarea
            value={draft ?? output.text ?? ""}
            onChange={(e) => onDraft?.(e.target.value)}
            minRows={4}
            maxRows={24}
          />
        ) : step.output.format === "markdown" ? (
          <Markdown text={output.text ?? ""} />
        ) : (
          <div className="whitespace-pre-wrap text-[16px] leading-relaxed">{output.text}</div>
        )}
        {images.map((img) => (
          <img
            key={img.id}
            src={assetUrl(img.id)}
            alt=""
            className="w-full rounded-lg ring-1 ring-border-soft"
          />
        ))}
        {files.length ? (
          <ul className="overflow-hidden rounded-lg ring-1 ring-border-soft">
            {files.map((f) => (
              <li key={f.id} className="border-border-soft border-b last:border-0">
                <a
                  href={assetUrl(f.id)}
                  download={f.name}
                  className="flex items-center gap-2 px-3 py-2 text-[13px] hover:bg-paper-2"
                >
                  <FileText className="size-3.5 shrink-0 text-ink-3" />
                  <span className="min-w-0 flex-1 truncate">{f.name}</span>
                </a>
              </li>
            ))}
          </ul>
        ) : null}
        {step.output.format !== "json" && !editable && output.text ? (
          <div>
            <CopyButton text={output.text} />
          </div>
        ) : null}
      </div>
    );
  }
  return null;
}

const FORMAT_LABEL: Record<Format, string> = {
  png: "PNG",
  mp4: "MP4",
  pdf: "PDF",
  docx: "Word",
  html: "HTML",
  md: "Markdown",
  txt: "Text",
  csv: "CSV",
  xlsx: "Excel",
  json: "JSON",
  zip: "ZIP",
};

export function DownloadButtons({
  base,
  stepId,
  formats,
}: {
  base: string;
  stepId: string;
  formats: Format[];
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {formats.map((f, i) => (
        <a
          key={f}
          href={`${base}/steps/${stepId}/download?format=${f}`}
          className={cn(
            "inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 font-medium text-[13px] transition",
            i === 0
              ? "bg-primary text-primary-foreground hover:brightness-105"
              : "bg-paper-2 text-ink-2 hover:bg-paper-3 hover:text-ink",
          )}
        >
          {i === 0 ? <Download className="size-3.5" /> : null}
          {FORMAT_LABEL[f]}
        </a>
      ))}
    </div>
  );
}
