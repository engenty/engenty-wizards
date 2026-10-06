import { AppWindow, X } from "lucide-react";
import { useEffect, useState } from "react";
import { t } from "../lib/i18n";
import { Button, IconButton } from "../ui";

const DISMISSED_KEY = "wizards.install-banner";

const standalone = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  window.matchMedia("(display-mode: window-controls-overlay)").matches;

/** Chrome, Edge and the other Chromium browsers install a page as an app; Safari and Firefox not. */
const chromium = () =>
  Boolean((navigator as { userAgentData?: { brands?: unknown[] } }).userAgentData?.brands?.length);

const touch = () => window.matchMedia("(pointer: coarse)").matches;

function dismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * The studio as an app of its own: in Chrome or Edge one click installs it (its own window, its
 * own icon). In another browser on a computer it says where that works. Gone once installed, in
 * the app's own window, or after the person closes it.
 */
export function InstallBanner() {
  const [prompt, setPrompt] = useState(() => window.wizardInstall ?? null);
  const [closed, setClosed] = useState(dismissed);
  useEffect(() => {
    const update = () => setPrompt(window.wizardInstall ?? null);
    const installed = () => setClosed(true);
    window.addEventListener("wizard-install", update);
    window.addEventListener("appinstalled", installed);
    return () => {
      window.removeEventListener("wizard-install", update);
      window.removeEventListener("appinstalled", installed);
    };
  }, []);
  // Chromium without an offer: installed already, or the page does not qualify.
  if (closed || standalone() || touch() || (!prompt && chromium())) {
    return null;
  }
  const close = () => {
    try {
      localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // Private window: it shows again next time.
    }
    setClosed(true);
  };
  return (
    <div className="flex items-center gap-3 border-border-soft border-b bg-paper-2 px-4 py-2 text-[0.8125rem] text-ink-2 sm:px-6">
      <AppWindow className="size-4 shrink-0 text-ink-3" />
      <p className="min-w-0 flex-1">{prompt ? t("install.app.offer") : t("install.app.browser")}</p>
      {prompt ? (
        <Button
          size="sm"
          onClick={() => {
            void prompt.prompt();
            window.wizardInstall = null;
            setPrompt(null);
          }}
        >
          {t("install.app.action")}
        </Button>
      ) : null}
      <IconButton label={t("install.app.close")} onClick={close} className="size-8">
        <X className="size-4" />
      </IconButton>
    </div>
  );
}
