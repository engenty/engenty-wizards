import { useQuery } from "@tanstack/react-query";
import { Navigate, useNavigate } from "react-router";
import { Logo, Mascot, ThemeToggle } from "../brand";
import { api } from "../lib/api";
import { t } from "../lib/i18n";
import { signIn, useMe } from "../lib/session";
import { Button } from "../ui";
import { LangSwitch } from "./LangSwitch";
import { MarketplaceBrowser } from "./Marketplace";

/** The engentys that wait on the search field's edge. */
const CREW = ["drop", "oval", "round", "dome", "flame"];

/**
 * The marketplace for people who are not signed in: every template with what it makes, needs
 * and costs. "Start with this template" leads into the studio, through the sign-in where
 * needed. Open to everyone only where the runtime says so (MARKETPLACE_GALLERY=1).
 */
export function GalleryPage() {
  const navigate = useNavigate();
  const me = useMe();
  const config = useQuery({
    queryKey: ["config"],
    queryFn: () => api.get<{ mode: "managed" | "local"; gallery?: boolean }>("/api/config"),
  });
  if (config.isLoading || me.isLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Mascot kind="round" size={56} />
      </div>
    );
  }
  if (!config.data?.gallery && !me.data) {
    return <Navigate to="/" replace />;
  }
  const start = (id: string) => {
    const target = `/new?starter=${encodeURIComponent(id)}`;
    if (me.data) {
      navigate(target);
    } else if (config.data?.mode === "managed") {
      signIn(target);
    } else {
      navigate("/");
    }
  };
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 px-4 sm:h-16 sm:gap-4 sm:px-6">
        <Logo onClick={() => navigate("/")} place={t("market.admin")} />
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-3">
          <ThemeToggle />
          <LangSwitch tone="surface" />
          {me.data || config.data?.mode !== "managed" ? null : (
            <Button variant="secondary" onClick={() => signIn("/new")}>
              {t("market.signIn")}
            </Button>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-5xl animate-rise px-4 pb-24 sm:px-6">
        {/* One question, and the field that answers it; the engentys wait on its edge. */}
        <div className="relative mx-auto max-w-2xl pt-6 text-center sm:pt-14">
          <div
            aria-hidden
            className="-z-10 -translate-x-1/2 pointer-events-none absolute top-0 left-1/2 size-[340px] rounded-full bg-card opacity-70 blur-3xl sm:size-[520px]"
          />
          <h1 className="text-balance font-display font-semibold text-[30px] leading-[1.1] tracking-tight sm:text-[52px]">
            {t("market.galleryTitle")}
          </h1>
          <p className="mx-auto mt-3 max-w-md text-balance text-[14px] text-ink-2 leading-relaxed sm:mt-4 sm:text-[16px]">
            {t("market.gallerySub")}
          </p>
          <div className="mt-6 flex items-end justify-center gap-0.5 sm:mt-8">
            {CREW.map((kind, i) => (
              <span key={kind} className={i % 2 ? "translate-y-[9px]" : "translate-y-[12px]"}>
                <Mascot kind={kind} size={i === 2 ? 60 : 46} />
              </span>
            ))}
          </div>
        </div>
        <MarketplaceBrowser source="public" onUse={(entry) => start(entry.id)} />
      </main>
    </div>
  );
}
