import { eq } from "drizzle-orm";
import { dropLinks, dropRuns } from "../control.js";
import { db, schema } from "../db/client.js";

/** Takes a wizard's public tokens and its runs out of the control database. */
export async function forgetWizardLinks(wizardId: string) {
  const w = await db.query.wizard.findFirst({ where: eq(schema.wizard.id, wizardId) });
  const runs = await db
    .select({ id: schema.run.id, shareToken: schema.run.shareToken })
    .from(schema.run)
    .where(eq(schema.run.wizardId, wizardId));
  await dropLinks([
    ...(w ? [w.shareToken] : []),
    ...runs.map((r) => r.shareToken).filter((t): t is string => Boolean(t)),
  ]);
  await dropRuns(runs.map((r) => r.id));
}
