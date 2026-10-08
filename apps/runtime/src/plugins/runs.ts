import { createHash } from "node:crypto";
import type { PluginRunReport, PluginRunSignal, PluginRuns } from "@engenty-wizards/plugin-sdk";
import { noteText } from "@engenty-wizards/shared/run";
import { and, eq } from "drizzle-orm";
import { db, schema, withTenant } from "../db/client.js";
import { answerAsk } from "../engine/asks.js";
import { subscribe } from "../engine/events.js";
import {
  cancel,
  createRun,
  goBack,
  NoCreditsError,
  RunInputError,
  retry,
  reviewStep,
  submitPage,
} from "../engine/runner.js";
import { saveAsset } from "../files/storage.js";
import { wizardUnavailable } from "../limits.js";
import { ModelUnavailableError } from "../model-errors.js";
import { runTicket } from "../secrets/signing.js";
import { notFound, ServiceError } from "../services/errors.js";
import { pluginRun, refusedInput, runReportOf, waitRun } from "../services/runs.js";
import { shareUrl } from "../services/wizards.js";
import { visitorOverLimit } from "../tenants/control.js";
import { currentTenant } from "../tenants/tenant.js";

/**
 * `wizards.server.runs`: the functions behind the MCP tools, for a plugin's door. A run started
 * here is a live run of the published wizard for a person of that door; the plugin keeps who
 * the person is, the runtime keeps a hash of it as the run's visitor, so what the wizard
 * remembers is theirs on the run page too.
 */

/** A person of a door as the run's visitor: a hash, never the number or the account itself. */
function visitorOf(person: { channel: string; id: string }): string {
  return `p:${createHash("sha256").update(`${person.channel}:${person.id}`).digest("hex").slice(0, 32)}`;
}

export function runsApiFor(pluginId: string): PluginRuns {
  return {
    async start(input) {
      const w = await db.query.wizard.findFirst({
        where: and(
          eq(schema.wizard.tenantId, currentTenant()),
          "token" in input
            ? eq(schema.wizard.shareToken, input.token)
            : eq(schema.wizard.id, input.wizardId),
        ),
      });
      if (!w || w.publishedVersion === null) {
        throw notFound();
      }
      const reason = await wizardUnavailable(w);
      if (reason) {
        throw new ServiceError("refused", reason);
      }
      const visitorId = visitorOf(input.person);
      if (await visitorOverLimit(visitorId, null)) {
        throw new ServiceError(
          "refused",
          "This person started many runs lately. Try again in an hour.",
        );
      }
      const version = await db.query.wizardVersion.findFirst({
        where: and(
          eq(schema.wizardVersion.wizardId, w.id),
          eq(schema.wizardVersion.version, w.publishedVersion),
        ),
      });
      if (!version) {
        throw notFound();
      }
      const runId = await createRun({
        wizardId: w.id,
        definition: version.definition,
        files: version.files,
        version: w.publishedVersion,
        mode: "live",
        visitorId,
        runner: input.runner ?? pluginId,
      }).catch((err) => {
        if (err instanceof ModelUnavailableError) {
          throw new ServiceError("refused", err.message);
        }
        if (err instanceof NoCreditsError) {
          throw new ServiceError("no_credits", "The wizard's credits are used up.");
        }
        throw err;
      });
      const first = version.definition.steps[0];
      let refused: { field: string; message: string }[] | null = null;
      if (first?.type === "page" && input.answers && Object.keys(input.answers).length) {
        const answers = input.answers;
        const values = Object.fromEntries(
          first.fields.filter((f) => f.id in answers).map((f) => [f.id, answers[f.id]]),
        );
        try {
          await submitPage(runId, first.id, values);
        } catch (err) {
          if (!(err instanceof RunInputError)) {
            throw err;
          }
          refused = err.errors;
        }
      }
      return { runId, ticket: runTicket(runId), refused };
    },
    async report(runId, options) {
      const run = await waitRun(() => pluginRun(runId), options?.waitSeconds ?? 0);
      return (await runReportOf(run)) as PluginRunReport;
    },
    async answerPage(runId, stepId, values) {
      await pluginRun(runId);
      await submitPage(runId, stepId, values).catch(refusedInput);
    },
    async review(runId, stepId, action) {
      await pluginRun(runId);
      await reviewStep(runId, stepId, action).catch(refusedInput);
    },
    async answerAsk(runId, askId, answer) {
      await pluginRun(runId);
      if (!answerAsk(runId, askId, answer === "allow" ? { type: "done" } : { type: "skip" })) {
        throw new ServiceError("refused", "This question is no longer open.");
      }
    },
    async control(runId, action) {
      await pluginRun(runId);
      const command = { back: goBack, retry, cancel }[action];
      await command(runId).catch(refusedInput);
    },
    subscribe(runId, listener) {
      // The listener runs inside the tenant the subscription was made in, as the events do.
      const tenantId = currentTenant();
      return subscribe(runId, (signal) => {
        const event = signal.event;
        const shaped: PluginRunSignal = {
          runId: signal.runId,
          event: event
            ? {
                id: event.id,
                at: event.at,
                stepId: event.stepId,
                type: event.type,
                message: event.message,
                note: event.note
                  ? {
                      code: event.note.code,
                      text: { de: noteText(event.note, "de"), en: noteText(event.note, "en") },
                    }
                  : null,
              }
            : null,
        };
        void withTenant(tenantId, () => listener(shaped));
      });
    },
    async handoffUrl(runId) {
      const run = await pluginRun(runId);
      const w = await db.query.wizard.findFirst({ where: eq(schema.wizard.id, run.wizardId) });
      if (!w) {
        throw notFound();
      }
      return `${shareUrl(w.shareToken)}/${run.id}?rt=${encodeURIComponent(runTicket(run.id))}`;
    },
    async upload(runId, file) {
      await pluginRun(runId);
      const asset = await saveAsset({
        runId,
        kind: file.mime.startsWith("image/") ? "image" : "file",
        mime: file.mime,
        name: file.name,
        data: file.data instanceof Uint8Array ? file.data : new Uint8Array(file.data),
      });
      return { assetId: asset.id };
    },
  };
}
