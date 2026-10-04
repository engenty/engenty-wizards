import type { WizardDefinition } from "@engenty-wizards/shared/definition";
import type { Industry, UseCase } from "@engenty-wizards/shared/marketplace";

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

/** How the marketplace sorts a starter of the base set. */
export interface StarterListing {
  /** Raised by one whenever the starter changes: every runtime then takes the new one into its database. */
  revision: number;
  industries: Industry[];
  useCases: UseCase[];
  /**
   * What people ask for when they mean this starter, German and English: the thing made, the
   * occasion, who needs it, other names for it. Searched, never shown; changing it needs no
   * new revision.
   */
  search: string[];
}
