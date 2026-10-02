import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getBilling } from "./billing/credits.js";
import { db, schema } from "./db/client.js";

/** A new admin gets a credit allowance and a first project to put their first wizard in. */
export async function onFirstSignIn(userId: string, name: string) {
  await getBilling(userId);
  const existing = await db.query.project.findFirst({ where: eq(schema.project.ownerId, userId) });
  if (existing) {
    return;
  }
  const first = name?.split(" ")[0]?.trim();
  await db.insert(schema.project).values({
    id: nanoid(12),
    ownerId: userId,
    name: first ? `${first}s Wizards` : "Meine Wizards",
    brand: {},
    mcpServers: [],
  });
}
