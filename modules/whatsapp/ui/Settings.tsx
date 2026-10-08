import { Button, Card, Input, Label, Spinner } from "@engenty-wizards/web/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { type AccountView, api, errorText, KEY, t } from "./app";
import { Shown } from "./parts";

/** Settings → WhatsApp: the number, the token, and what to enter in the Meta app. */
export function SettingsSection() {
  const cache = useQueryClient();
  const account = useQuery({
    queryKey: [KEY, "account"],
    queryFn: () => api().get<AccountView>("/account"),
  });
  const [form, setForm] = useState({
    phoneNumberId: "",
    number: "",
    accessToken: "",
    appSecret: "",
    template: "",
  });
  const [to, setTo] = useState("");
  useEffect(() => {
    if (account.data) {
      setForm((f) => ({
        ...f,
        phoneNumberId: account.data.phoneNumberId,
        number: account.data.number,
        template: account.data.template,
      }));
    }
  }, [account.data]);
  const refresh = () => cache.invalidateQueries({ queryKey: [KEY] });
  const save = useMutation({
    mutationFn: () =>
      api().put<AccountView>("/account", {
        phoneNumberId: form.phoneNumberId,
        number: form.number,
        accessToken: form.accessToken || undefined,
        appSecret: form.appSecret || undefined,
        template: form.template || null,
      }),
    onSuccess: async () => {
      setForm((f) => ({ ...f, accessToken: "", appSecret: "" }));
      await refresh();
    },
  });
  const remove = useMutation({
    mutationFn: () => api().del<AccountView>("/account"),
    onSuccess: refresh,
  });
  const test = useMutation({
    mutationFn: () => api().post<{ ok: boolean }>("/account/test", { to }),
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
          <Label hint={t("phoneNumberIdHint")}>{t("phoneNumberId")}</Label>
          <Input value={form.phoneNumberId} onChange={set("phoneNumberId")} autoComplete="off" />
        </div>
        <div>
          <Label hint={t("numberHint")}>{t("number")}</Label>
          <Input value={form.number} onChange={set("number")} inputMode="numeric" />
        </div>
        <div>
          <Label hint={data?.hasToken ? t("tokenKept") : t("tokenHint")}>{t("token")}</Label>
          <Input
            type="password"
            value={form.accessToken}
            onChange={set("accessToken")}
            placeholder={data?.hasToken ? "••••••••" : ""}
            autoComplete="new-password"
          />
        </div>
        <div>
          <Label hint={t("secretHint")}>{t("secret")}</Label>
          <Input
            type="password"
            value={form.appSecret}
            onChange={set("appSecret")}
            placeholder={data?.hasSecret ? "••••••••" : ""}
            autoComplete="new-password"
          />
        </div>
        <div>
          <Label hint={t("templateHint")}>{t("template")}</Label>
          <Input value={form.template} onChange={set("template")} autoComplete="off" />
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
          <div className="font-medium">{t("meta")}</div>
          <p className="text-[0.8125rem] text-ink-3">{t("metaHint")}</p>
          <Shown label={t("webhook")} value={data.webhook} />
          {data.verifyToken ? <Shown label={t("verifyToken")} value={data.verifyToken} /> : null}
          <div>
            <Label>{t("testTo")}</Label>
            <div className="flex items-center gap-2">
              <Input
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder="+43 660 …"
                inputMode="tel"
                className="max-w-xs"
              />
              <Button variant="secondary" onClick={() => test.mutate()} busy={test.isPending}>
                {t("sendTest")}
              </Button>
            </div>
            {test.isSuccess ? (
              <p className="mt-2 text-[0.8125rem] text-ink-3">{t("testSent")}</p>
            ) : null}
            {test.error ? (
              <p className="mt-2 text-[0.8125rem] text-rose">{errorText(test.error)}</p>
            ) : null}
          </div>
        </Card>
      ) : null}
    </section>
  );
}
