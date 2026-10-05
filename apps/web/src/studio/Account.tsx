import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Cloud, Coins, ExternalLink, HardDrive, LogOut } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { features } from "../lib/features";
import { type Key, lang, t } from "../lib/i18n";
import { type ExpiringCredits, initialsOf, type Me, type UserProfile } from "../lib/session";
import { Button, Chip, Input, Label, Spinner, Textarea } from "../ui";
import { LangSwitch } from "./LangSwitch";
import { openExternal } from "./LocalRuntime";
import { useAutosave } from "./project/data";
import { Section } from "./project/Section";
import { ThemeSwitch } from "./ThemeSwitch";

const hint = "mt-1.5 text-[13px] text-ink-3";

/**
 * Links this install to an account. The sign-in — or the sign-up, for someone without an
 * account — runs in the person's own browser; the studio notices that it is done by asking again.
 */
function useAccountLink(signedIn: boolean) {
  const qc = useQueryClient();
  const [waiting, setWaiting] = useState(false);
  const link = useMutation({
    mutationFn: (input: { signup?: boolean; code?: string }) =>
      api.post<{ url: string }>("/api/studio/account/link", input),
    onSuccess: ({ url }) => {
      openExternal(url);
      setWaiting(true);
    },
  });
  useEffect(() => {
    if (!waiting) {
      return;
    }
    const timer = setInterval(() => void qc.invalidateQueries({ queryKey: ["me"] }), 2000);
    const stop = setTimeout(() => setWaiting(false), 5 * 60_000);
    return () => {
      clearInterval(timer);
      clearTimeout(stop);
    };
  }, [waiting, qc]);
  useEffect(() => {
    if (signedIn) {
      setWaiting(false);
    }
  }, [signedIn]);
  return { link, waiting };
}

/** One line under the buttons while the browser has the sign-in, or when it could not be opened. */
function LinkStatus({ link, waiting }: ReturnType<typeof useAccountLink>) {
  if (link.isError) {
    return <p className="text-[13px] text-rose">{t("local.accountFailed")}</p>;
  }
  return waiting ? (
    <p className="flex items-center gap-2 text-[13px] text-ink-3">
      <Spinner className="size-3.5" /> {t("local.accountWaiting")}
    </p>
  ) : null;
}

/**
 * A local install without an account: what an account gives, the sign-in, and the way to a new
 * account, which takes an invitation code.
 */
function Unlinked() {
  const linking = useAccountLink(false);
  const { link } = linking;
  const [code, setCode] = useState("");
  return (
    <div className="flex flex-col divide-y divide-border-soft">
      <div className="flex items-start gap-4 py-5 first:pt-0 last:pb-0">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-paper-2 text-ink-2">
          <HardDrive className="size-5" />
        </div>
        <div className="min-w-0">
          <div className="font-medium text-[15px]">{t("account.local")}</div>
          <p className="mt-1 text-[14px] text-ink-3 leading-relaxed">{t("account.localText")}</p>
        </div>
      </div>
      {features.account ? (
        <div className="flex flex-col gap-4 py-5 last:pb-0">
          <div>
            <div className="font-medium text-[15px]">{t("account.with")}</div>
            <ul className="mt-2 flex flex-col gap-2 text-[14px] text-ink-2 leading-snug">
              <li className="flex items-start gap-2.5">
                <Coins className="mt-0.5 size-4 shrink-0 text-amber" />
                {t("account.withCredits")}
              </li>
              <li className="flex items-start gap-2.5">
                <Cloud className="mt-0.5 size-4 shrink-0 text-cobalt" />
                {t("account.withCloud")}
              </li>
            </ul>
          </div>
          <div>
            <Button
              busy={link.isPending && !link.variables?.signup}
              onClick={() => link.mutate({})}
            >
              {t("account.signIn")}
            </Button>
          </div>
        </div>
      ) : null}
      {features.account ? (
        <form
          className="flex flex-col gap-3 py-5 last:pb-0"
          onSubmit={(e) => {
            e.preventDefault();
            link.mutate({ signup: true, code: code.trim() || undefined });
          }}
        >
          <div>
            <div className="font-medium text-[15px]">{t("account.new")}</div>
            <p className="mt-1 text-[14px] text-ink-3 leading-relaxed">{t("account.newHint")}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Input
              value={code}
              maxLength={64}
              autoComplete="off"
              spellCheck={false}
              placeholder={t("account.code")}
              aria-label={t("account.code")}
              onChange={(e) => setCode(e.target.value)}
              className="w-56 font-mono text-[14px]"
            />
            <Button
              type="submit"
              variant="secondary"
              className="h-11"
              busy={link.isPending && Boolean(link.variables?.signup)}
            >
              {t("account.create")}
            </Button>
          </div>
          <LinkStatus {...linking} />
        </form>
      ) : null}
    </div>
  );
}

