import { Download } from "lucide-react";
import { useMemo } from "react";
import { renderSVG } from "uqr";
import { t } from "../../lib/i18n";
import { Button } from "../../ui";

/** `K7WM4TQ9` → `K7WM 4TQ9`: two groups read aloud and typed more easily. */
export const spacedCode = (code: string) => `${code.slice(0, 4)} ${code.slice(4)}`;

function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** The SVG drawn on a canvas, 1024 pixels wide: for print and slides that take no SVG. */
async function savePng(svg: string, name: string) {
  const image = new Image();
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    image.src = url;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(image, 0, 0, 1024, 1024);
    const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (png) {
      save(png, name);
    }
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * The wizard's link as a QR code, and its ID: the phone's camera opens the link (in the mobile
 * app when it is installed), the app's ID field takes the ID.
 */
export function WizardQr({ url, code, title }: { url: string; code?: string; title: string }) {
  const svg = useMemo(() => renderSVG(url, { ecc: "M", border: 2, pixelSize: 8 }), [url]);
  const file = (title.trim() || "wizard").replace(/[^\p{L}\p{N}]+/gu, "-").toLowerCase();
  return (
    <div className="flex gap-4">
      <div
        role="img"
        aria-label={t("share.qr")}
        className="size-28 shrink-0 overflow-hidden rounded-lg bg-white [&>svg]:size-full"
        // uqr writes the SVG from the link alone: no markup of anyone else's goes in.
        // biome-ignore lint/security/noDangerouslySetInnerHtml: generated from the URL only
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <p className="text-[0.8125rem] text-ink-3">{t("share.qrHint")}</p>
        {code ? (
          <p className="text-[0.8125rem] text-ink-3">
            {t("share.code")}{" "}
            <span className="select-all font-mono text-[0.9375rem] text-ink tracking-wider">
              {spacedCode(code)}
            </span>
          </p>
        ) : null}
        <div className="mt-auto flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => void savePng(svg, `${file}-qr.png`)}>
            <Download className="size-3.5" /> PNG
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => save(new Blob([svg], { type: "image/svg+xml" }), `${file}-qr.svg`)}
          >
            <Download className="size-3.5" /> SVG
          </Button>
        </div>
      </div>
    </div>
  );
}
