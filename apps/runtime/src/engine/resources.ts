import type { BrowserContext, Page } from "playwright-core";
import { webContext } from "../render/chromium.js";
import { createSandbox, type Sandbox } from "../sandbox/index.js";
import { getSecret, putSecret, type StoreScope } from "../store/index.js";

/** Sign-ins the person asked the wizard to keep, as Playwright storage state. */
const SESSION_SLOT = "browser";
type StorageState = Awaited<ReturnType<BrowserContext["storageState"]>>;

/**
 * What a run holds while an agent works: a browser context and a sandbox, both made on first
 * use and released when the run stops running.
 */
export class RunResources {
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private sandbox: Sandbox | null = null;
  private scope: StoreScope | null = null;
  /** Changes the person allowed for the rest of this run, as "<connection>:<action>". */
  readonly allowed = new Set<string>();

  constructor(readonly runId: string) {}

  /** Whose store kept sign-ins are read from and written to. */
  bind(scope: StoreScope) {
    this.scope = scope;
  }

  async browserContext(): Promise<BrowserContext> {
    if (!this.context) {
      const kept = this.scope
        ? await getSecret<StorageState>(this.scope, SESSION_SLOT).catch(() => null)
        : null;
      this.context = await webContext({
        locale: "de-DE",
        ...(kept ? { storageState: kept.data } : {}),
      });
    }
    return this.context;
  }

  async browserPage(): Promise<Page> {
    const context = await this.browserContext();
    if (!this.page || this.page.isClosed()) {
      this.page = await context.newPage();
    }
    return this.page;
  }

  /** The page the agent has open, if any — without opening a browser for the question. */
  openPage(): Page | null {
    return this.page && !this.page.isClosed() ? this.page : null;
  }

  /** A link opened a new tab: the agent goes on there. */
  adopt(page: Page) {
    this.page = page;
  }

  /** Keeps the browser's sign-ins for the person's next run (they ticked "remember"). */
  async keepSession() {
    if (this.context && this.scope) {
      await putSecret(
        this.scope,
        SESSION_SLOT,
        "browser",
        "Browser-Anmeldungen",
        await this.context.storageState(),
      );
    }
  }

  sandboxHandle(): Sandbox {
    this.sandbox ??= createSandbox(this.runId);
    return this.sandbox;
  }

  async release() {
    const context = this.context;
    const sandbox = this.sandbox;
    this.context = null;
    this.page = null;
    this.sandbox = null;
    await context?.close().catch(() => undefined);
    await sandbox?.destroy().catch(() => undefined);
  }
}

const live = new Map<string, RunResources>();

export function resourcesFor(runId: string): RunResources {
  let r = live.get(runId);
  if (!r) {
    r = new RunResources(runId);
    live.set(runId, r);
  }
  return r;
}

/** The resources of a run that is working right now, if it has any. */
export function liveResources(runId: string): RunResources | null {
  return live.get(runId) ?? null;
}

export async function releaseResources(runId: string) {
  const r = live.get(runId);
  live.delete(runId);
  await r?.release();
}
