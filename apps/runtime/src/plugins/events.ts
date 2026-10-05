import type { PluginRunEvent } from "@engenty-wizards/plugin-sdk";
import { eq } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { currentTenant } from "../tenants/tenant.js";
import { pluginsOf } from "./registry.js";

/**
 * Tells the tenant's plugins that a run reached its end. A plugin cannot fail a run: what a
 * listener throws is logged and nothing more.
 */
export async function runEnded(
  runId: string,
  status: PluginRunEvent["run"]["status"],
): Promise<void> {
  try {
    const event = `run.${status}` as const;
    const listening = (await pluginsOf(currentTenant())).filter((p) => p.listeners[event]?.length);
    if (!listening.length) {
      return;
    }
    const run = await db.query.run.findFirst({ where: eq(schema.run.id, runId) });
    const wizard =
      run && (await db.query.wizard.findFirst({ where: eq(schema.wizard.id, run.wizardId) }));
    if (!run || !wizard) {
      return;
    }
    const payload: PluginRunEvent = {
      run: { id: run.id, wizardId: run.wizardId, mode: run.mode, status },
      wizard: { id: wizard.id, title: run.definition.title, projectId: wizard.projectId },
      values: run.state.values,
    };
    for (const plugin of listening) {
      for (const listener of plugin.listeners[event] ?? []) {
        try {
          await listener(payload);
        } catch (err) {
          console.error(`[plugin ${plugin.source.id}] ${event}:`, err);
        }
      }
    }
  } catch (err) {
    console.error("[plugins] run event:", err);
  }
}
