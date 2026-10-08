import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/** The tables of migrations/, for Drizzle. Kept in step with the SQL by hand. */

export const account = sqliteTable("whatsapp_account", {
  id: integer("id").primaryKey(),
  phoneNumberId: text("phone_number_id").notNull(),
  /** Digits only: the number people write to, for `wa.me` links. */
  number: text("number").notNull(),
  accessToken: text("access_token").notNull(),
  /** The Meta app's secret: with it, every webhook's signature is checked. */
  appSecret: text("app_secret"),
  verifyToken: text("verify_token").notNull(),
  /** An approved utility template with one body parameter (the link), for a word after a day of silence. */
  template: text("template"),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const binding = sqliteTable("whatsapp_binding", {
  wizardId: text("wizard_id").primaryKey(),
  keyword: text("keyword").notNull(),
});

export const thread = sqliteTable("whatsapp_thread", {
  waId: text("wa_id").primaryKey(),
  name: text("name"),
  runId: text("run_id"),
  state: text("state").notNull(),
  lastInboundAt: integer("last_inbound_at", { mode: "timestamp_ms" }).notNull(),
  lastMessageId: text("last_message_id"),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});
