import type { StudioPluginContext } from "@engenty-wizards/plugin-sdk/studio";
import { messages } from "./messages";

/** The studio this half was handed, and its words. */

let current: StudioPluginContext | null = null;
let translate: ((key: string, vars?: Record<string, string | number>) => string) | null = null;

export function setStudio(studio: StudioPluginContext) {
  current = studio;
  translate = studio.i18n.register(messages) as typeof translate;
}

export function studio(): StudioPluginContext {
  if (!current) {
    throw new Error("The SMS plugin is not loaded.");
  }
  return current;
}

export type Key = keyof (typeof messages)["de"];
export const t = (key: Key, vars?: Record<string, string | number>) =>
  translate?.(key, vars) ?? key;
export const api = () => studio().api;

export const KEY = "sms";

/** What a failed request says, in the person's language. */
export function errorText(error: unknown): string {
  const body = (error as { body?: { code?: string; error?: string } } | null)?.body;
  const code = body?.code;
  const message = body?.error ?? (error instanceof Error ? error.message : String(error));
  if (code && `error_${code}` in messages.de) {
    return t(`error_${code}` as Key, { message });
  }
  return t("error_other", { message });
}

export interface AccountView {
  connected: boolean;
  accountSid: string;
  number: string;
  hasToken: boolean;
  webhook: string;
}

export interface Binding {
  keyword: string;
  link: string | null;
  number: string | null;
}
