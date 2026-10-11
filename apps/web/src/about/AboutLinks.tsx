import { lazy, Suspense, useState } from "react";
import { t } from "../lib/i18n";
import type { Me } from "../lib/session";

const AboutDialog = lazy(() => import("./AboutDialog").then((m) => ({ default: m.AboutDialog })));

/** The release this app is: the version of the root package.json. */
export const APP_VERSION = import.meta.env.VITE_APP_VERSION;

/**
 * The app's version as a quiet link that opens the About dialog — the same one as behind the
 * mark in the app bar, with the updates, what is new and the credits. Sits wherever a line of
 * quiet links is.
 */
export function AboutLinks({ me }: { me?: Me | null }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="tabular-nums transition hover:text-ink-2"
        onClick={() => setOpen(true)}
      >
        {t("about.version", { v: APP_VERSION })}
      </button>
      {open ? (
        <Suspense fallback={null}>
          <AboutDialog open me={me} onClose={() => setOpen(false)} />
        </Suspense>
      ) : null}
    </>
  );
}
