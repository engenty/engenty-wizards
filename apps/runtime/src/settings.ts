import { eq } from "drizzle-orm";
import { control, controlDb } from "./db/client.js";

/** Settings of a runtime that runs alone, kept in the control database. Never secrets. */
export async function readSetting<T>(key: string): Promise<T | null> {
  const row = await controlDb.query.setting.findFirst({ where: eq(control.setting.key, key) });
  return (row?.value as T | undefined) ?? null;
}

export async function writeSetting(key: string, value: unknown): Promise<void> {
  await controlDb
    .insert(control.setting)
    .values({ key, value })
    .onConflictDoUpdate({ target: control.setting.key, set: { value } });
}

export async function deleteSetting(key: string): Promise<void> {
  await controlDb.delete(control.setting).where(eq(control.setting.key, key));
}
