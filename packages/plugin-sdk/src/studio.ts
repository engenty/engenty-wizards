import type { ComponentType } from "react";

/**
 * What the studio hands a plugin's studio half: the built `client.js` the studio loads after
 * sign-in. Its default export registers pages, entries of the app bar, sections of the settings
 * and of the space page, and cards of the space assistant's chat. React, the router and the
 * studio's own components come from the studio (docs/content/dev/plugins), so the page a plugin
 * draws is part of the same app.
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

/** An icon in the app bar that opens a page. */
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

/**
 * The parts of the space page: `info` (who the space is, its logos, colours, assets and facts),
 * `knowledge` (its documents and what its steps search), `data` (what its wizards keep) and
 * `results` (what its runs produced).
 */
export type StudioSpaceGroup = "info" | "knowledge" | "data" | "results";

/**
 * A section of the space page, in one of its parts, below the part's own sections. The studio
 * draws its heading and hint above it, and its entry in the part's menu under the plugin's name;
 * the component draws the rest, usually a `Card`.
 */
export interface StudioSpaceSection {
  /** Its anchor: `/space/<group>#<id>`. Unique on the whole space page. */
  id: string;
  /** The part it stands in; `knowledge` when left out. */
  group?: StudioSpaceGroup;
  label: () => string;
  /** One line under the heading: what the section is for. */
  hint?: () => string;
  component: ComponentType;
}

/** What a runner's section of the share dialog is handed: the wizard the dialog is about. */
export interface StudioShareSectionProps {
  wizard: { id: string; title: string };
}

/**
 * A runner's own part of the share dialog, under the runner's row once it is switched on for
 * the wizard: the keyword, the number, the link and its QR code. One per runner.
 */
export interface StudioShareSection {
  /** The runner's id, as the server half registered it. */
  runner: string;
  component: ComponentType<StudioShareSectionProps>;
}

/** What a card in the assistant's chat is handed. */
export interface StudioAssistantCardProps<T = unknown> {
  /** What the assistant tool returned. */
  data: T;
  /** Sends a message to the assistant, as if the person typed it: "Übernehmen". */
  send(message: string): void;
}

/**
 * Draws the result of a tool of the space assistant inside its chat: a tool the server half
 * registered with `card: true`.
 */
export interface StudioAssistantCard {
  /** The tool's name, as the server half registered it. */
  tool: string;
  // Each card knows the shape of its own tool's result.
  component: ComponentType<StudioAssistantCardProps<any>>;
}

/** The space the studio shows: what all its wizards share. */
export interface StudioSpace {
  id: string;
  /** What the switcher calls it. */
  name: string;
  /** Synced from a local install, or on a runtime where nothing is built: shown, not changed. */
  readOnly: boolean;
}

/** A row under the assistant's hello: a question the person asks with one click. */
export interface StudioAssistantSuggestion {
  label: string;
  /** What is sent; the label where left out. */
  message?: string;
  /** Put into the field to finish ("The loafer costs … now") instead of sent at once. */
  fill?: boolean;
}

/** The studio's assistant on a plugin's page: what it says before the first message. */
export interface StudioAssistantProps {
  title?: string;
  hello?: string;
  /** The input's placeholder: an example of what to ask. */
  placeholder?: string;
  /** Up to three questions under the hello. */
  suggestions?: StudioAssistantSuggestion[];
  /** The assistant changed something: read the page's data again. */
  onChanged?: () => void;
}

/**
 * What a plugin's page shows, for the assistant: it goes up with every message, beside the
 * page's address and title. At most 16 KiB together.
 */
export interface StudioAssistantPage extends StudioAssistantProps {
  /** An item the page has open. */
  open?: { kind: string; id?: string; label: string };
  /** Ids of what the person picked. */
  selection?: string[];
  /** A line on what the page holds: "12 products · 3 without a price". */
  summary?: string;
  /** Fields of the page with their values. */
  fields?: { id: string; label: string; value: unknown }[];
  /** A page of full-height tables: the assistant starts small here. */
  compact?: boolean;
}

/** A tool the assistant may run in the page: the shop's "filter the products". */
export interface StudioAssistantTool {
  /** What it does, for the model. */
  description: string;
  /** Its arguments as JSON Schema (`{ type: "object", properties: { … } }`). */
  parameters?: Record<string, unknown>;
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
  registerSpaceSection(section: StudioSpaceSection): void;
  registerShareSection(section: StudioShareSection): void;
  registerAssistantCard(card: StudioAssistantCard): void;
  /**
   * A hook: the space the studio shows, `null` while it has none. A component that calls it draws
   * again when the person picks another space.
   */
  useSpace(): StudioSpace | null;
  /**
   * A hook: where the page stands, as the trail after the logo in the top bar ("Termine /
   * Kalender"), said there instead of a heading of the page's own. Set while the page is shown.
   */
  useCrumbs(items: { label: string; to?: string }[]): void;
  /**
   * The studio's assistant stands on every page; on a plugin's page this tells it what to say
   * there (title, hello, suggestions, placeholder) and what to read again when it changed
   * something. It talks from the plugin's page: it gets what the server half's
   * `registerAssistantContext` says and uses the plugin's assistant tools first. Place it once,
   * anywhere in the page; it draws nothing.
   */
  Assistant: ComponentType<StudioAssistantProps>;
  /**
   * A hook: what the page shows, for the assistant — an open item, a selection, a summary,
   * fields — and its words. Data may change on every render; it is read when the person sends.
   */
  useAssistantPage(page: StudioAssistantPage): void;
  /**
   * A hook: a tool the assistant may run in the page while it is shown. Its name is prefixed
   * with the plugin's id (`shop_filter_products`). `run` gets the arguments and returns what the
   * assistant learns; it may change what the page shows, never save.
   */
  useAssistantTool(
    name: string,
    tool: StudioAssistantTool,
    run: (args: Record<string, unknown>) => unknown | Promise<unknown>,
  ): void;
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
