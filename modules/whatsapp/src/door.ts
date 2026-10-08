import type {
  PluginRunField,
  PluginRunReport,
  PluginRuns,
  PluginRunWaiting,
} from "@engenty-wizards/plugin-sdk";
import { type Account, clip, Graph, GraphError, type Outgoing, RE_ENGAGEMENT } from "./graph";
import type { Inbound } from "./inbound";
import {
  DONE_WORDS,
  type Key,
  type Lang,
  NO_WORDS,
  SKIP_WORDS,
  STOP_WORDS,
  say,
  YES_WORDS,
} from "./say";

/**
 * The conversation: one thread per number, one run at a time. A page is asked one field per
 * message (buttons for a few choices, a list for more, a location request, a photo in the
 * chat); a page with a field the thread cannot take goes to the screen as a link, and the
 * thread goes on when it was filled there. Reviews and questions are two buttons; what the
 * wizard makes arrives as pictures, documents and a link to the run page.
 */

export const RUNNER = "whatsapp";

/** The field kinds the thread asks itself; any other on a page hands the page to the screen. */
export const ASKS = new Set([
  "text",
  "textarea",
  "number",
  "select",
  "multiselect",
  "date",
  "email",
  "url",
  "toggle",
  "image",
  "file",
  "location",
  "audio",
]);

const DAY = 24 * 3600_000;

export interface PageDraft {
  step: string;
  values: Record<string, unknown>;
  /** The field the last question was about. */
  asking: string | null;
  /** A multiple choice so far, and the files of a field that takes several. */
  picks: string[];
  files: string[];
}

export interface ThreadState {
  lang: Lang;
  wizardId: string | null;
  page: PageDraft | null;
  /** At a review: which output to make again, then what should change. */
  awaiting: "target" | "note" | null;
  target: string | null;
  /** What was said once already: "working on X", the review, the question, the link to the screen. */
  said: string | null;
  delivered: boolean;
}

export interface Thread {
  waId: string;
  name: string | null;
  runId: string | null;
  state: ThreadState;
  lastInboundAt: number;
  lastMessageId: string | null;
}

export const freshState = (lang: Lang = "de"): ThreadState => ({
  lang,
  wizardId: null,
  page: null,
  awaiting: null,
  target: null,
  said: null,
  delivered: false,
});

export interface Offered {
  wizardId: string;
  token: string;
  title: string;
  lang: Lang;
}

export interface DoorDeps {
  runs: PluginRuns;
  /** The tenant's number; null while none is connected. */
  account: () => Promise<Account | null>;
  offered: () => Promise<Offered[]>;
  /** The keyword of every wizard, by wizard id. */
  keywords: () => Promise<Map<string, string>>;
  /** Keep hearing the run, and go on in the thread when it changes. */
  watch: (thread: Thread) => void;
  unwatch: (runId: string) => void;
  log: { warn: (...args: unknown[]) => void };
}

type PageWaiting = Extract<PluginRunWaiting, { page: string }>;
type ReviewWaiting = Extract<PluginRunWaiting, { review: string }>;
type AskWaiting = Extract<PluginRunWaiting, { ask: string }>;

type Taken = { kind: "value"; value: unknown } | { kind: "again"; hint: string } | { kind: "wait" };

const shownOf = (w: PageWaiting) => w.fields.filter((f) => f.shown !== false);

