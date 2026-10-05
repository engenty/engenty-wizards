import type { ComponentType } from "react";

/**
 * What the studio hands a plugin's studio half: the built `client.js` the studio loads after
 * sign-in. Its default export registers pages, entries of the top bar and sections of the
 * settings. React, the router and the studio's own components come from the studio
 * (docs/plugins.md), so the page a plugin draws is part of the same app.
 */

export type StudioLang = "de" | "en";

/** A plugin's words. `de` is the source: a key missing in `en` shows the German. */
export type StudioMessages = Record<StudioLang, Record<string, string>>;

type Icon = ComponentType<{ className?: string }>;

export interface StudioPage {
  /** An address of the studio: `/contacts`, `/contacts/:id`. */
  path: string;
  component: ComponentType;
  /** The page lays out columns of its own and takes the screen's width. */
  wide?: boolean;
}

/** An icon in the top bar that opens a page. */
export interface StudioNavEntry {
  to: string;
  /** A function: the language can change while the studio is open. */
  label: () => string;
  icon: Icon;
}

export interface StudioSettingsSection {
  /** Its address is `/settings/<id>`. */
  id: string;
  label: () => string;
  icon: Icon;
  component: ComponentType;
  /** The user menu links to it directly. */
  menu?: boolean;
}

export interface StudioMe {
  user: { id: string; name: string; email: string };
  tenant: { id: string; role: "owner" | "admin" | "member" };
  /** `managed`: signed in at the Manage-App. `local`: the runtime runs alone. */
  mode: "managed" | "local";
}

export interface StudioPluginContext {
  plugin: { id: string; name: string; version: string };
  registerPage(page: StudioPage): void;
  registerNav(entry: StudioNavEntry): void;
  registerSettingsSection(section: StudioSettingsSection): void;
  i18n: {
    /** Takes the plugin's words and gives the function that reads them in the language in effect. */
    register<M extends StudioMessages>(
      messages: M,
    ): (key: keyof M["de"] & string, vars?: Record<string, string | number>) => string;
    lang(): StudioLang;
  };
  /** The plugin's own routes: `get("/")` asks `/api/studio/plugins/<id>/`. */
  api: {
    get<T>(path: string): Promise<T>;
    post<T>(path: string, body?: unknown): Promise<T>;
    put<T>(path: string, body?: unknown): Promise<T>;
    patch<T>(path: string, body?: unknown): Promise<T>;
    del<T>(path: string): Promise<T>;
  };
  /** The signed-in person. */
  me(): StudioMe;
  /** Something to undo when the plugin reloads. */
  onUnload(dispose: () => void): void;
}

export type StudioPlugin = (studio: StudioPluginContext) => void;

/** Types the plugin; it does nothing else. */
export function defineStudioPlugin(plugin: StudioPlugin): StudioPlugin {
  return plugin;
}
