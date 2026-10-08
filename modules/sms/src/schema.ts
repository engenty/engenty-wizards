import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/** The tables of migrations/, for Drizzle. Kept in step with the SQL by hand. */

export const account = sqliteTable("sms_account", {
  id: integer("id").primaryKey(),
  accountSid: text("account_sid").notNull(),
  authToken: text("auth_token").notNull(),
  /** The number people text, as E.164: +43660… */
  number: text("number").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const binding = sqliteTable("sms_binding", {
  wizardId: text("wizard_id").primaryKey(),
  keyword: text("keyword").notNull(),
});

export const thread = sqliteTable("sms_thread", {
  number: text("number").primaryKey(),
  runId: text("run_id"),
  state: text("state").notNull(),
  lastInboundAt: integer("last_inbound_at", { mode: "timestamp_ms" }).notNull(),
  lastMessageId: text("last_message_id"),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});
