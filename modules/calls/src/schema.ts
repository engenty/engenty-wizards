import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/** The tables of migrations/, for Drizzle. Kept in step with the SQL by hand. */

export const account = sqliteTable("calls_account", {
  id: integer("id").primaryKey(),
  twilioSid: text("twilio_sid").notNull(),
  twilioToken: text("twilio_token").notNull(),
  /** The OpenAI project the calls are handed to over SIP: proj_… */
  openaiProject: text("openai_project").notNull(),
  /** Signs what OpenAI posts about incoming calls: whsec_… */
  openaiWebhookSecret: text("openai_webhook_secret").notNull(),
  /** Where OpenAI takes the call: `eu` or `us`. */
  region: text("region", { enum: ["eu", "us"] })
    .notNull()
    .default("eu"),
  /** The Twilio number the links are texted from; none: no texts. */
  smsFrom: text("sms_from"),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const call = sqliteTable("calls_call", {
  /** Travels with the call as a SIP header; names it to OpenAI's webhook. */
  token: text("token").primaryKey(),
  /** The caller's number, E.164. */
  caller: text("caller").notNull(),
  /** `whatsapp`: a WhatsApp call over Meta's SIP; `phone`: a call to the Twilio number. */
  channel: text("channel", { enum: ["whatsapp", "phone"] }).notNull(),
  /** What a WhatsApp call button or deep link carried: a wizard's share token. */
  payload: text("payload"),
  twilioCallSid: text("twilio_call_sid"),
  openaiCallId: text("openai_call_id"),
  runId: text("run_id"),
  status: text("status", { enum: ["ringing", "live", "done"] })
    .notNull()
    .default("ringing"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});
