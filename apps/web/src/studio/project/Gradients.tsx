import {
  type BrandColor,
  type BrandGradient,
  type BrandPattern,
  GRADIENT_TYPES,
  type GradientType,
  gradientCss,
  parseGradient,
} from "@engenty-wizards/shared/projects";
import { Copy, Download, Grid2x2, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { t } from "../../lib/i18n";
import { Button, cn, Dialog, IconButton, Input, Label, Swatch } from "../../ui";
import { fileUrl } from "./data";
import { InlineText } from "./Section";

const HEX = /^#[0-9a-fA-F]{6}$/;

/** The gradient drawn on a canvas, as a PNG to download: CSS's geometry, 1920 × 1080. */
async function gradientPng(g: BrandGradient, name: string) {
  const [w, h] = [1920, 1080];
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }
  const rad = (g.angle * Math.PI) / 180;
  let fill: CanvasGradient;
  if (g.type === "radial") {
    fill = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.hypot(w, h) / 2);
  } else if (g.type === "conic") {
    fill = ctx.createConicGradient(rad - Math.PI / 2, w / 2, h / 2);
  } else {
    // CSS: 0deg points up, the line is as long as the box is seen along it.
    const len = Math.abs(w * Math.sin(rad)) + Math.abs(h * Math.cos(rad));
    const [dx, dy] = [(Math.sin(rad) * len) / 2, (-Math.cos(rad) * len) / 2];
    fill = ctx.createLinearGradient(w / 2 - dx, h / 2 - dy, w / 2 + dx, h / 2 + dy);
  }
  for (const s of [...g.stops].sort((a, b) => a.at - b.at)) {
    fill.addColorStop(Math.min(1, Math.max(0, s.at / 100)), s.color);
  }
  ctx.fillStyle = fill;
  ctx.fillRect(0, 0, w, h);
  const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, "image/png"));
  if (blob) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${name || "gradient"}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
}

const TYPE_LABELS: Record<GradientType, Parameters<typeof t>[0]> = {
  linear: "project.gradientLinear",
  radial: "project.gradientRadial",
  conic: "project.gradientConic",
};

