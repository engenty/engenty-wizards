import { DockerSandbox } from "@mastra/docker";
import type { BrowserContext, Page } from "playwright-core";
import { env } from "../env.js";
import { newContext } from "../render/chromium.js";

/**
 * What a run holds while an agent works: a browser context and a sandbox container,
 * both made on first use and released when the run stops running.
 */
export class RunResources {
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private sandbox: DockerSandbox | null = null;

  constructor(readonly runId: string) {}

  async browserPage(): Promise<Page> {
    if (!this.context) {
      this.context = await newContext({ locale: "de-DE" });
    }
    if (!this.page || this.page.isClosed()) {
      this.page = await this.context.newPage();
    }
    return this.page;
  }

  async sandboxHandle(): Promise<DockerSandbox> {
    if (!env.sandboxEnabled) {
      throw new Error("The sandbox is switched off on this server.");
    }
    if (!this.sandbox) {
      const sandbox = new DockerSandbox({
        id: `wizards-${this.runId.toLowerCase()}`,
        image: env.sandboxImage,
        memory: 1024 * 1024 * 1024,
        pidsLimit: 256,
        capDrop: ["ALL"],
        securityOpt: ["no-new-privileges"],
        workingDir: "/workspace",
        labels: { "engenty-wizards.run": this.runId },
      });
      await sandbox.start();
      this.sandbox = sandbox;
    }
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

export async function releaseResources(runId: string) {
  const r = live.get(runId);
  live.delete(runId);
  await r?.release();
}
