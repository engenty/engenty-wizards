import { Check } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Mascot } from "../brand";
import { type Key, t } from "../lib/i18n";
import { keepWish, signIn } from "../lib/session";
import { useGround } from "../lib/theme";
import { cn } from "../ui";
import {
  Choice,
  Dots,
  GROUND,
  GROUND_INK,
  Next,
  ON_GROUND,
  Quiet,
  SMALL_FIELD,
  Wordmark,
} from "./door";
import { LangSwitch } from "./LangSwitch";

/**
 * A guest's first wizard, from the cloud studio's front door: who they are in two questions, one
 * wizard suggested with its steps in view, a few details that make it theirs, and the account
 * only to keep it. Signed in, the new-wizard page builds it from the wish this page writes.
 */

type Text = Key;
const tx = (key: Text) => t(key);

type WizardId = "letter" | "reference" | "cancel" | "invoice" | "schedule" | "posts";
type Who = "me" | "business" | "creator" | "team";

interface First {
  kind: string;
  title: Text;
  pitch: Text;
  steps: [Text, Text, Text];
  keep: Text;
  help: Text;
  fields: { label: Text; example: Text }[];
  name: Text;
  also: [WizardId, WizardId];
}

/** The wizards a person is offered first: two or three real steps, a file they keep. */
const FIRST: Record<WizardId, First> = {
  letter: {
    kind: "pebble",
    title: "first.answerAnOfficialLetter",
    pitch: "first.photographTheLetterGetItIn",
    steps: ["first.photographTheLetter", "first.chooseWhatYouWantToDo", "first.checkYourReply"],
    keep: "first.replyLetterDeadlineInYourCalendar",
    help: "first.forTheReplyLetterYouCan",
    fields: [
      {
        label: "first.yourName",
        example: "first.eGMiaBerger",
      },
      {
        label: "first.yourAddress",
        example: "first.eGLindengasse41070Vienna",
      },
    ],
    name: "first.myLetters",
    also: ["reference", "cancel"],
  },
  reference: {
    kind: "tower",
    title: "first.checkYourReferenceLetter",
    pitch: "first.uploadYourReferenceSeeWhatEach",
    steps: ["first.photographOrUploadIt", "first.seeWhatItReallySays", "first.checkYourRequest"],
    keep: "first.sentenceBySentenceARequestFor",
    help: "first.forTheRequestLetterYouCan",
    fields: [
      {
        label: "first.yourName",
        example: "first.eGJonasWeber",
      },
    ],
    name: "first.myReferences",
    also: ["letter", "cancel"],
  },
  cancel: {
    kind: "wedge",
    title: "first.cancelAContract",
    pitch: "first.nameTheContractGetTheEarliest",
    steps: ["first.nameTheContract", "first.checkTheEndDate", "first.checkYourLetter"],
    keep: "first.cancellationLetterEndDateInYour",
    help: "first.forTheLetterYouCanLeave",
    fields: [
      {
        label: "first.yourName",
        example: "first.eGMiaBerger",
      },
      {
        label: "first.yourAddress",
        example: "first.eGLindengasse41070Vienna",
      },
    ],
    name: "first.myContracts",
    also: ["letter", "reference"],
  },
  invoice: {
    kind: "dome",
    title: "first.invoiceFromAVoiceNote",
    pitch: "first.sayWhatYouDidCheckThe",
    steps: ["first.sayWhatYouDid", "first.checkTheItems", "first.checkYourInvoice"],
    keep: "first.theInvoiceAsPdfAList",
    help: "first.itGoesOnEveryInvoiceCheck",
    fields: [
      {
        label: "first.business",
        example: "first.eGTischlereiHuber",
      },
      {
        label: "first.address",
        example: "first.eGHauptplatz34020Linz",
      },
      {
        label: "first.vatId",
        example: "first.eGAtu12345678",
      },
      {
        label: "first.bankAccount",
        example: "first.eGAt61190430023457",
      },
    ],
    name: "first.invoices",
    also: ["letter", "schedule"],
  },
  schedule: {
    kind: "sprout",
    title: "first.datesToEveryoneSCalendar",
    pitch: "first.photographTheScheduleCheckTheDates",
    steps: ["first.photographTheSchedule", "first.checkTheDates", "first.shareTheCalendar"],
    keep: "first.aCalendarLinkForTheTeam",
    help: "first.soTheCalendarHasTheRight",
    fields: [
      {
        label: "first.team",
        example: "first.eGSvLindauU12",
      },
      {
        label: "first.homeGround",
        example: "first.eGSportplatzLindau",
      },
    ],
    name: "first.gameDates",
    also: ["invoice", "letter"],
  },
  posts: {
    kind: "flame",
    title: "first.postKitFromOnePhoto",
    pitch: "first.onePhotoThreeCaptionsInYour",
    steps: ["first.chooseAPhoto", "first.sayWhatThePostShouldDo", "first.pickYourCaption"],
    keep: "first.threeCaptionsHashtagsAPictureDescription",
    help: "first.soTheCaptionsSoundLikeYou",
    fields: [
      {
        label: "first.yourAccount",
        example: "first.eGMiaMakes",
      },
      {
        label: "first.yourTone",
        example: "first.eGWarmALittleFunny",
      },
    ],
    name: "first.myPosts",
    also: ["invoice", "letter"],
  },
};

