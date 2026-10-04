import { useQueryClient } from "@tanstack/react-query";
import { ExternalLink, HardDrive } from "lucide-react";
import { useState } from "react";
import { api } from "../lib/api";
import { t } from "../lib/i18n";
import { initialsOf, type Me, type UserProfile } from "../lib/session";
import { Chip, Input, Label, Textarea } from "../ui";
import { LangSwitch } from "./LangSwitch";
import { openExternal } from "./LocalRuntime";
import { useAutosave } from "./project/data";
import { Section } from "./project/Section";
import { ThemeSwitch } from "./ThemeSwitch";

const hint = "mt-1.5 text-[13px] text-ink-3";

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
  const url = me.manageUrl ? `${me.manageUrl}/account` : (me.account?.url ?? null);
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
        {me.mode === "local" && !me.account ? (
          <div className="flex items-start gap-4">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-paper-2 text-ink-2">
              <HardDrive className="size-5" />
            </div>
            <div className="min-w-0">
              <div className="font-medium text-[15px]">{t("account.local")}</div>
              <p className="mt-1 text-[14px] text-ink-3 leading-relaxed">
                {t("account.localText")}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate font-medium text-[15px]">
                  {me.account?.name ?? me.user.name}
                </span>
                <Chip tone="live">{t("account.linked")}</Chip>
              </div>
              <div className="truncate text-[14px] text-ink-3">
                {me.account?.email ?? me.user.email}
              </div>
            </div>
            {url ? (
              <button
                type="button"
                onClick={() => openExternal(url)}
                className="inline-flex h-10 items-center gap-2 rounded-full border border-border bg-card px-4 font-medium text-sm transition hover:bg-paper-2"
              >
                {t("setup.openAccount")} <ExternalLink className="size-4" />
              </button>
            ) : null}
          </div>
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
