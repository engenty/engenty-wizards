import { lazy, Suspense, useState } from "react";
import { t } from "../lib/i18n";

const ChangelogDialog = lazy(() =>
  import("./ChangelogDialog").then((m) => ({ default: m.ChangelogDialog })),
);
const CreditsDialog = lazy(() =>
  import("./CreditsDialog").then((m) => ({ default: m.CreditsDialog })),
);

/** The release this app is: the version of the root package.json. */
export const APP_VERSION = import.meta.env.VITE_APP_VERSION;

/**
 * The app's version and the two things about it — its changelog and its open-source credits —
 * as inline links that open a dialog each. Sits wherever a line of quiet links is.
 */
export function AboutLinks() {
  const [dialog, setDialog] = useState<"changelog" | "credits" | null>(null);
  const link = "transition hover:text-ink-2";
  return (
    <>
      <span className="tabular-nums">{t("about.version", { v: APP_VERSION })}</span>
      <button type="button" className={link} onClick={() => setDialog("changelog")}>
        {t("about.changelog")}
      </button>
      <button type="button" className={link} onClick={() => setDialog("credits")}>
        {t("about.credits")}
      </button>
      {dialog ? (
        <Suspense fallback={null}>
          {dialog === "changelog" ? (
            <ChangelogDialog open onClose={() => setDialog(null)} />
          ) : (
            <CreditsDialog open onClose={() => setDialog(null)} />
          )}
        </Suspense>
      ) : null}
    </>
  );
}