const WHO: { who: Who; label: Key; sub: Key }[] = [
  { who: "me", label: "first.whoMe", sub: "first.whoMeSub" },
  { who: "business", label: "first.whoBusiness", sub: "first.whoBusinessSub" },
  { who: "creator", label: "first.whoCreator", sub: "first.whoCreatorSub" },
  { who: "team", label: "first.whoTeam", sub: "first.whoTeamSub" },
];

/** The second question for each answer to the first; each choice leads to one wizard. */
const MORE: Record<
  Who,
  { title: Key; site: boolean; options: { id: string; label: Text; wizard: WizardId }[] }
> = {
  me: {
    title: "first.moreMe",
    site: false,
    options: [
      {
        id: "letters",
        label: "first.aLetterFromAnOffice",
        wizard: "letter",
      },
      {
        id: "job",
        label: "first.somethingAboutMyJob",
        wizard: "reference",
      },
      {
        id: "contracts",
        label: "first.aContractIWantToEnd",
        wizard: "cancel",
      },
    ],
  },
  business: {
    title: "first.moreBusiness",
    site: true,
    options: [
      { id: "trades", label: "first.tradesAndCrafts", wizard: "invoice" },
      { id: "shop", label: "first.aShop", wizard: "invoice" },
      {
        id: "office",
        label: "first.officeAndServices",
        wizard: "invoice",
      },
      { id: "other", label: "first.somethingElse", wizard: "invoice" },
    ],
  },
  creator: {
    title: "first.moreCreator",
    site: true,
    options: [
      { id: "instagram", label: "first.instagram", wizard: "posts" },
      { id: "linkedin", label: "first.linkedin", wizard: "posts" },
      { id: "tiktok", label: "first.tiktok", wizard: "posts" },
    ],
  },
  team: {
    title: "first.moreTeam",
    site: false,
    options: [
      { id: "sport", label: "first.aSportsClub", wizard: "schedule" },
      { id: "assoc", label: "first.anAssociation", wizard: "schedule" },
      {
        id: "work",
        label: "first.aTeamAtWork",
        wizard: "schedule",
      },
    ],
  },
};

type Page = "start" | "who" | "more" | "suggest" | "yours" | "keep";
const STEP: Record<Page, number> = { start: 0, who: 1, more: 2, suggest: 3, yours: 4, keep: 4 };

