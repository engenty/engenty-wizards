import { definePlugin, type PluginRunEvent } from "@engenty-wizards/plugin-sdk";
import { count, desc } from "drizzle-orm";
import { z } from "zod";
import { entry } from "./schema";

/**
 * The server half of the example: its own table, a listener on runs that end, two routes for
 * its page in the studio and a tool agent steps can list as `run-log.recent`.
 */
export default definePlugin((wizards) => {
  const { server } = wizards;
  const db = () => server.getTenantDb();

  server.registerMigrations("migrations");

  const keep = async ({ run, wizard }: PluginRunEvent) => {
    await db().insert(entry).values({
      runId: run.id,
      wizardId: wizard.id,
      title: wizard.title,
      mode: run.mode,
      status: run.status,
      endedAt: new Date(),
    });
  };
  server.on("run.done", keep);
  server.on("run.failed", keep);
  server.on("run.cancelled", keep);

  const recent = (limit: number) =>
    db().select().from(entry).orderBy(desc(entry.endedAt), desc(entry.id)).limit(limit);

  server.registerHttpRoute({
    method: "GET",
    path: "/",
    handler: async () => {
      const [{ total }] = await db().select({ total: count() }).from(entry);
      return { total, entries: await recent(100) };
    },
  });

  server.registerHttpRoute({
    method: "DELETE",
    path: "/",
    role: "admin",
    handler: async () => {
      await db().delete(entry);
      return { ok: true };
    },
  });

  server.registerTool({
    name: "recent",
    title: "Run log",
    description:
      "How the last runs of this app's wizards ended: the wizard's title, test or live, done, failed or cancelled, and when.",
    inputSchema: z.object({ limit: z.number().int().min(1).max(50).optional() }),
    execute: async ({ limit }, ctx) => {
      await ctx.emit("Run log");
      const rows = await recent(limit ?? 10);
      return {
        runs: rows.map((row) => ({
          wizard: row.title,
          mode: row.mode,
          status: row.status,
          endedAt: row.endedAt.toISOString(),
        })),
      };
    },
  });
});