/** `24.12.2026`, `24/12/26` or an ISO date, as the page's date input gives it. */
export function toIso(text: string): string | null {
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    return text;
  }
  const dmy = text.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2,4})$/);
  if (!dmy) {
    return null;
  }
  const [, d, m, y] = dmy;
  const year = y.length === 2 ? `20${y}` : y;
  const date = new Date(Number(year), Number(m) - 1, Number(d));
  if (date.getMonth() !== Number(m) - 1 || date.getDate() !== Number(d)) {
    return null;
  }
  return `${year}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

const extOf = (mime: string) =>
  ({
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "application/pdf": "pdf",
    "audio/ogg": "ogg",
    "audio/mpeg": "mp3",
    "video/mp4": "mp4",
  })[mime] ?? "bin";

/** Which option a reply means: a tap on `o:<i>`, a number, or the option's own words. */
function optionIndex(msg: Inbound, options: string[]): number {
  if (msg.replyId?.startsWith("o:")) {
    const i = Number(msg.replyId.slice(2));
    return Number.isInteger(i) && options[i] !== undefined ? i : -1;
  }
  const text = (msg.text ?? "").trim();
  if (/^\d+$/.test(text)) {
    const n = Number(text);
    return n >= 1 && n <= options.length ? n - 1 : -1;
  }
  const lower = text.toLowerCase();
  return options.findIndex((o) => o.toLowerCase() === lower);
}

export class Door {
  constructor(private readonly deps: DoorDeps) {}

  // ── What comes in ────────────────────────────────────────────────────────

  /** A message of the person arrived. */
  async inbound(thread: Thread, msg: Inbound): Promise<void> {
    const text = (msg.text ?? "").trim();
    const lower = text.toLowerCase();
    void this.graph()
      .then((g) => g.markRead(msg.id))
      .catch(() => undefined);
    // A keyword starts its wizard, from anywhere in the thread; so does a pick from the menu.
    const offered = await this.deps.offered();
    const keywords = await this.deps.keywords();
    const byKeyword = lower
      ? offered.find((w) => (keywords.get(w.wizardId) ?? "").toLowerCase() === lower)
      : undefined;
    const byMenu = msg.replyId?.startsWith("w:")
      ? offered.find((w) => `w:${w.wizardId}` === msg.replyId)
      : undefined;
    const picked = byKeyword ?? byMenu;
    if (picked) {
      await this.start(thread, picked);
      return;
    }
    if (STOP_WORDS.has(lower)) {
      await this.stop(thread);
      return;
    }
    if (!thread.runId) {
      await this.menu(thread, offered);
      return;
    }
    const report = await this.report(thread);
    if (!report) {
      thread.runId = null;
      await this.menu(thread, offered);
      return;
    }
    await this.step(thread, report, msg);
  }

  /** The run changed while nobody wrote: a step ended, the page was filled on the screen. */
  async resume(thread: Thread): Promise<void> {
    if (!thread.runId) {
      return;
    }
    const report = await this.report(thread);
    if (report) {
      await this.step(thread, report, null);
    }
  }

  // ── Runs ─────────────────────────────────────────────────────────────────

  private async report(thread: Thread, waitSeconds = 0): Promise<PluginRunReport | null> {
    if (!thread.runId) {
      return null;
    }
    try {
      return await this.deps.runs.report(thread.runId, {
        waitSeconds,
        draft: thread.state.page?.values,
      });
    } catch (err) {
      if ((err as { code?: string }).code === "not_found") {
        return null;
      }
      throw err;
    }
  }

  private async start(thread: Thread, wizard: Offered): Promise<void> {
    if (thread.runId) {
      this.deps.unwatch(thread.runId);
    }
    thread.state = { ...freshState(wizard.lang), wizardId: wizard.wizardId };
    try {
      const { runId } = await this.deps.runs.start({
        token: wizard.token,
        person: { channel: RUNNER, id: thread.waId },
        runner: RUNNER,
      });
      thread.runId = runId;
    } catch (err) {
      thread.runId = null;
      await this.send(thread, { type: "text", text: (err as Error).message });
      return;
    }
    const report = await this.report(thread, 10);
    if (report) {
      await this.step(thread, report, null);
    }
  }

  private async stop(thread: Thread): Promise<void> {
    if (thread.runId) {
      this.deps.unwatch(thread.runId);
      await this.deps.runs.control(thread.runId, "cancel").catch(() => undefined);
      thread.runId = null;
    }
    thread.state = freshState(thread.state.lang);
    await this.send(thread, { type: "text", text: say(thread.state.lang, "stopped") });
  }

  private async menu(thread: Thread, offered: Offered[]): Promise<void> {
    const lang = thread.state.lang;
    if (!offered.length) {
      await this.send(thread, { type: "text", text: say(lang, "nothing") });
      return;
    }
    if (offered.length === 1) {
      await this.start(thread, offered[0]);
      return;
    }
    await this.send(thread, {
      type: "list",
      text: say(lang, "which"),
      button: say(lang, "choose"),
      rows: offered.map((w) => ({ id: `w:${w.wizardId}`, title: w.title })),
    });
  }

  /** Where the run stands, and what to do about it. `msg`: what the person just sent, if anything. */
  private async step(thread: Thread, report: PluginRunReport, msg: Inbound | null): Promise<void> {
    const s = thread.state;
    const runId = thread.runId!;
    if (report.status === "done") {
      if (s.delivered) {
        if (msg) {
          await this.send(thread, { type: "text", text: say(s.lang, "over") });
        }
        return;
      }
      await this.deliver(thread, report);
      return;
    }
    if (report.status === "failed" || report.status === "cancelled") {
      this.deps.unwatch(runId);
      thread.runId = null;
      if (report.status === "failed") {
        const url = await this.deps.runs.handoffUrl(runId).catch(() => report.browserUrl);
        await this.send(
          thread,
          url
            ? { type: "link", text: say(s.lang, "failed"), url, label: say(s.lang, "open") }
            : { type: "text", text: say(s.lang, "failed") },
        );
      } else {
        await this.send(thread, { type: "text", text: say(s.lang, "stopped") });
      }
      return;
    }
    const w = report.waitingFor;
    if (!w) {
      // The wizard works: said once, then the thread waits for the run to change.
      const key = `working:${report.step?.id ?? ""}`;
      if (s.said !== key) {
        s.said = key;
        await this.send(thread, {
          type: "text",
          text: say(s.lang, "working", { step: report.step?.title ?? "…" }),
        });
      }
      this.deps.watch(thread);
      return;
    }
    if ("page" in w) {
      await this.page(thread, w, msg);
    } else if ("review" in w) {
      await this.review(thread, report, w, msg);
    } else {
      await this.ask(thread, w, msg);
    }
  }

  /** The run moved on after a command: wait a little for it, then look again. */
  private async after(thread: Thread): Promise<void> {
    const report = await this.report(thread, 25);
    if (report) {
      await this.step(thread, report, null);
    }
  }

  // ── A page ───────────────────────────────────────────────────────────────

  private async page(thread: Thread, waiting: PageWaiting, msg: Inbound | null): Promise<void> {
    const s = thread.state;
    let w = waiting;
    if (!s.page || s.page.step !== w.page) {
      s.page = { step: w.page, values: {}, asking: null, picks: [], files: [] };
    }
    const page = s.page;
    let fields = shownOf(w);
    // A field only the screen can take (a signature, a sign-in): the whole page goes there.
    if (fields.some((f) => !ASKS.has(f.kind))) {
      const key = `screen:${w.page}`;
      if (s.said !== key || msg) {
        s.said = key;
        await this.handoff(thread, "screen");
      }
      this.deps.watch(thread);
      return;
    }
    if (msg && page.asking) {
      const field = fields.find((f) => f.id === page.asking);
      if (field) {
        const taken = await this.take(thread, field, msg);
        if (taken.kind === "again") {
          await this.askField(thread, field, taken.hint);
          return;
        }
        if (taken.kind === "wait") {
          return;
        }
        page.values[field.id] = taken.value;
        page.asking = null;
        page.picks = [];
        page.files = [];
        // A later field's condition may read this answer: the page is read again with it.
        const again = await this.report(thread);
        if (!again) {
          return;
        }
        if (
          !again.waitingFor ||
          !("page" in again.waitingFor) ||
          again.waitingFor.page !== w.page
        ) {
          await this.step(thread, again, null);
          return;
        }
        w = again.waitingFor;
        fields = shownOf(w);
      }
    }
    const next = fields.find((f) => !(f.id in page.values));
    if (next) {
      page.asking = next.id;
      await this.askField(thread, next);
      return;
    }
    // Every field has its answer: the page is sent.
    try {
      await this.deps.runs.answerPage(thread.runId!, w.page, page.values);
    } catch (err) {
      const wrong = (
        (err as { data?: { fields?: { field: string; message: string }[] } }).data?.fields ?? []
      ).find((e) => e.field in page.values);
      const field = wrong ? fields.find((f) => f.id === wrong.field) : undefined;
      if (wrong && field) {
        delete page.values[wrong.field];
        page.asking = wrong.field;
        await this.askField(thread, field, wrong.message);
        return;
      }
      await this.send(thread, { type: "text", text: (err as Error).message });
      return;
    }
    s.page = null;
    s.said = null;
    await this.after(thread);
  }

  /** The question for a field, with the buttons or the list it takes. `hint` first: what was wrong. */
  private async askField(thread: Thread, field: PluginRunField, hint?: string): Promise<void> {
    const { lang } = thread.state;
    const page = thread.state.page!;
    const lines = [field.label, field.help].filter((x): x is string => Boolean(x));
    if (!field.required && field.kind !== "toggle") {
      lines.push(say(lang, "optional"));
    }
    if (field.kind === "date") {
      lines.push(say(lang, "asDate"));
    }
    const text = [hint, lines.join("\n")].filter(Boolean).join("\n\n");
    const options = field.options ?? [];
    const numbered = (list: string[]) => list.map((o, i) => `${i + 1}. ${o}`).join("\n");
    switch (field.kind) {
      case "select": {
        if (options.length <= 3 && options.every((o) => o.length <= 20)) {
          return this.send(thread, {
            type: "buttons",
            text,
            buttons: options.map((o, i) => ({ id: `o:${i}`, title: o })),
          });
        }
        if (options.length <= 10) {
          return this.send(thread, {
            type: "list",
            text,
            button: say(lang, "choose"),
            rows: options.map((o, i) => ({ id: `o:${i}`, title: o })),
          });
        }
        return this.send(thread, {
          type: "text",
          text: `${text}\n\n${numbered(options)}\n\n${say(lang, "pickNumber")}`,
        });
      }
      case "multiselect": {
        const picked = page.picks.length
          ? `\n\n${say(lang, "picked", { list: page.picks.join(", ") })}`
          : "";
        if (options.length <= 9) {
          const rows = options
            .map((o, i) => ({ id: `o:${i}`, title: o }))
            .filter((r) => !page.picks.includes(r.title));
          if (page.picks.length) {
            rows.push({ id: "done", title: `✓ ${say(lang, "done")}` });
          }
          return this.send(thread, {
            type: "list",
            text: `${page.picks.length ? say(lang, "more") : text}${picked}`,
            button: say(lang, "choose"),
            rows,
          });
        }
        return this.send(thread, {
          type: "text",
          text: `${text}\n\n${numbered(options)}\n\n${say(lang, "pickNumber")}${picked}`,
        });
      }
      case "toggle":
        return this.send(thread, {
          type: "buttons",
          text,
          buttons: [
            { id: "t:1", title: say(lang, "yes") },
            { id: "t:0", title: say(lang, "no") },
          ],
        });
      case "image":
      case "file": {
        const ask = say(lang, field.kind === "image" ? "sendPhoto" : "sendFile");
        if (page.files.length) {
          return this.send(thread, {
            type: "buttons",
            text: `${say(lang, "more")} (${page.files.length})`,
            buttons: [
              { id: "f:more", title: say(lang, "another") },
              { id: "f:done", title: say(lang, "done") },
            ],
          });
        }
        return this.send(thread, { type: "text", text: `${text}\n${ask}` });
      }
      case "audio":
        return this.send(thread, { type: "text", text: `${text}\n${say(lang, "sendVoice")}` });
      case "location":
        return this.send(thread, {
          type: "location_request",
          text: `${text}\n${say(lang, "whereAre")}`,
        });
      default:
        return this.send(thread, { type: "text", text });
    }
  }

  /** What the message means for the field: its value, a second try with a hint, or more to come. */
  private async take(thread: Thread, field: PluginRunField, msg: Inbound): Promise<Taken> {
    const { lang } = thread.state;
    const page = thread.state.page!;
    const text = (msg.text ?? "").trim();
    const lower = text.toLowerCase();
    const typed = msg.kind === "text" || msg.kind === "reply";
    if (!field.required && typed && SKIP_WORDS.has(lower)) {
      return { kind: "value", value: null };
    }
    const again = (hint: Key): Taken => ({ kind: "again", hint: say(lang, hint) });
    switch (field.kind) {
      case "text":
      case "textarea":
      case "email":
      case "url":
      case "number": {
        if (msg.kind === "audio" && msg.media) {
          const said = await this.transcribe(thread, msg);
          return said ? { kind: "value", value: said } : again("asText");
        }
        return typed && text ? { kind: "value", value: text } : again("asText");
      }
      case "date": {
        const iso = typed ? toIso(text) : null;
        return iso ? { kind: "value", value: iso } : again("asDate");
      }
      case "select": {
        const i = optionIndex(msg, field.options ?? []);
        return i >= 0 ? { kind: "value", value: field.options?.[i] } : again("pickOne");
      }
      case "multiselect": {
        const options = field.options ?? [];
        if (msg.replyId === "done" || (typed && DONE_WORDS.has(lower))) {
          if (!page.picks.length && field.required) {
            return again("needed");
          }
          return { kind: "value", value: [...page.picks] };
        }
        if (msg.replyId?.startsWith("o:")) {
          const i = optionIndex(msg, options);
          if (i >= 0 && !page.picks.includes(options[i])) {
            page.picks.push(options[i]);
          }
          if (page.picks.length >= options.length) {
            return { kind: "value", value: [...page.picks] };
          }
          await this.askField(thread, field);
          return { kind: "wait" };
        }
        if (typed && text) {
          const chosen = text
            .split(/[,;\n]+/)
            .map((part) => part.trim())
            .map((part) => {
              const n = Number(part);
              return Number.isInteger(n) && n >= 1 && n <= options.length
                ? options[n - 1]
                : options.find((o) => o.toLowerCase() === part.toLowerCase());
            })
            .filter((o): o is string => Boolean(o));
          if (chosen.length) {
            return { kind: "value", value: [...new Set([...page.picks, ...chosen])] };
          }
        }
        return again("pickOne");
      }
      case "toggle": {
        if (msg.replyId === "t:1" || YES_WORDS.has(lower)) {
          return { kind: "value", value: true };
        }
        if (msg.replyId === "t:0" || NO_WORDS.has(lower)) {
          return { kind: "value", value: false };
        }
        return again("yesOrNo");
      }
      case "image":
      case "file": {
        const ask = field.kind === "image" ? "sendPhoto" : "sendFile";
        if (msg.replyId === "f:done" || (typed && DONE_WORDS.has(lower))) {
          return page.files.length
            ? { kind: "value", value: field.multiple ? [...page.files] : page.files[0] }
            : again(ask);
        }
        if (msg.replyId === "f:more") {
          await this.send(thread, { type: "text", text: say(lang, ask) });
          return { kind: "wait" };
        }
        const fits =
          field.kind === "image"
            ? msg.kind === "image"
            : msg.kind === "image" ||
              msg.kind === "document" ||
              msg.kind === "video" ||
              msg.kind === "audio";
        if (fits && msg.media) {
          const { assetId } = await this.upload(thread, msg);
          if (!field.multiple) {
            return { kind: "value", value: assetId };
          }
          page.files.push(assetId);
          await this.askField(thread, field);
          return { kind: "wait" };
        }
        return again(ask);
      }
      case "audio": {
        if (msg.kind === "audio" && msg.media) {
          const { assetId } = await this.upload(thread, msg);
          return { kind: "value", value: { asset: assetId } };
        }
        return again("sendVoice");
      }
      case "location": {
        if (msg.location) {
          const label = [msg.location.name, msg.location.address].filter(Boolean).join(", ");
          return {
            kind: "value",
            value: { lat: msg.location.lat, lng: msg.location.lng, ...(label ? { label } : {}) },
          };
        }
        return typed && text ? { kind: "value", value: { label: text } } : again("whereAre");
      }
      default:
        return again("asText");
    }
  }

  private async upload(thread: Thread, msg: Inbound): Promise<{ assetId: string }> {
    const media = msg.media!;
    const file = await (await this.graph()).media(media.id);
    return this.deps.runs.upload(thread.runId!, {
      data: file.data,
      mime: file.mime,
      name: media.filename ?? `whatsapp-${media.id.slice(-8)}.${extOf(file.mime)}`,
    });
  }

  private async transcribe(thread: Thread, msg: Inbound): Promise<string | null> {
    try {
      const file = await (await this.graph()).media(msg.media!.id);
      const { text } = await this.deps.runs.transcribe(thread.runId!, file);
      return text.trim() || null;
    } catch (err) {
      this.deps.log.warn("a voice message could not be written down:", (err as Error).message);
      return null;
    }
  }

  // ── A review, a question ─────────────────────────────────────────────────

  private async review(
    thread: Thread,
    report: PluginRunReport,
    w: ReviewWaiting,
    msg: Inbound | null,
  ): Promise<void> {
    const s = thread.state;
    const runId = thread.runId!;
    if (msg?.replyId === "r:ok") {
      await this.deps.runs.review(runId, w.review, { type: "accept" });
      s.said = null;
      s.awaiting = null;
      await this.after(thread);
      return;
    }
    if (msg?.replyId === "r:redo") {
      if (w.show.length > 1) {
        s.awaiting = "target";
        await this.send(thread, {
          type: "list",
          text: say(s.lang, "reviewWhich"),
          button: say(s.lang, "choose"),
          rows: w.show.map((id) => ({
            id: `r:t:${id}`,
            title: report.outputs.find((o) => o.stepId === id)?.title ?? id,
          })),
        });
        return;
      }
      s.target = w.show[0] ?? null;
      s.awaiting = "note";
      await this.send(thread, { type: "text", text: say(s.lang, "reviewNote") });
      return;
    }
    if (s.awaiting === "target" && msg?.replyId?.startsWith("r:t:")) {
      s.target = msg.replyId.slice("r:t:".length);
      s.awaiting = "note";
      await this.send(thread, { type: "text", text: say(s.lang, "reviewNote") });
      return;
    }
    if (s.awaiting === "note" && msg?.text?.trim() && s.target) {
      await this.deps.runs.review(runId, w.review, {
        type: "regenerate",
        target: s.target,
        note: msg.text.trim(),
      });
      s.awaiting = null;
      s.said = null;
      await this.after(thread);
      return;
    }
    const key = `review:${w.review}`;
    const fresh = s.said !== key;
    if (fresh) {
      s.said = key;
      for (const output of report.outputs.filter((o) => w.show.includes(o.stepId))) {
        await this.sendOutput(thread, output);
      }
    }
    if (fresh || msg) {
      await this.send(thread, {
        type: "buttons",
        text: say(s.lang, "reviewAsk"),
        buttons: [
          { id: "r:ok", title: say(s.lang, "reviewOk") },
          { id: "r:redo", title: say(s.lang, "reviewRedo") },
        ],
      });
    }
  }

  private async ask(thread: Thread, w: AskWaiting, msg: Inbound | null): Promise<void> {
    const s = thread.state;
    if (w.kind === "login") {
      const key = `login:${w.ask}`;
      if (s.said !== key) {
        s.said = key;
        await this.handoff(thread, "screen");
      }
      this.deps.watch(thread);
      return;
    }
    if (msg?.replyId === "a:allow" || msg?.replyId === "a:skip") {
      await this.deps.runs.answerAsk(
        thread.runId!,
        w.ask,
        msg.replyId === "a:allow" ? "allow" : "skip",
      );
      s.said = null;
      await this.after(thread);
      return;
    }
    const key = `ask:${w.ask}`;
    if (s.said !== key || msg) {
      s.said = key;
      await this.send(thread, {
        type: "buttons",
        text: [w.reason, w.action, w.input ? clip(w.input, 600) : ""].filter(Boolean).join("\n"),
        buttons: [
          { id: "a:allow", title: say(s.lang, "allow") },
          { id: "a:skip", title: say(s.lang, "skip") },
        ],
      });
    }
  }

  // ── What goes out ────────────────────────────────────────────────────────

  /** The link to the run page, for what the thread cannot do. */
  private async handoff(thread: Thread, why: "screen" | "notYet"): Promise<void> {
    const url = await this.deps.runs.handoffUrl(thread.runId!);
    await this.send(thread, {
      type: "link",
      text: say(thread.state.lang, why),
      url,
      label: say(thread.state.lang, "open"),
    });
  }

  /** One output as the thread can carry it: text, pictures, documents, the picture of a widget. */
  private async sendOutput(
    thread: Thread,
    output: PluginRunReport["outputs"][number],
  ): Promise<void> {
    const parts: Outgoing[] = [];
    if (output.text) {
      parts.push({ type: "text", text: `*${output.title}*\n${output.text}` });
    }
    let picture = false;
    let pdf = false;
    for (const a of output.assets) {
      if (a.mime.startsWith("image/")) {
        parts.push({ type: "image", link: a.url, caption: output.title });
        picture = true;
      } else if (a.mime === "application/pdf") {
        parts.push({ type: "document", link: a.url, caption: output.title, filename: a.name });
        pdf = true;
      } else if (a.mime.startsWith("video/")) {
        parts.push({ type: "video", link: a.url, caption: output.title });
      } else if (a.mime.startsWith("audio/")) {
        parts.push({ type: "audio", link: a.url });
      }
    }
    if (!picture && output.picture) {
      parts.push({ type: "image", link: output.picture, caption: output.title });
      picture = true;
    }
    if (!pdf && output.downloads.pdf) {
      parts.push({
        type: "document",
        link: output.downloads.pdf,
        caption: output.title,
        filename: `${output.title}.pdf`,
      });
    }
    if (!parts.length && output.json) {
      parts.push({ type: "text", text: `*${output.title}*\n${clip(output.json, 3000)}` });
    }
    for (const part of parts) {
      await this.send(thread, part);
    }
  }

  /** The run reached its end: what it made, then the link to all of it. */
  private async deliver(thread: Thread, report: PluginRunReport): Promise<void> {
    const s = thread.state;
    const runId = thread.runId!;
    this.deps.unwatch(runId);
    const url = await this.deps.runs.handoffUrl(runId);
    if (Date.now() - thread.lastInboundAt > DAY) {
      // After a day of silence only an approved template may be sent: the link goes in it.
      const account = await this.deps.account();
      if (account?.template) {
        await this.send(thread, {
          type: "template",
          name: account.template,
          lang: s.lang,
          params: [url],
        });
        s.delivered = true;
      } else {
        this.deps.log.warn(
          `run ${runId} is done, but the thread is older than a day and no template is set: nothing sent`,
        );
      }
      return;
    }
    const listed = report.outputs.filter((o) => Object.keys(o.downloads).length);
    for (const output of listed.length ? listed : report.outputs) {
      await this.sendOutput(thread, output);
    }
    await this.send(thread, {
      type: "link",
      text: say(s.lang, "finished"),
      url,
      label: say(s.lang, "open"),
    });
    s.delivered = true;
  }

  private async graph(): Promise<Graph> {
    const account = await this.deps.account();
    if (!account) {
      throw new Error("WhatsApp is not connected.");
    }
    return new Graph(account);
  }

  private async send(thread: Thread, message: Outgoing): Promise<void> {
    try {
      await (await this.graph()).send(thread.waId, message);
    } catch (err) {
      if (err instanceof GraphError && err.code === RE_ENGAGEMENT) {
        this.deps.log.warn(`thread ${thread.waId}: older than a day, the message was refused`);
        return;
      }
      throw err;
    }
  }
}
