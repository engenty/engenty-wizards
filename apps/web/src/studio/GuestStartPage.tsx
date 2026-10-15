import { ArrowRight } from "lucide-react";
import { useState } from "react";
import { APP_VERSION } from "../about/AboutLinks";
import { Mascot } from "../brand";
import { t } from "../lib/i18n";
import { keepWish, pendingWish, signIn } from "../lib/session";
import { Button, Textarea } from "../ui";
import { DoorBar } from "./DoorBar";
import { MarketplaceBrowser } from "./Marketplace";

/**
 * The cloud studio for someone not signed in: the new-wizard page without what needs an account.
 * "Build" keeps the wish and signs in; the account's sign-in page shows the wish, and the
 * new-wizard page builds it once the person is in (NewWizardPage). A template signs in and
 * opens there.
 */
export function GuestStartPage({ failed }: { failed: boolean }) {
  const [prompt, setPrompt] = useState(() => pendingWish() ?? "");
  const [busy, setBusy] = useState(false);

  const submit = () => {
    const wish = prompt.trim();
    if (!wish || busy) {
      return;
    }
    setBusy(true);
    keepWish(wish);
    signIn("/new", wish);
  };

  return (
    <div className="min-h-dvh px-6 pb-16 sm:px-10">
      <DoorBar
        className="pt-6 sm:pt-8"
        end={
          <Button variant="secondary" size="sm" onClick={() => signIn("/")}>
            {t("guest.signIn")}
          </Button>
        }
      />
      <div className="mx-auto max-w-2xl animate-rise pt-8 md:pt-12">
        <div className="flex flex-col items-center text-center">
          <div className="size-[84px] md:size-auto">
            <div className="origin-top-left scale-[0.56] md:scale-100">
              <Mascot kind="sprout" size={150} fluffy />
            </div>
          </div>
          <h1 className="mt-1 font-display font-semibold text-[1.5rem] leading-tight tracking-tight md:mt-2 md:text-[2.375rem]">
            {t("new.title")}
          </h1>
        </div>
        <div className="relative mt-6 rounded-2xl bg-card p-2 shadow-elevated ring-1 ring-border-soft focus-within:ring-focus md:mt-8">
          <Textarea
            autoFocus
            minRows={4}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                submit();
              }
            }}
            placeholder={t("new.placeholder")}
            className="border-0 bg-transparent text-[1rem] shadow-none focus:ring-0"
          />
          <div className="flex items-center justify-end gap-2 px-1 pb-1">
            <Button size="md" onClick={submit} busy={busy} disabled={!prompt.trim()}>
              {t("new.build")} <ArrowRight className="size-4" />
            </Button>
          </div>
        </div>
        {failed ? (
          <p className="mt-3 text-center text-[0.875rem] text-rose">{t("auth.failed")}</p>
        ) : null}
        <p className="mt-3 text-center text-[0.875rem] text-ink-3">{t("guest.hint")}</p>
      </div>

      <section className="mx-auto max-w-5xl">
        <h2 className="mt-16 mb-5 text-center font-medium text-[0.8125rem] text-ink-3 uppercase tracking-[0.08em]">
          {t("new.orStarter")}
        </h2>
        <MarketplaceBrowser
          onGuestOpen={(entry) => signIn(`/new?starter=${encodeURIComponent(entry.id)}`)}
        />
      </section>
      <footer className="mt-16 text-center text-[0.75rem] text-ink-3">
        © engenty · {t("about.version", { v: APP_VERSION })}
      </footer>
    </div>
  );
}
