import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Check, FileText, Upload } from "lucide-react";
import { type CSSProperties, type ReactNode, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { Mascot } from "../brand";
import { EngentyLogoMark } from "../engenty/logo";
import { api } from "../lib/api";
import { type Key, t } from "../lib/i18n";
import { pendingWish, useCurrentProject, useMe } from "../lib/session";
import { useGround } from "../lib/theme";
import { cn } from "../ui";
import { LangSwitch } from "./LangSwitch";

/** The ground the wizard stands on and the text on white, as on the landing page and the setup. */
const GROUND = "oklch(50% 0.2 262)";
const GROUND_INK = "oklch(32% 0.15 262)";
const CREAM = "oklch(90% 0.1 80)";

const ON_GROUND = {
  "--on": "white",
  "--dot": CREAM,
  "--ink-2": "oklch(96% 0.02 262)",
  "--ink-3": "oklch(90% 0.035 262)",
  "--moss": "oklch(90% 0.14 150)",
  "--rose": "oklch(89% 0.09 45)",
} as CSSProperties;

type Step = 1 | 2 | 3 | 4;

const FIELD =
  "w-full rounded-[18px] border border-white/30 bg-white/15 px-6 py-5 text-[1.375rem] text-white outline-none placeholder:text-white/55 focus:border-white/60";

function Wordmark() {
  return (
    <span className="inline-flex items-center gap-2.5">
      <EngentyLogoMark size={28} />
      <span className="font-display font-semibold text-[1.0625rem] tracking-tight">
        engenty
        <span className="mr-[0.09em] ml-[0.06em] text-(color:--dot)">.</span>
        <span className="font-normal text-white/70">wizards</span>
      </span>
    </span>
  );
}

/** The white pill that moves the wizard on. */
function Next({
  children,
  busy,
  onClick,
  type = "button",
}: {
  children: ReactNode;
  busy?: boolean;
  onClick?: () => void;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      disabled={busy}
      onClick={onClick}
      className="inline-flex h-13 cursor-pointer items-center gap-2.5 rounded-full bg-white px-7 font-semibold text-[1rem] transition hover:bg-white/90 disabled:cursor-default disabled:opacity-70"
      style={{ color: GROUND_INK }}
    >
      {children}
      <ArrowRight className="size-[18px]" />
    </button>
  );
}

/** The quiet way on, beside the pill: skip, or another way to answer. */
function Quiet({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="cursor-pointer font-semibold text-[0.9375rem] text-white/85 transition hover:text-white"
    >
      {children}
    </button>
  );
}

/** Four dots: where the person stands in the wizard. */
function Dots({ step }: { step: Step }) {
  return (
    <span
      className="ml-auto inline-flex gap-1.5"
      role="img"
      aria-label={t("onboard.step", { n: step })}
    >
      {[1, 2, 3, 4].map((n) => (
        <span
          key={n}
          className={cn("size-2 rounded-full", n === step ? "bg-white" : "bg-white/40")}
        />
      ))}
    </span>
  );
}

interface Outcome {
  name: string;
  about: boolean;
  colors: number;
  logo: boolean;
}

type UploadState = { name: string; state: "uploading" | "done" | "failed" };

/**
 * The first visit of a team's studio in the cloud, as a wizard of the product's own kind: one
 * question per page, the engenty beside it. Who the team is, where its website is, what the
 * wizards should know, and what the space is that holds all of it. Every page but the first
 * can be skipped; everything can be changed later under Space and Settings.
 */
export function OnboardingPage() {
  useGround(GROUND);
  const me = useMe();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { project } = useCurrentProject();
  const [step, setStep] = useState<Step>(1);
  const [team, setTeam] = useState("");
  const [site, setSite] = useState("");
  const [line, setLine] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [uploads, setUploads] = useState<UploadState[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  // A wish typed before signing in (GuestStartPage): in sight here, built on "new" right after.
  const [wish] = useState(pendingWish);

  const rename = useMutation({
    mutationFn: (name: string) => api.put("/api/studio/team", { name }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["team"] }),
  });
  const read = useMutation({
    mutationFn: (url: string) =>
      api.post<Outcome>(`/api/studio/projects/${project?.id}/website`, { url }),
    onSuccess: async (result) => {
      setOutcome(result);
      await qc.invalidateQueries({ queryKey: ["projects"] });
    },
  });
  const about = useMutation({
    mutationFn: (text: string) =>
      api.patch(`/api/studio/projects/${project?.id}`, { brand: { about: text } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects"] }),
  });
  const finish = useMutation({
    mutationFn: () => api.post("/api/studio/onboarding/done"),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["me"] });
      navigate("/new", { replace: true });
    },
  });

  // A sign-up by e-mail link has no name yet: the address is no way to greet someone.
  const name = me.data?.user.name ?? "";
  const firstName = name.includes("@") ? "" : name.split(" ")[0];

  const addFiles = async (files: FileList | null) => {
    if (!files || !project) {
      return;
    }
    for (const file of Array.from(files)) {
      setUploads((u) => [...u, { name: file.name, state: "uploading" }]);
      try {
        await api.upload(`/api/studio/projects/${project.id}/files?kind=document`, file);
        setUploads((u) => u.map((x) => (x.name === file.name ? { ...x, state: "done" } : x)));
      } catch {
        setUploads((u) => u.map((x) => (x.name === file.name ? { ...x, state: "failed" } : x)));
      }
    }
    await qc.invalidateQueries({ queryKey: ["projects"] });
  };

  const details = outcome
    ? [
        outcome.about ? t("onboard.readAbout") : "",
        outcome.colors ? t("onboard.readColors", { n: outcome.colors }) : "",
        outcome.logo ? t("onboard.readLogo") : "",
      ].join("")
    : "";

  return (
    <div
      className="flex min-h-dvh flex-col px-6 text-white sm:px-10"
      style={{ ...ON_GROUND, background: GROUND }}
    >
      <header className="flex items-center justify-between pt-6 sm:pt-8">
        <Wordmark />
        <LangSwitch tone="ground" ink={GROUND_INK} />
      </header>
      <main className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-10 py-10 lg:grid-cols-[5fr_7fr] lg:gap-12">
        <div className="flex flex-col items-center gap-8 max-lg:order-first">
          <Mascot kind="drop" size={240} fluffy coat="fur" />
          {wish ? (
            <figure className="w-full max-w-sm rounded-[18px] bg-white/15 px-5 py-4">
              <figcaption className="font-medium text-[0.75rem] text-white/85 uppercase tracking-[0.14em]">
                {t("onboard.wish")}
              </figcaption>
              <blockquote className="mt-1.5 line-clamp-6 whitespace-pre-line break-words text-[1rem] leading-relaxed">
                {wish}
              </blockquote>
              <p className="mt-2 text-[0.8125rem] text-white/75">{t("onboard.wishNext")}</p>
            </figure>
          ) : null}
        </div>
        <div key={step} className="flex min-w-0 max-w-2xl animate-rise flex-col gap-5">
          {step === 1 ? (
            <form
              className="contents"
              onSubmit={(e) => {
                e.preventDefault();
                const name = team.trim();
                if (name) {
                  rename.mutate(name, { onSuccess: () => setStep(2) });
                } else {
                  setStep(2);
                }
              }}
            >
              <p className="font-medium text-[0.75rem] text-white/85 uppercase tracking-[0.14em]">
                {firstName ? t("onboard.kicker1", { name: firstName }) : t("onboard.kicker1Anon")}
              </p>
              <h1 className="font-display font-bold text-[2.5rem] leading-[1.05] tracking-[-0.02em] sm:text-[3.25rem]">
                {t("onboard.team")}
              </h1>
              <p className="text-[1.0625rem] text-white/90 leading-relaxed">
                {t("onboard.teamSub")}
              </p>
              <input
                value={team}
                onChange={(e) => setTeam(e.target.value)}
                placeholder={t("onboard.teamPlaceholder")}
                maxLength={80}
                aria-label={t("onboard.team")}
                className={FIELD}
              />
              <div className="flex flex-wrap items-center gap-5">
                <Next type="submit" busy={rename.isPending}>
                  {t("onboard.continue")}
                </Next>
                <Dots step={1} />
              </div>
            </form>
          ) : null}

          {step === 2 ? (
            <>
              <p className="font-medium text-[0.75rem] text-white/85 uppercase tracking-[0.14em]">
                {t("onboard.kicker2")}
              </p>
              <h1 className="font-display font-bold text-[2.5rem] leading-[1.05] tracking-[-0.02em] sm:text-[3.25rem]">
                {t("onboard.site")}
              </h1>
              <p className="text-[1.0625rem] text-white/90 leading-relaxed">
                {t("onboard.siteSub")}
              </p>
              {line === null ? (
                <form
                  className="contents"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (site.trim() && !read.isPending) {
                      read.mutate(site.trim());
                    }
                  }}
                >
                  <input
                    value={site}
                    onChange={(e) => setSite(e.target.value)}
                    placeholder={t("onboard.sitePlaceholder")}
                    inputMode="url"
                    autoCapitalize="none"
                    aria-label={t("onboard.site")}
                    className={FIELD}
                  />
                  {outcome ? (
                    <p className="flex items-center gap-2 text-[0.9375rem] text-(color:--moss)">
                      <Check className="size-4" />
                      {t("onboard.readDone", { name: outcome.name, details })}
                    </p>
                  ) : read.isError ? (
                    <p className="text-[0.9375rem] text-(color:--rose)">
                      {t("onboard.readFailed")}
                    </p>
                  ) : null}
                  <div className="flex flex-wrap items-center gap-5">
                    {outcome ? (
                      <Next onClick={() => setStep(3)}>{t("onboard.continue")}</Next>
                    ) : (
                      <Next type="submit" busy={read.isPending}>
                        {read.isPending ? t("onboard.reading") : t("onboard.read")}
                      </Next>
                    )}
                    <Quiet onClick={() => setLine("")}>{t("onboard.line")}</Quiet>
                    <Quiet onClick={() => setStep(3)}>{t("onboard.skip")}</Quiet>
                    <Dots step={2} />
                  </div>
                </form>
              ) : (
                <form
                  className="contents"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const text = line.trim();
                    if (text) {
                      about.mutate(text, { onSuccess: () => setStep(3) });
                    } else {
                      setStep(3);
                    }
                  }}
                >
                  <textarea
                    value={line}
                    onChange={(e) => setLine(e.target.value)}
                    placeholder={t("onboard.linePlaceholder")}
                    rows={3}
                    maxLength={8000}
                    aria-label={t("onboard.line")}
                    className={cn(FIELD, "resize-none text-[1.125rem] leading-relaxed")}
                  />
                  <div className="flex flex-wrap items-center gap-5">
                    <Next type="submit" busy={about.isPending}>
                      {t("onboard.continue")}
                    </Next>
                    <Quiet onClick={() => setLine(null)}>{t("onboard.site")}</Quiet>
                    <Quiet onClick={() => setStep(3)}>{t("onboard.skip")}</Quiet>
                    <Dots step={2} />
                  </div>
                </form>
              )}
            </>
          ) : null}

          {step === 3 ? (
            <>
              <p className="font-medium text-[0.75rem] text-white/85 uppercase tracking-[0.14em]">
                {t("onboard.kicker3")}
              </p>
              <h1 className="font-display font-bold text-[2.5rem] leading-[1.05] tracking-[-0.02em] sm:text-[3.25rem]">
                {t("onboard.know")}
              </h1>
              <p className="text-[1.0625rem] text-white/90 leading-relaxed">
                {t("onboard.knowSub")}
              </p>
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  void addFiles(e.dataTransfer.files);
                }}
                className="flex cursor-pointer flex-col items-center gap-2 rounded-[18px] border-2 border-white/45 border-dashed bg-white/10 px-6 py-7 text-center transition hover:bg-white/15"
              >
                <Upload className="size-7" />
                <span className="font-semibold text-[1.0625rem]">{t("onboard.drop")}</span>
                <span className="text-[0.875rem] text-white/80">PDF · Word · Excel · Markdown</span>
                <input
                  ref={fileInput}
                  type="file"
                  multiple
                  className="sr-only"
                  onChange={(e) => {
                    void addFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
              </button>
              {uploads.length ? (
                <ul className="flex flex-col gap-2">
                  {uploads.map((u) => (
                    <li
                      key={u.name}
                      className="flex items-center gap-2.5 rounded-xl bg-white/15 px-3.5 py-2.5 text-[0.875rem]"
                    >
                      <FileText className="size-4 shrink-0" />
                      <span className="min-w-0 flex-1 truncate">{u.name}</span>
                      <span
                        className={cn(
                          "text-white/80",
                          u.state === "failed" ? "text-(color:--rose)" : "",
                        )}
                      >
                        {u.state === "uploading"
                          ? t("onboard.uploading")
                          : u.state === "done"
                            ? t("onboard.uploaded")
                            : t("onboard.uploadFailed")}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
              <div className="flex flex-wrap items-center gap-5">
                <Next
                  busy={uploads.some((u) => u.state === "uploading")}
                  onClick={() => setStep(4)}
                >
                  {t("onboard.continue")}
                </Next>
                {uploads.length ? null : (
                  <Quiet onClick={() => setStep(4)}>{t("onboard.skip")}</Quiet>
                )}
                <Dots step={3} />
              </div>
            </>
          ) : null}

          {step === 4 ? (
            <>
              <p className="font-medium text-[0.75rem] text-white/85 uppercase tracking-[0.14em]">
                {t("onboard.kicker4")}
              </p>
              <h1 className="font-display font-bold text-[2.5rem] leading-[1.05] tracking-[-0.02em] sm:text-[3.25rem]">
                {t("onboard.space")}
              </h1>
              <p className="text-[1.0625rem] text-white/90 leading-relaxed">
                {t("onboard.spaceSub", { space: project?.name ?? "" })}
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {(
                  [
                    ["partInfo", "partInfoText", Boolean(outcome || line)],
                    ["partKnow", "partKnowText", uploads.some((u) => u.state === "done")],
                    ["partData", "partDataText", false],
                    ["partResults", "partResultsText", false],
                  ] as const
                ).map(([title, text, done]) => (
                  <div
                    key={title}
                    className="flex flex-col gap-1.5 rounded-2xl border border-white/20 bg-white/10 px-4.5 py-4"
                  >
                    <span className="flex items-center gap-2 font-semibold text-[1rem]">
                      {done ? <Check className="size-4 text-(color:--moss)" /> : null}
                      {t(`onboard.${title}` as Key)}
                    </span>
                    <span className="text-[0.84375rem] text-white/85 leading-snug">
                      {t(`onboard.${text}` as Key)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-5">
                <Next busy={finish.isPending} onClick={() => finish.mutate()}>
                  {t("onboard.build")}
                </Next>
                <Dots step={4} />
              </div>
            </>
          ) : null}
        </div>
      </main>
      <footer className="mx-auto flex w-full max-w-6xl items-center justify-between pb-6 text-[0.75rem] text-white/55 sm:pb-8">
        <span>engenty</span>
        <span aria-hidden="true" className="size-[3px] bg-(color:--dot)" />
      </footer>
    </div>
  );
}
