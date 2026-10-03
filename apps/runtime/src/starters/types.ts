import type { WizardDefinition } from "@engenty-wizards/shared/definition";

export interface Starter {
  id: string;
  title: string;
  pitch: string;
  /** Where the studio lists it: the big starters, or the small ones for a website. */
  group?: "website";
  /** Workspace files the wizard starts with (widgets, price lists, reference texts): path → text. */
  files?: Record<string, string>;
  definition: WizardDefinition;
}
