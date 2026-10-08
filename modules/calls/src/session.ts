import type { PluginRunReport, PluginRuns } from "@engenty-wizards/plugin-sdk";
import { type ThreadLang, toIso } from "@engenty-wizards/plugin-sdk/thread";
import { ASKS, RUNNER, stateText } from "./rules";

/**
 * One call: the run it drives, the answers collected for the current page, and the tools the
 * model calls over the WebSocket. The model hears the state of the run as text after every
 * change, and a link is texted for what a voice cannot do.
 */

export interface Offered {
  wizardId: string;
  token: string;
  title: string;
  lang: ThreadLang;
}

export interface SessionDeps {
  runs: PluginRuns;
  /** Sends one event to the model. */
  send(event: Record<string, unknown>): void;
  /** Texts the caller. */
  text(body: string): Promise<void>;
  hangUp(): Promise<void>;
  /** Hear the run, and call `changed` when it moves. */
  watch(runId: string): void;
  unwatch(runId: string): void;
  log: { warn(...args: unknown[]): void };
}

const asks = new Set(ASKS);

const YES = new Set(["true", "yes", "ja", "1", "on"]);
const NO = new Set(["false", "no", "nein", "0", "off"]);

export class CallSession {
  runId: string | null = null;
  lang: ThreadLang;
  private draft: { step: string; values: Record<string, unknown> } | null = null;
  private report: PluginRunReport | null = null;
  private linked = false;
  private ended = false;

  constructor(
    private readonly deps: SessionDeps,
    readonly caller: string,
    readonly channel: "whatsapp" | "phone",
    private lobby: Offered[],
    lang: ThreadLang,
  ) {
    this.lang = lang;
  }

  /** The wizard the call runs, started; the rules are made from it. */
  async start(wizard: Offered): Promise<PluginRunReport | null> {
    this.lang = wizard.lang;
    // On WhatsApp the person is the same as in the thread: the number without its plus.
    const id = this.channel === "whatsapp" ? this.caller.replace(/^\+/, "") : this.caller;
    const { runId } = await this.deps.runs.start({
      token: wizard.token,
      person: { channel: this.channel, id },
      runner: RUNNER,
    });
    this.runId = runId;
    this.lobby = [];
    this.draft = null;
    this.linked = false;
    return this.look(5);
  }

  /** The state as the model reads it. */
  state(): string {
    return stateText(
      this.report,
      this.draft?.values ?? {},
      this.lobby.map((w) => w.title),
      asks,
    );
  }

  /** Tells the model the state and lets it speak: at the start, and when the run changed. */
  async hello(): Promise<void> {
    await this.look(0);
    this.say(
      this.state(),
      this.lang === "de" ? "Begrüße die Person und beginne." : "Greet the person and begin.",
    );
  }

  /** The run moved while nobody spoke: the model hears the new state and says what changed. */
  async changed(): Promise<void> {
    if (this.ended) {
      return;
    }
    await this.look(0);
    if (this.report?.status === "done" && !this.linked) {
      await this.link().catch((err) => this.deps.log.warn("the link was not texted:", err));
    }
    this.say(
      this.state(),
      this.lang === "de"
        ? "Sag in einem Satz, was sich getan hat, und mach weiter."
        : "Say in one sentence what happened, and go on.",
    );
  }

  /** The model called a tool: what it gets back. */
  async call(name: string, args: Record<string, unknown>): Promise<string> {
    switch (name) {
      case "get_state":
        await this.look(0);
        return this.state();
      case "choose_wizard": {
        const wanted = String(args.name ?? "").toLowerCase();
        const wizard =
          this.lobby.find((w) => w.title.toLowerCase() === wanted) ??
          this.lobby.find(
            (w) => w.title.toLowerCase().includes(wanted) || wanted.includes(w.title.toLowerCase()),
          );
        if (!wizard) {
          return `No wizard called "${args.name}". Offered: ${this.lobby.map((w) => w.title).join(", ")}.`;
        }
        await this.start(wizard);
        return this.state();
      }
      case "send_link":
        return this.link();
      case "hang_up":
        this.ended = true;
        await this.deps.hangUp();
        return "The call is over.";
    }
    if (!this.runId) {
      return "No wizard runs yet: choose_wizard first.";
    }
    switch (name) {
      case "set_field":
        return this.setField(String(args.field ?? ""), args.value);
      case "submit_page":
        return this.submit();
      case "accept_review":
        return this.command(async (w) => {
          if (!w || !("review" in w)) {
            return "Nothing to review right now.";
          }
          await this.deps.runs.review(this.runId!, w.review, { type: "accept" });
          return null;
        });
      case "regenerate":
        return this.command(async (w) => {
          if (!w || !("review" in w)) {
            return "Nothing to review right now.";
          }
          await this.deps.runs.review(this.runId!, w.review, {
            type: "regenerate",
            target: String(args.target ?? w.show[0] ?? ""),
            note: String(args.note ?? ""),
          });
          return null;
        });
      case "answer_ask":
        return this.command(async (w) => {
          if (!w || !("ask" in w)) {
            return "No question is open right now.";
          }
          await this.deps.runs.answerAsk(this.runId!, w.ask, args.allow ? "allow" : "skip");
          return null;
        });
      case "go_back":
        return this.command(async () => {
          await this.deps.runs.control(this.runId!, "back");
          this.draft = null;
          return null;
        });
      default:
        return `Unknown tool ${name}.`;
    }
  }

  stop(): void {
    this.ended = true;
    if (this.runId) {
      this.deps.unwatch(this.runId);
    }
  }

  // ── Tools ──────────────────────────────────────────────────────────────────

