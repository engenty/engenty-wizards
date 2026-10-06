import { t } from "../lib/i18n";

export interface ProjectSection {
  /** Its anchor on the space page: `/space#<id>`, set in `ProjectSettings`. */
  id: string;
  label: string;
}

/** The sections of the space page, in the order the page shows them. */
export function projectSections(): ProjectSection[] {
  return [
    { id: "base", label: t("project.base") },
    { id: "logos", label: t("project.logos") },
    { id: "colors", label: t("project.colors") },
    { id: "assets", label: t("project.assets") },
    { id: "documents", label: t("project.documents") },
    { id: "facts", label: t("project.facts") },
  ];
}
