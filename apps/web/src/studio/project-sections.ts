import { t } from "../lib/i18n";
import type { StudioPlugins } from "../plugins/host";

export interface ProjectSection {
  /** Its anchor on the space page: `/space#<id>`, set in `ProjectSettings` or by a plugin. */
  id: string;
  label: string;
}

export interface ProjectSectionGroup {
  /** The plugin's id and name; none for the space's own sections. */
  plugin: string | null;
  label: string | null;
  sections: ProjectSection[];
}

/** The space's own sections, in the order the page shows them. A plugin cannot take their ids. */
export const OWN_SPACE_SECTIONS = ["base", "logos", "colors", "assets", "documents", "facts"];

/** The sections of the space page, in the order the page shows them: its own, then each plugin's. */
export function projectSections(plugins: StudioPlugins): ProjectSectionGroup[] {
  const own: ProjectSection[] = [
    { id: "base", label: t("project.base") },
    { id: "logos", label: t("project.logos") },
    { id: "colors", label: t("project.colors") },
    { id: "assets", label: t("project.assets") },
    { id: "documents", label: t("project.documents") },
    { id: "facts", label: t("project.facts") },
  ];
  const byPlugin = new Map<string, ProjectSection[]>();
  for (const section of plugins.spaceSections) {
    const list = byPlugin.get(section.plugin) ?? [];
    list.push({ id: section.id, label: section.label() });
    byPlugin.set(section.plugin, list);
  }
  return [
    { plugin: null, label: null, sections: own },
    ...[...byPlugin].map(([id, sections]) => ({
      plugin: id,
      label: plugins.plugins.find((p) => p.id === id)?.name ?? id,
      sections,
    })),
  ];
}
