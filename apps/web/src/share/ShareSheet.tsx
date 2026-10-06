import { Check, Copy, Link2, Mail, Share2 } from "lucide-react";
import { useState } from "react";
import { api } from "../lib/api";
import { appCall, appCan } from "../lib/app";
import { lang, t } from "../lib/i18n";
import { Button, Dialog, Spinner } from "../ui";

interface Shared {
  url: string;
  expiresAt: string | null;
}

function targets(url: string, title: string) {
  const u = encodeURIComponent(url);
  const text = encodeURIComponent(title);
  return [
    {
      id: "mail",
      label: t("shareRun.email"),
      href: `mailto:?subject=${text}&body=${text}%0A%0A${u}`,
    },
    { id: "x", label: "X", href: `https://x.com/intent/post?text=${text}&url=${u}` },
    {
      id: "linkedin",
      label: "LinkedIn",
      href: `https://www.linkedin.com/sharing/share-offsite/?url=${u}`,
    },
    { id: "whatsapp", label: "WhatsApp", href: `https://wa.me/?text=${text}%20${u}` },
    {
      id: "facebook",
      label: "Facebook",
      href: `https://www.facebook.com/sharer/sharer.php?u=${u}`,
    },
  ];
}

const MONOGRAM: Record<string, string> = { x: "𝕏", linkedin: "in", whatsapp: "WA", facebook: "f" };

/** "Teilen" on a finished result: one link, then wherever the person wants to send it. */
export function ShareResultButton({
  runId,
  title,
  initial,
}: {
  runId: string;
  title: string;
  initial: Shared | null;
}) {
  const [open, setOpen] = useState(false);
  const [shared, setShared] = useState<Shared | null>(initial);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    setOpen(true);
    if (shared) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setShared(await api.post<Shared>(`/api/runs/${runId}/share`));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const withdraw = async () => {
    await api.del(`/api/runs/${runId}/share`);
    setShared(null);
    setOpen(false);
  };
  const copy = () => {
    if (!shared) {
      return;
    }
    void navigator.clipboard.writeText(shared.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  const canNativeShare =
    appCan("share") || (typeof navigator !== "undefined" && "share" in navigator);
  const until = shared?.expiresAt
    ? new Intl.DateTimeFormat(lang, { dateStyle: "long" }).format(new Date(shared.expiresAt))
    : null;

  return (
    <>
      <Button variant="secondary" onClick={() => void start()}>
        <Share2 className="size-4" /> {t("shareRun.button")}
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={t("shareRun.title")}>
        {busy ? (
          <div className="flex justify-center py-8 text-ink-4">
            <Spinner />
          </div>
        ) : error ? (
          <p className="rounded-lg bg-rose-tint px-3 py-2 text-[0.875rem] text-rose">{error}</p>
        ) : shared ? (
          <div className="flex flex-col gap-5">
            <div className="flex items-center gap-2 rounded-xl bg-paper-2 p-1.5 pl-3">
              <Link2 className="size-4 shrink-0 text-ink-3" />
              <input
                readOnly
                value={shared.url}
                onFocus={(e) => e.target.select()}
                aria-label={t("share.link")}
                className="min-w-0 flex-1 bg-transparent text-[0.875rem] outline-none coarse:h-11"
              />
              <Button size="sm" onClick={copy}>
                {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                {copied ? t("share.copied") : t("share.copy")}
              </Button>
            </div>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
              {targets(shared.url, title).map((target) => (
                <a
                  key={target.id}
                  href={target.href}
                  target="_blank"
                  rel="noreferrer"
                  className="flex flex-col items-center gap-1.5 text-[0.75rem] text-ink-2 hover:text-ink"
                >
                  <span className="inline-flex size-12 items-center justify-center rounded-full bg-paper-2 font-semibold text-[0.9375rem] transition hover:bg-paper-3">
                    {target.id === "mail" ? <Mail className="size-5" /> : MONOGRAM[target.id]}
                  </span>
                  {target.label}
                </a>
              ))}
              {canNativeShare ? (
                <button
                  type="button"
                  onClick={() =>
                    void (
                      appCan("share")
                        ? appCall("share", { link: shared.url, title })
                        : navigator.share({ title, url: shared.url })
                    ).catch(() => undefined)
                  }
                  className="flex flex-col items-center gap-1.5 text-[0.75rem] text-ink-2 hover:text-ink"
                >
                  <span className="inline-flex size-12 items-center justify-center rounded-full bg-paper-2 transition hover:bg-paper-3">
                    <Share2 className="size-5" />
                  </span>
                  {t("shareRun.more")}
                </button>
              ) : null}
            </div>
            <div className="flex items-center justify-between gap-3 text-[0.8125rem] text-ink-3">
              <span>{until ? t("shareRun.until", { date: until }) : t("shareRun.kept")}</span>
              <button
                type="button"
                onClick={() => void withdraw()}
                className="shrink-0 hover:text-rose coarse:min-h-11"
              >
                {t("shareRun.withdraw")}
              </button>
            </div>
          </div>
        ) : null}
      </Dialog>
    </>
  );
}