/** What the new-wizard page builds once the person is signed in, in their language. */
function wishOf(w: First, name: string, details: string[], site: string) {
  const steps = w.steps.map((s, i) => `${i + 1}. ${tx(s)}`).join(" ");
  return [
    `${tx(w.title)}: ${tx(w.pitch)}`,
    `${t("first.wishSteps")}: ${steps}`,
    `${t("first.wishResult")}: ${tx(w.keep)}.`,
    `${t("first.wishName")}: ${name}`,
    ...details,
    site ? `${t("first.wishSite")}: ${site}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function FirstWizard({ onOwn }: { onOwn: () => void }) {
  useGround(GROUND);
  const [page, setPage] = useState<Page>("start");
  const [who, setWho] = useState<Who | null>(null);
  const [more, setMore] = useState<string | null>(null);
  const [site, setSite] = useState("");
  const [picked, setPicked] = useState<WizardId | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const fromAnswers =
    who && more ? MORE[who].options.find((o) => o.id === more)?.wizard : undefined;
  const id: WizardId = picked ?? fromAnswers ?? "letter";
  const w = FIRST[id];
  const defaultName = id === "invoice" && values.f0 ? `${tx(w.name)} – ${values.f0}` : tx(w.name);
  const mascot = page === "start" ? "round" : page === "who" || page === "more" ? "drop" : w.kind;

  const keep = () => {
    const details = w.fields
      .map((f, i) => (values[`f${i}`]?.trim() ? `${tx(f.label)}: ${values[`f${i}`].trim()}` : ""))
      .filter(Boolean);
    const wish = wishOf(w, name.trim() || defaultName, details, site.trim());
    setBusy(true);
    keepWish(wish);
    signIn("/new", wish);
  };

  return (
    <div
      className="flex min-h-dvh flex-col px-6 text-white sm:px-10"
      style={{ ...ON_GROUND, background: GROUND }}
    >
      <header className="flex items-center justify-between gap-4 pt-6 sm:pt-8">
        <Wordmark />
        <span className="flex items-center gap-5">
          <LangSwitch tone="ground" ink={GROUND_INK} />
          <Quiet onClick={() => signIn("/")}>{t("guest.signIn")}</Quiet>
        </span>
      </header>
      <main className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-10 py-10 lg:grid-cols-[5fr_7fr] lg:gap-12">
        <div className="flex flex-col items-center gap-6 max-lg:order-first">
          <Mascot kind={mascot} size={220} fluffy coat="fur" />
        </div>
        <div key={page} className="flex min-w-0 max-w-2xl animate-rise flex-col gap-5">
          {page === "start" ? (
            <>
              <p className="font-medium text-[0.75rem] text-white/85 uppercase tracking-[0.14em]">
                {t("first.kicker")}
              </p>
              <h1 className="font-display font-bold text-[2.5rem] leading-[1.05] tracking-[-0.02em] sm:text-[3.25rem]">
                {t("first.title")}
              </h1>
              <p className="text-[1.0625rem] text-white/90 leading-relaxed">{t("first.sub")}</p>
              <ul className="grid gap-2.5">
                {(["first.ex1", "first.ex2", "first.ex3"] as const).map((key) => (
                  <li
                    key={key}
                    className="rounded-[18px] border border-white/25 bg-white/10 px-5 py-3.5"
                  >
                    <span className="block font-display font-semibold text-[1.0625rem]">
                      {t(key)}
                    </span>
                    <span className="text-[0.9375rem] text-white/80">
                      → {t(`${key}Sub` as Key)}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap items-center gap-6 pt-1">
                <Next onClick={() => setPage("who")}>{t("first.start")}</Next>
                <Quiet onClick={onOwn}>{t("first.own")}</Quiet>
              </div>
            </>
          ) : null}

          {page === "who" ? (
            <>
              <h1 className="font-display font-bold text-[2.25rem] leading-[1.05] tracking-[-0.02em] sm:text-[2.75rem]">
                {t("first.whoTitle")}
              </h1>
              <div className="grid gap-3 sm:grid-cols-2">
                {WHO.map((option) => (
                  <Choice
                    key={option.who}
                    picked={who === option.who}
                    label={t(option.label)}
                    sub={t(option.sub)}
                    onClick={() => {
                      if (who !== option.who) {
                        setMore(null);
                        setPicked(null);
                      }
                      setWho(option.who);
                    }}
                  />
                ))}
              </div>
              <Footer step={STEP.who} onBack={() => setPage("start")}>
                <Next onClick={() => who && setPage("more")}>{t("first.next")}</Next>
              </Footer>
            </>
          ) : null}

          {page === "more" && who ? (
            <>
              <h1 className="font-display font-bold text-[2.25rem] leading-[1.05] tracking-[-0.02em] sm:text-[2.75rem]">
                {t(MORE[who].title)}
              </h1>
              <div className="grid gap-3 sm:grid-cols-2">
                {MORE[who].options.map((option) => (
                  <Choice
                    key={option.id}
                    picked={more === option.id}
                    label={tx(option.label)}
                    sub=""
                    onClick={() => {
                      setMore(option.id);
                      setPicked(null);
                    }}
                  />
                ))}
              </div>
              {MORE[who].site ? (
                <label className="flex flex-col gap-2 text-[0.9375rem] text-white/85">
                  {t("first.site")}
                  <input
                    value={site}
                    onChange={(e) => setSite(e.target.value)}
                    inputMode="url"
                    placeholder={t("first.sitePlaceholder")}
                    className={SMALL_FIELD}
                  />
                  <span className="text-[0.8125rem] text-white/70">{t("first.siteHelp")}</span>
                </label>
              ) : null}
              <Footer step={STEP.more} onBack={() => setPage("who")}>
                <Next onClick={() => more && setPage("suggest")}>{t("first.next")}</Next>
              </Footer>
            </>
          ) : null}

          {page === "suggest" ? (
            <>
              <p className="font-medium text-[0.75rem] text-white/85 uppercase tracking-[0.14em]">
                {t("first.forYou")}
              </p>
              <h1 className="font-display font-bold text-[2.25rem] leading-[1.05] tracking-[-0.02em] sm:text-[2.75rem]">
                {tx(w.title)}
              </h1>
              <p className="text-[1.0625rem] text-white/90 leading-relaxed">{tx(w.pitch)}</p>
              <ol className="grid gap-2 rounded-[18px] border border-white/25 bg-white/10 p-4">
                {w.steps.map((s, i) => (
                  <li key={s} className="flex items-center gap-3 text-[1rem]">
                    <span className="grid size-7 shrink-0 place-items-center rounded-full bg-white/20 font-semibold text-[0.875rem]">
                      {i + 1}
                    </span>
                    {tx(s)}
                  </li>
                ))}
                <li className="flex items-center gap-3 border-white/20 border-t pt-2.5 text-[0.9375rem] text-white/90">
                  <span
                    className="grid size-7 shrink-0 place-items-center rounded-full bg-white"
                    style={{ color: GROUND_INK }}
                  >
                    <Check className="size-4" />
                  </span>
                  <span>
                    <span className="font-semibold">{t("first.youKeep")}:</span> {tx(w.keep)}
                  </span>
                </li>
              </ol>
              <Footer step={STEP.suggest} onBack={() => setPage("more")}>
                <Next onClick={() => setPage("yours")}>{t("first.setUp")}</Next>
              </Footer>
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 pt-2 text-[0.9375rem]">
                <span className="text-white/75">{t("first.also")}:</span>
                {w.also.map((other) => (
                  <button
                    key={other}
                    type="button"
                    onClick={() => setPicked(other)}
                    className="cursor-pointer font-semibold text-white underline decoration-white/40 underline-offset-4 hover:decoration-white"
                  >
                    {tx(FIRST[other].title)}
                  </button>
                ))}
              </div>
            </>
          ) : null}

          {page === "yours" ? (
            <form
              className="contents"
              onSubmit={(e) => {
                e.preventDefault();
                setPage("keep");
              }}
            >
              <h1 className="font-display font-bold text-[2.25rem] leading-[1.05] tracking-[-0.02em] sm:text-[2.75rem]">
                {t("first.yoursTitle")}
              </h1>
              <p className="text-[1.0625rem] text-white/90 leading-relaxed">{tx(w.help)}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {w.fields.map((f, i) => (
                  <label
                    key={f.label}
                    className="flex flex-col gap-1.5 text-[0.875rem] text-white/85"
                  >
                    {tx(f.label)}
                    <input
                      value={values[`f${i}`] ?? ""}
                      onChange={(e) => setValues((v) => ({ ...v, [`f${i}`]: e.target.value }))}
                      placeholder={tx(f.example)}
                      className={SMALL_FIELD}
                    />
                  </label>
                ))}
              </div>
              <label className="flex flex-col gap-1.5 text-[0.875rem] text-white/85">
                {t("first.wizardName")}
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={defaultName}
                  className={SMALL_FIELD}
                />
              </label>
              <Footer step={STEP.yours} onBack={() => setPage("suggest")}>
                <Next type="submit">{t("first.keep")}</Next>
              </Footer>
            </form>
          ) : null}

          {page === "keep" ? (
            <>
              <h1 className="font-display font-bold text-[2.25rem] leading-[1.05] tracking-[-0.02em] sm:text-[2.75rem]">
                {t("first.keepTitle")}
              </h1>
              <p className="text-[1.0625rem] text-white/90 leading-relaxed">{t("first.keepSub")}</p>
              <figure className="rounded-[18px] bg-white/15 px-5 py-4">
                <figcaption className="font-display font-semibold text-[1.25rem]">
                  {name.trim() || defaultName}
                </figcaption>
                <p className="mt-1 text-[0.9375rem] text-white/85">
                  {w.steps.map((s) => tx(s)).join(" · ")}
                </p>
              </figure>
              <Footer step={STEP.keep} onBack={() => setPage("yours")}>
                <Next busy={busy} onClick={keep}>
                  {t("first.keepButton")}
                </Next>
              </Footer>
              <p className="text-[0.875rem] text-white/80">{t("first.keepWays")}</p>
            </>
          ) : null}
        </div>
      </main>
    </div>
  );
}

/** The way on, the way back and where the person stands. */
function Footer({
  step,
  onBack,
  children,
}: {
  step: number;
  onBack: () => void;
  children: ReactNode;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-6 pt-1")}>
      {children}
      <Quiet onClick={onBack}>{t("first.back")}</Quiet>
      <Dots step={step} />
    </div>
  );
}