  private async setField(id: string, raw: unknown): Promise<string> {
    await this.look(0);
    const w = this.report?.waitingFor;
    if (!w || !("page" in w)) {
      return "No page is open right now. get_state says what the run waits for.";
    }
    const field = w.fields.find((f) => f.id === id && f.shown !== false);
    if (!field) {
      return `No open field "${id}" on this page.`;
    }
    if (!asks.has(field.kind)) {
      return `"${field.label}" needs the screen: send_link, then wait.`;
    }
    if (!this.draft || this.draft.step !== w.page) {
      this.draft = { step: w.page, values: {} };
    }
    const value = this.coerce(field.kind, field.options ?? [], raw);
    if (value instanceof Error) {
      return value.message;
    }
    this.draft.values[id] = value;
    // A later field's condition may read this answer: the page is read again with the draft.
    await this.look(0);
    return this.state();
  }

  /** The answer as the page takes it, or what is wrong with it. */
  private coerce(kind: string, options: string[], raw: unknown): unknown | Error {
    const text = raw === undefined || raw === null ? "" : String(raw).trim();
    switch (kind) {
      case "select": {
        const found = options.find((o) => o.toLowerCase() === text.toLowerCase());
        return found ?? new Error(`Pick one of: ${options.join(" | ")}.`);
      }
      case "multiselect": {
        const given = Array.isArray(raw) ? raw.map(String) : text.split(/[,;]+/);
        const picked = given
          .map((g) => options.find((o) => o.toLowerCase() === g.trim().toLowerCase()))
          .filter((o): o is string => Boolean(o));
        return picked.length ? picked : new Error(`Pick from: ${options.join(" | ")}.`);
      }
      case "toggle": {
        if (typeof raw === "boolean") {
          return raw;
        }
        const lower = text.toLowerCase();
        return YES.has(lower) ? true : NO.has(lower) ? false : new Error("true or false.");
      }
      case "number": {
        const n = Number(text.replace(",", "."));
        return Number.isFinite(n) ? n : new Error("A number.");
      }
      case "date": {
        const iso = toIso(text);
        return iso ?? new Error("A date as YYYY-MM-DD or DD.MM.YYYY.");
      }
      case "location":
        return text ? { label: text } : new Error("An address.");
      default:
        return text || new Error("An answer.");
    }
  }

  private async submit(): Promise<string> {
    await this.look(0);
    const w = this.report?.waitingFor;
    if (!w || !("page" in w)) {
      return "No page is open right now.";
    }
    const values = this.draft?.step === w.page ? this.draft.values : {};
    const missing = w.fields.filter(
      (f) =>
        f.shown !== false &&
        f.required &&
        asks.has(f.kind) &&
        (values[f.id] === undefined || values[f.id] === null || values[f.id] === ""),
    );
    if (missing.length) {
      return `Still open: ${missing.map((f) => `${f.id} "${f.label}"`).join(", ")}. Ask for them first.`;
    }
    if (w.fields.some((f) => f.shown !== false && !asks.has(f.kind))) {
      return "This page has a field that needs the screen: send_link and wait until the state changes.";
    }
    try {
      await this.deps.runs.answerPage(this.runId!, w.page, values);
    } catch (err) {
      const fields = (err as { data?: { fields?: { field: string; message: string }[] } }).data
        ?.fields;
      return fields?.length
        ? `Not accepted: ${fields.map((f) => `${f.field}: ${f.message}`).join("; ")}. Ask again.`
        : `Not accepted: ${(err as Error).message}`;
    }
    this.draft = null;
    await this.look(15);
    return this.state();
  }

  /** A command on the run, then the new state. `act` answers with text where the command does not fit. */
  private async command(
    act: (waiting: PluginRunReport["waitingFor"]) => Promise<string | null>,
  ): Promise<string> {
    await this.look(0);
    try {
      const answer = await act(this.report?.waitingFor);
      if (answer) {
        return answer;
      }
    } catch (err) {
      return `Not accepted: ${(err as Error).message}`;
    }
    await this.look(15);
    return this.state();
  }

  /** Texts the link to the run page, once per state; the run is watched from then on. */
  private async link(): Promise<string> {
    if (!this.runId) {
      return "No wizard runs yet.";
    }
    const url = await this.deps.runs.handoffUrl(this.runId);
    const done = this.report?.status === "done";
    await this.deps.text(
      this.lang === "de"
        ? done
          ? `Fertig! Alles liegt hier: ${url}`
          : `Hier geht es weiter: ${url}`
        : done
          ? `Done! Everything is here: ${url}`
          : `It goes on here: ${url}`,
    );
    this.linked = done;
    this.deps.watch(this.runId);
    return "The link was texted. Say so; then wait for the state to change.";
  }

  // ── The run ────────────────────────────────────────────────────────────────

  /** Reads the run as it stands, waiting a little while it works. */
  private async look(waitSeconds: number): Promise<PluginRunReport | null> {
    if (!this.runId) {
      this.report = null;
      return null;
    }
    this.report = await this.deps.runs.report(this.runId, {
      waitSeconds,
      draft: this.draft?.values,
    });
    if (!this.report.waitingFor && this.report.status === "running") {
      this.deps.watch(this.runId);
    }
    if (this.report.status === "done" || this.report.status === "failed") {
      this.deps.unwatch(this.runId);
    }
    return this.report;
  }

  /** A message with the state, and a turn of the model with what to do about it. */
  private say(state: string, instructions: string): void {
    this.deps.send({
      type: "conversation.item.create",
      item: { type: "message", role: "user", content: [{ type: "input_text", text: state }] },
    });
    this.deps.send({ type: "response.create", response: { instructions } });
  }
}
