import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { t } from "../lib/i18n";
import type { HarnessId, Me } from "../lib/session";
import { Button, cn } from "../ui";
import { Terminal } from "./Terminal";

interface TestResult {
  ok: boolean;
  ref?: string;
  reply?: string;
  error?: string;
  ms: number;
}

/**
 * One short call on the classifier class, as a run would make it; the answer shows the way is
 * open. `auto`: the call is made right away — the setup tests by itself once a source is ready.
 */
export function ModelTest({ auto = false }: { auto?: boolean }) {
  const qc = useQueryClient();
  const test = useMutation({
    mutationFn: () => api.post<TestResult>("/api/studio/local/models/test", { cls: "classifier" }),
    // A working call ends the setup: the studio learns it from `me`.
    onSuccess: (r) => (r.ok ? qc.invalidateQueries({ queryKey: ["me"] }) : undefined),
  });
  const { mutate } = test;
  const started = useRef(false);
  useEffect(() => {
    if (auto && !started.current) {
      started.current = true;
      mutate();
    }
  }, [auto, mutate]);
  const r = test.data;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[13px] text-ink-3">{t("local.testHint")}</p>
      <div>
        <Button variant="secondary" busy={test.isPending} onClick={() => test.mutate()}>
          {t("local.test")}
        </Button>
      </div>
      {r?.ok ? (
        <p className="flex items-start gap-2 text-[14px] text-ink-2">
          <Check className="mt-0.5 size-4 shrink-0 text-moss" />
          <span>
            {t("local.testOk", {
              s: (r.ms / 1000).toFixed(1),
              ref: r.ref ?? "",
              reply: r.reply ?? "",
            })}
          </span>
        </p>
      ) : null}
      {r && !r.ok ? (
        <p className="text-[14px] text-rose">{t("local.testFailed", { error: r.error ?? "" })}</p>
      ) : null}
      {test.isError ? (
        <p className="text-[14px] text-rose">
          {t("local.testFailed", { error: (test.error as Error).message })}
        </p>
      ) : null}
    </div>
  );
}

/**
 * One AI client on this machine: found with its version, how it is signed in, the sign-in
 * itself in an inline terminal, and the test call. The setup and the settings both show it.
 */
export function HarnessPanel({
  me,
  id,
  autoTest = false,
}: {
  me: Me;
  id: HarnessId;
  /** Make the test call without a click as soon as the client is signed in. */
  autoTest?: boolean;
}) {
  const qc = useQueryClient();
  const client = me.harnesses.find((h) => h.id === id);
  // The inline terminal runs the install or the sign-in; one of them at a time.
  const [terminal, setTerminal] = useState<{ id: string; job: "install" | "login" } | null>(null);
  const [ended, setEnded] = useState<number | null>(null);
  const recheck = useMutation({
    mutationFn: () => api.post(`/api/studio/local/harness/${id}/detect`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["me"] }),
  });
  const open = (job: "install" | "login") => ({
    mutationFn: () =>
      api.post<{ terminal: string }>(`/api/studio/local/harness/${id}/${job}`, {
        cols: 100,
        rows: 24,
      }),
    onSuccess: ({ terminal: started }: { terminal: string }) => {
      setTerminal({ id: started, job });
      setEnded(null);
    },
  });
  const install = useMutation(open("install"));
  const login = useMutation(open("login"));
  const signedIn = client?.auth === "subscription";
  const installed = client ? client.version !== null : false;
  // What the terminal was for is there and its command is over: it has done its job.
  useEffect(() => {
    if (ended !== null && (terminal?.job === "install" ? installed : signedIn)) {
      setTerminal(null);
    }
  }, [signedIn, installed, ended, terminal?.job]);
  if (!client) {
    return null;
  }
  const sub = t(`harness.sub.${id}`);
  const again = (
    <Button variant="ghost" size="sm" busy={recheck.isPending} onClick={() => recheck.mutate()}>
      <RefreshCw className="size-3.5" /> {t("local.recheck")}
    </Button>
  );
  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] text-ink-3">{t("harness.hint", { name: client.name, sub })}</p>
      {installed ? (
        <div className="flex flex-col gap-2">
          <p className="flex items-center gap-2 text-[14px] text-ink-2">
            <Check className="size-4 text-moss" />
            {t("harness.found", { name: client.name, version: client.version ?? "" })}
          </p>
          <p className={cn("text-[13px]", signedIn ? "text-ink-3" : "text-rose")}>
            {signedIn
              ? t("harness.authSubscription", { sub })
              : client.auth === "api_key"
                ? t("harness.authKey", { sub })
                : t("harness.authNone")}
          </p>
          {signedIn || terminal ? null : (
            <div className="flex flex-wrap items-center gap-2">
              <Button busy={login.isPending} onClick={() => login.mutate()}>
                {t("harness.signIn")}
              </Button>
              {again}
            </div>
          )}
          {login.isError ? (
            <p className="text-[13px] text-rose">{(login.error as Error).message}</p>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-[14px] text-rose">{t("harness.missing", { name: client.name })}</p>
          {client.app ? (
            <p className="text-[13px] text-ink-3">
              {t("harness.appHere", { app: client.app, name: client.name, sub })}
            </p>
          ) : null}
          {terminal ? null : (
            <div className="flex flex-wrap items-center gap-2">
              <Button busy={install.isPending} onClick={() => install.mutate()}>
                {t("harness.installButton", { name: client.name })}
              </Button>
              {again}
            </div>
          )}
          {install.isError ? (
            <p className="text-[13px] text-rose">{(install.error as Error).message}</p>
          ) : null}
          <p className="text-[13px] text-ink-3">
            {t("harness.install")}{" "}
            <code className="rounded bg-paper px-1.5 py-0.5 font-mono text-[12px] text-ink-2">
              {client.install}
            </code>
          </p>
        </div>
      )}
      {terminal ? (
        <div className="flex flex-col gap-2">
          <p className="text-[13px] text-ink-3">
            {terminal.job === "install"
              ? t("harness.installing", { name: client.name })
              : client.interactiveLogin
                ? t("harness.signInInteractive", { name: client.name, sub })
                : t("harness.signingIn")}
          </p>
          <Terminal
            key={terminal.id}
            id={terminal.id}
            onDone={() => recheck.mutate()}
            onExit={(code) => {
              setEnded(code);
              recheck.mutate();
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            {ended === null ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  void api.del(`/api/studio/local/terminal/${terminal.id}`).catch(() => undefined);
                  setTerminal(null);
                }}
              >
                {t("common.cancel")}
              </Button>
            ) : (
              <>
                <Button variant="ghost" size="sm" onClick={() => setTerminal(null)}>
                  {t("common.close")}
                </Button>
                {terminal.job === "install" ? (
                  installed ? null : (
                    <span className="text-[13px] text-rose">
                      {t("harness.installEnded", { name: client.name })}
                    </span>
                  )
                ) : signedIn ? null : (
                  <span className="text-[13px] text-rose">
                    {t("harness.loginEnded", { name: client.name })}
                  </span>
                )}
              </>
            )}
          </div>
        </div>
      ) : null}
      {/* A new sign-in is a new start: the test of the old one is put away. */}
      {installed ? (
        <ModelTest key={`${id}:${client.auth}`} auto={autoTest && client.auth !== "none"} />
      ) : null}
    </div>
  );
}