/** A gradient made or changed: its type, angle and colour stops, or its CSS pasted in. */
export function GradientEditor({
  gradient,
  brand,
  onSave,
  onClose,
}: {
  gradient: BrandGradient;
  /** The brand's colours, one click from becoming a stop. */
  brand: BrandColor[];
  onSave: (g: BrandGradient) => void;
  onClose: () => void;
}) {
  const [g, setG] = useState(gradient);
  const [css, setCss] = useState(gradientCss(gradient));
  const [cssError, setCssError] = useState(false);
  const change = (next: BrandGradient) => {
    setG(next);
    setCss(gradientCss(next));
    setCssError(false);
  };
  const stop = (i: number, patch: Partial<BrandGradient["stops"][number]>) =>
    change({ ...g, stops: g.stops.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  const addStop = (color?: string) => {
    const sorted = [...g.stops].sort((a, b) => a.at - b.at);
    // A new stop goes into the widest gap.
    let at = 50;
    let gap = -1;
    for (let i = 0; i < sorted.length - 1; i++) {
      if (sorted[i + 1].at - sorted[i].at > gap) {
        gap = sorted[i + 1].at - sorted[i].at;
        at = Math.round((sorted[i].at + sorted[i + 1].at) / 2);
      }
    }
    change({ ...g, stops: [...g.stops, { color: color ?? sorted[0]?.color ?? "#888888", at }] });
  };
  return (
    <Dialog open onClose={onClose} wide title={t("project.gradientEdit")}>
      <div className="flex flex-col gap-5">
        <div
          className="h-40 rounded-lg ring-1 ring-border-soft"
          style={{ background: gradientCss(g) }}
        />
        <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
          <div className="min-w-48 flex-1">
            <Label>{t("project.gradientName")}</Label>
            <Input
              value={g.name}
              maxLength={80}
              placeholder={t("project.gradientNamePlaceholder")}
              onChange={(e) => setG({ ...g, name: e.target.value })}
            />
          </div>
          <div>
            <Label>{t("project.gradientType")}</Label>
            <div className="flex gap-1 rounded-full bg-paper-2 p-0.5 ring-1 ring-border-soft">
              {GRADIENT_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  aria-pressed={g.type === type}
                  onClick={() => change({ ...g, type })}
                  className={cn(
                    "h-9 rounded-full px-4 font-medium text-[0.875rem] transition",
                    g.type === type ? "bg-card text-ink shadow-sm" : "text-ink-3 hover:text-ink-2",
                  )}
                >
                  {t(TYPE_LABELS[type])}
                </button>
              ))}
            </div>
          </div>
          {g.type === "radial" ? null : (
            <div className="min-w-56">
              <Label>{t("project.gradientAngle")}</Label>
              <div className="flex h-11 items-center gap-3">
                <input
                  type="range"
                  min={0}
                  max={360}
                  value={g.angle}
                  aria-label={t("project.gradientAngle")}
                  onChange={(e) => change({ ...g, angle: Number(e.target.value) })}
                  className="flex-1 accent-ink"
                />
                <span className="w-12 text-right text-[0.875rem] text-ink-2 tabular-nums">
                  {Math.round(g.angle)}°
                </span>
              </div>
            </div>
          )}
        </div>
        <div>
          <Label>{t("project.gradientStops")}</Label>
          <div className="flex flex-col gap-2">
            {g.stops.map((s, i) => (
              <div key={i} className="flex items-center gap-3">
                <Swatch
                  value={HEX.test(s.color) ? s.color : "#888888"}
                  onChange={(e) => stop(i, { color: e.target.value })}
                />
                <Input
                  value={s.color}
                  spellCheck={false}
                  onChange={(e) => {
                    const v = e.target.value.trim();
                    if (HEX.test(v)) {
                      stop(i, { color: v.toLowerCase() });
                    }
                  }}
                  className="w-28 font-mono text-[0.8125rem]"
                />
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={s.at}
                  aria-label={t("project.gradientAt")}
                  onChange={(e) => stop(i, { at: Number(e.target.value) })}
                  className="flex-1 accent-ink"
                />
                <span className="w-10 text-right text-[0.875rem] text-ink-2 tabular-nums">
                  {Math.round(s.at)}%
                </span>
                <IconButton
                  label={t("project.remove")}
                  disabled={g.stops.length <= 2}
                  onClick={() => change({ ...g, stops: g.stops.filter((_, j) => j !== i) })}
                  className="hover:text-rose"
                >
                  <Trash2 className="size-4" />
                </IconButton>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {g.stops.length < 12 ? (
              <Button variant="secondary" size="sm" onClick={() => addStop()}>
                <Plus className="size-4" /> {t("project.gradientStopAdd")}
              </Button>
            ) : null}
            {brand.length && g.stops.length < 12 ? (
              <>
                <span className="ml-2 text-[0.8125rem] text-ink-3">
                  {t("project.gradientFromBrand")}
                </span>
                {brand.slice(0, 10).map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    title={c.name || c.value}
                    aria-label={c.name || c.value}
                    onClick={() => addStop(c.value)}
                    className="size-6 rounded-full ring-1 ring-border transition hover:scale-110"
                    style={{ background: c.value }}
                  />
                ))}
              </>
            ) : null}
          </div>
        </div>
        <div>
          <Label>CSS</Label>
          <Input
            value={css}
            spellCheck={false}
            onChange={(e) => {
              setCss(e.target.value);
              const read = parseGradient(e.target.value);
              setCssError(!read);
              if (read) {
                setG({ ...g, ...read });
              }
            }}
            className="font-mono text-[0.8125rem]"
          />
          <p className={cn("mt-1.5 text-[0.8125rem]", cssError ? "text-rose" : "text-ink-3")}>
            {cssError ? t("project.gradientCssError") : t("project.gradientCssHint")}
          </p>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            onClick={() => {
              onSave(g);
              onClose();
            }}
          >
            {t("settings.save")}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

const hoverActions =
  "flex shrink-0 opacity-0 transition focus-within:opacity-100 group-hover/card:opacity-100 coarse:opacity-100";

/** A gradient as a card: drawn, named, its CSS to copy and a PNG to download. */
export function GradientCard({
  gradient,
  readOnly,
  onEdit,
  onRename,
  onRemove,
}: {
  gradient: BrandGradient;
  readOnly?: boolean;
  onEdit: () => void;
  onRename: (name: string) => void;
  onRemove: () => void;
}) {
  const css = gradientCss(gradient);
  const [copied, setCopied] = useState(false);
  return (
    <div className="group/card flex flex-col gap-2 rounded-lg bg-paper p-2 ring-1 ring-border-soft">
      <button
        type="button"
        disabled={readOnly}
        aria-label={t("project.gradientEdit")}
        onClick={onEdit}
        className="h-28 rounded-md ring-1 ring-border-soft transition enabled:hover:brightness-105"
        style={{ background: css }}
      />
      <div className="flex items-center gap-1 px-0.5">
        <div className="min-w-0 flex-1">
          {readOnly ? (
            <span className="text-[0.875rem]">{gradient.name}</span>
          ) : (
            <InlineText
              value={gradient.name}
              label={t("project.gradientName")}
              placeholder={t("project.gradientName")}
              maxLength={80}
              onChange={onRename}
              className="font-medium text-[0.875rem]"
            />
          )}
        </div>
        <div className={hoverActions}>
          <IconButton
            label={copied ? t("project.gradientCopied") : t("project.gradientCopy")}
            onClick={() => {
              void navigator.clipboard.writeText(`background: ${css};`);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            className="size-8"
          >
            <Copy className="size-4" />
          </IconButton>
          <IconButton
            label={t("project.download")}
            onClick={() => void gradientPng(gradient, gradient.name)}
            className="size-8"
          >
            <Download className="size-4" />
          </IconButton>
          {readOnly ? null : (
            <IconButton
              label={t("project.remove")}
              onClick={onRemove}
              className="size-8 hover:text-rose"
            >
              <Trash2 className="size-4" />
            </IconButton>
          )}
        </div>
      </div>
    </div>
  );
}

/** A pattern or a fill as a card: the picture, tiled or filling, to download. */
export function PatternCard({
  projectId,
  pattern,
  fileName,
  readOnly,
  onChange,
  onRemove,
}: {
  projectId: string;
  pattern: BrandPattern;
  fileName: string;
  readOnly?: boolean;
  onChange: (patch: Partial<BrandPattern>) => void;
  onRemove: () => void;
}) {
  const src = fileUrl(projectId, pattern.file);
  return (
    <div className="group/card flex flex-col gap-2 rounded-lg bg-paper p-2 ring-1 ring-border-soft">
      <div
        className="h-28 rounded-md ring-1 ring-border-soft"
        style={{
          backgroundImage: `url("${src}")`,
          backgroundSize: pattern.tile ? "64px" : "cover",
          backgroundRepeat: pattern.tile ? "repeat" : "no-repeat",
          backgroundPosition: "center",
        }}
      />
      <div className="flex items-center gap-1 px-0.5">
        <div className="min-w-0 flex-1">
          {readOnly ? (
            <span className="text-[0.875rem]">{pattern.name || fileName}</span>
          ) : (
            <InlineText
              value={pattern.name}
              label={t("project.patternName")}
              placeholder={fileName}
              maxLength={80}
              onChange={(name) => onChange({ name })}
              className="font-medium text-[0.875rem]"
            />
          )}
        </div>
        <div className={hoverActions}>
          {readOnly ? null : (
            <IconButton
              label={pattern.tile ? t("project.patternFill") : t("project.patternTile")}
              aria-pressed={Boolean(pattern.tile)}
              onClick={() => onChange({ tile: !pattern.tile })}
              className={cn("size-8", pattern.tile && "bg-paper-2 text-ink")}
            >
              <Grid2x2 className="size-4" />
            </IconButton>
          )}
          <a
            href={src}
            download={fileName}
            aria-label={t("project.download")}
            title={t("project.download")}
            className="inline-flex size-8 items-center justify-center rounded-full text-ink-3 transition hover:bg-accent hover:text-ink"
          >
            <Download className="size-4" />
          </a>
          {readOnly ? null : (
            <IconButton
              label={t("project.remove")}
              onClick={onRemove}
              className="size-8 hover:text-rose"
            >
              <Trash2 className="size-4" />
            </IconButton>
          )}
        </div>
      </div>
    </div>
  );
}