const CREDIT_KIND: Record<ExpiringCredits["kind"], Key> = {
  start: "account.kind.start",
  monthly: "account.kind.monthly",
  gift: "account.kind.gift",
};

/** The host of an address, as one says it ("engenty.ai"); the address itself where it is none. */
function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/**
 * The account a local install is linked to: whose it is, its credits and when parts of them end,
 * and the cloud that also runs what is published here.
 */
function Linked({ account }: { account: NonNullable<Me["account"]> }) {
  const qc = useQueryClient();
  const linking = useAccountLink(account.signedIn);
  const unlink = useMutation({
    mutationFn: () => api.del("/api/studio/account"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["me"] }),
  });
  const date = new Intl.DateTimeFormat(lang, { dateStyle: "medium" });
  return (
    <div className="flex flex-col divide-y divide-border-soft">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 py-5 first:pt-0">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium text-[15px]">
              {account.name || account.email}
            </span>
            {account.signedIn ? <Chip tone="live">{t("account.linked")}</Chip> : null}
          </div>
          <div className="truncate text-[14px] text-ink-3">{account.email}</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={() => openExternal(account.url)}>
            {t("setup.openAccount")} <ExternalLink className="size-4" />
          </Button>
          <Button variant="ghost" busy={unlink.isPending} onClick={() => unlink.mutate()}>
            <LogOut className="size-4" /> {t("nav.logout")}
          </Button>
        </div>
      </div>
      {account.signedIn ? null : (
        // The link is still there, its sign-in is not: the same sign-in again brings it back.
        <div className="flex flex-col gap-3 py-5">
          <p className="text-[14px] text-ink-2">{t("local.accountExpired")}</p>
          <div>
            <Button busy={linking.link.isPending} onClick={() => linking.link.mutate({})}>
              {t("account.signInAgain")}
            </Button>
          </div>
          <LinkStatus {...linking} />
        </div>
      )}
      {account.credits === null ? null : (
        <div className="py-5">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
            <div className="min-w-0 flex-1">
              <div className="text-[13px] text-ink-3">{t("account.credits")}</div>
              <div className="font-display font-semibold text-[22px] tabular-nums leading-tight">
                {/* Whole credits, rounded down: never more than there is. */}
                {t("nav.credits", { n: Math.floor(account.credits).toLocaleString() })}
              </div>
            </div>
            <Button variant="secondary" onClick={() => openExternal(`${account.url}/billing`)}>
              {t("account.topUp")} <ExternalLink className="size-4" />
            </Button>
          </div>
          {account.expiring.length ? (
            <ul className="mt-3 flex flex-col gap-1 text-[13px] text-ink-3 tabular-nums">
              {account.expiring.map((part) => (
                <li key={`${part.kind}:${part.expiresAt}`}>
                  {t("account.expires", {
                    n: Math.floor(part.credits).toLocaleString(),
                    date: date.format(new Date(part.expiresAt)),
                  })}
                  {CREDIT_KIND[part.kind] ? (
                    <span className="text-ink-4"> · {t(CREDIT_KIND[part.kind])}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}
      <div className="flex items-start gap-2.5 py-5 text-[14px] text-ink-2 leading-snug last:pb-0">
        <Cloud className="mt-0.5 size-4 shrink-0 text-cobalt" />
        <p>{t("account.cloud", { host: hostOf(account.cloudUrl) })}</p>
      </div>
    </div>
  );
}

/**
 * Who the person is to the app, what the app is connected to, and how it looks for them. The
 * avatar shows the name's initials: a runtime that runs alone starts with the machine's user
 * name, which is why it may read a single letter until a name is set here.
 */
export function Account({ me }: { me: Me }) {
  const qc = useQueryClient();
  const managed = me.mode === "managed";
  const [profile, setProfile] = useState<UserProfile>(me.profile);
  const set = (patch: Partial<UserProfile>) => setProfile((now) => ({ ...now, ...patch }));
  const status = useAutosave(profile, async (next) => {
    await api.put("/api/studio/profile", next);
    // The menu's avatar and name follow.
    await qc.invalidateQueries({ queryKey: ["me"] });
  });
  return (
    <div className="flex flex-col gap-9">
      <Section title={t("account.title")} hint={t("account.hint")} save={status}>
        <div className="flex flex-col gap-6 sm:flex-row sm:gap-8">
          <div className="flex shrink-0 flex-col items-center gap-2 sm:w-32">
            <div className="flex size-20 items-center justify-center overflow-hidden rounded-full bg-ember-tint font-semibold text-[28px] text-ember-strong ring-1 ring-border-soft">
              {me.user.image ? (
                <img src={me.user.image} alt="" className="size-full object-cover" />
              ) : (
                initialsOf(profile.name) || "?"
              )}
            </div>
            <p className="text-center text-[12px] text-ink-3 leading-snug">
              {t("account.initials")}
            </p>
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-5">
            <div>
              <Label>{t("account.name")}</Label>
              <Input
                value={profile.name}
                maxLength={80}
                disabled={managed}
                onChange={(e) => set({ name: e.target.value })}
              />
              <p className={hint}>{managed ? t("account.fromAccount") : t("account.nameHint")}</p>
            </div>
            <div>
              <Label>{t("account.about")}</Label>
              <Textarea
                minRows={3}
                maxLength={2000}
                value={profile.about}
                onChange={(e) => set({ about: e.target.value })}
              />
              <p className={hint}>{t("account.aboutHint")}</p>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <Label>{t("account.email")}</Label>
                <Input
                  type="email"
                  value={profile.email}
                  maxLength={200}
                  disabled={managed}
                  onChange={(e) => set({ email: e.target.value })}
                />
              </div>
              <div>
                <Label>{t("account.phone")}</Label>
                <Input
                  type="tel"
                  value={profile.phone}
                  maxLength={40}
                  onChange={(e) => set({ phone: e.target.value })}
                />
              </div>
            </div>
          </div>
        </div>
      </Section>

      <Section title={t("account.connection")} hint={t("account.connectionHint")}>
        {managed ? (
          <div className="flex flex-wrap items-center gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate font-medium text-[15px]">{me.user.name}</span>
                <Chip tone="live">{t("account.linked")}</Chip>
              </div>
              <div className="truncate text-[14px] text-ink-3">{me.user.email}</div>
            </div>
            {me.manageUrl ? (
              <Button variant="secondary" onClick={() => openExternal(`${me.manageUrl}/account`)}>
                {t("setup.openAccount")} <ExternalLink className="size-4" />
              </Button>
            ) : null}
          </div>
        ) : me.account ? (
          // The account of a local install has this one place: its sign-in, credits and cloud.
          <Linked account={me.account} />
        ) : (
          <Unlinked />
        )}
      </Section>

      <Section title={t("account.look")} hint={t("account.lookHint")}>
        <div className="flex flex-col divide-y divide-border-soft">
          <div className="flex items-center justify-between gap-4 pb-4">
            <span className="font-medium text-[14px]">{t("nav.language")}</span>
            <LangSwitch tone="surface" />
          </div>
          <div className="flex items-center justify-between gap-4 pt-4">
            <span className="font-medium text-[14px]">{t("nav.theme")}</span>
            <ThemeSwitch />
          </div>
        </div>
      </Section>
    </div>
  );
}
