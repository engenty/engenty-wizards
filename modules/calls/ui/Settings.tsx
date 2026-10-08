import { Button, Card, Input, Label, Select, Spinner } from "@engenty-wizards/web/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { type AccountView, api, errorText, KEY, t } from "./app";
import { Shown } from "./parts";

/** Settings → Calls: Twilio, the OpenAI project, and what to enter where. */
export function SettingsSection() {
  const cache = useQueryClient();
  const account = useQuery({
    queryKey: [KEY, "account"],
    queryFn: () => api().get<AccountView>("/account"),
  });
  const [form, setForm] = useState({
    twilioSid: "",
    twilioToken: "",
    smsFrom: "",
    openaiProject: "",
    openaiWebhookSecret: "",
    region: "eu" as "eu" | "us",
  });
  useEffect(() => {
    if (account.data) {
      setForm((f) => ({
        ...f,
        twilioSid: account.data.twilioSid,
        smsFrom: account.data.smsFrom,
        openaiProject: account.data.openaiProject,
        region: account.data.region,
      }));
    }
  }, [account.data]);
  const refresh = () => cache.invalidateQueries({ queryKey: [KEY] });
  const save = useMutation({
    mutationFn: () =>
      api().put<AccountView>("/account", {
        twilioSid: form.twilioSid,
        twilioToken: form.twilioToken || undefined,
        smsFrom: form.smsFrom || null,
        openaiProject: form.openaiProject,
        openaiWebhookSecret: form.openaiWebhookSecret || undefined,
        region: form.region,
      }),
    onSuccess: async () => {
      setForm((f) => ({ ...f, twilioToken: "", openaiWebhookSecret: "" }));
      await refresh();
    },
  });
  const remove = useMutation({
    mutationFn: () => api().del<AccountView>("/account"),
    onSuccess: refresh,
  });
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));
  const data = account.data;
  return (
    <section className="flex flex-col gap-2.5">
      <h2 className="px-1 font-display font-semibold text-lg leading-tight">{t("title")}</h2>
      <Card className="flex flex-col gap-4 p-5 text-[0.875rem]">
        <p className="text-[0.8125rem] text-ink-3">{t("intro")}</p>
        {account.isLoading ? <Spinner className="mx-auto" /> : null}
        <div>
          <Label hint={t("twilioSidHint")}>{t("twilioSid")}</Label>
          <Input value={form.twilioSid} onChange={set("twilioSid")} autoComplete="off" />
        </div>
        <div>
          <Label hint={data?.hasToken ? t("kept") : t("twilioTokenHint")}>{t("twilioToken")}</Label>
          <Input
            type="password"
            value={form.twilioToken}
            onChange={set("twilioToken")}
            placeholder={data?.hasToken ? "••••••••" : ""}
            autoComplete="new-password"
          />
        </div>
        <div>
          <Label hint={t("smsFromHint")}>{t("smsFrom")}</Label>
          <Input value={form.smsFrom} onChange={set("smsFrom")} inputMode="tel" />
        </div>
        <div>
          <Label hint={t("openaiProjectHint")}>{t("openaiProject")}</Label>
          <Input value={form.openaiProject} onChange={set("openaiProject")} autoComplete="off" />
        </div>
        <div>
          <Label hint={data?.hasSecret ? t("kept") : t("openaiSecretHint")}>
            {t("openaiSecret")}
          </Label>
          <Input
            type="password"
            value={form.openaiWebhookSecret}
            onChange={set("openaiWebhookSecret")}
            placeholder={data?.hasSecret ? "••••••••" : ""}
            autoComplete="new-password"
          />
        </div>
        <div>
          <Label>{t("region")}</Label>
          <Select
            className="w-40"
            value={form.region}
            onChange={(region) => setForm((f) => ({ ...f, region: region as "eu" | "us" }))}
            options={[
              { value: "eu", label: t("regionEu") },
              { value: "us", label: t("regionUs") },
            ]}
          />
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={() => save.mutate()} busy={save.isPending}>
            {t("save")}
          </Button>
          {data?.connected ? (
            <Button variant="ghost" onClick={() => remove.mutate()} busy={remove.isPending}>
              {t("disconnect")}
            </Button>
          ) : null}
          {save.isSuccess ? (
            <span className="text-[0.8125rem] text-ink-3">{t("saved")}</span>
          ) : null}
        </div>
        {save.error ? <p className="text-[0.8125rem] text-rose">{errorText(save.error)}</p> : null}
      </Card>
      {data?.connected ? (
        <Card className="flex flex-col gap-4 p-5 text-[0.875rem]">
          <div className="font-medium">{t("setup")}</div>
          <Shown label={t("voiceWebhook")} value={data.voiceWebhook} />
          <p className="-mt-2 text-[0.8125rem] text-ink-3">{t("voiceWebhookHint")}</p>
          <Shown label={t("openaiWebhook")} value={data.openaiWebhook} />
          <p className="-mt-2 text-[0.8125rem] text-ink-3">{t("openaiWebhookHint")}</p>
          {data.sipUri ? <Shown label={t("sipUri")} value={data.sipUri} /> : null}
          <div className="font-medium">{t("meta")}</div>
          <p className="-mt-2 text-[0.8125rem] text-ink-3">{t("metaHint")}</p>
        </Card>
      ) : null}
    </section>
  );
}
