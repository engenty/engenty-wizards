import { Blocks, Cable, Cpu, type LucideIcon, Plug, UserRound } from "lucide-react";
import type { ComponentType } from "react";
import { t } from "../lib/i18n";
import type { Me } from "../lib/session";
import type { StudioPlugins } from "../plugins/host";

export interface SettingsSection {
  id: string;
  label: string;
  icon: LucideIcon | ComponentType<{ className?: string }>;
  /** The user menu links to it directly. */
  menu: boolean;
  /** A section a plugin added: what it draws, and whose it is. */
  plugin?: StudioPlugins["sections"][number];
}

/**
 * The sections of the settings, in the order of their list: the studio's own, then what the
 * plugins added, then the plugins themselves.
 */
export function settingsSections(
  me: Me | null | undefined,
  plugins: StudioPlugins,
): SettingsSection[] {
  return [
    { id: "account", label: t("account.title"), icon: UserRound, menu: true },
    { id: "connectors", label: t("connectors.title"), icon: Plug, menu: true },
    // Models are chosen on the machine only when the runtime runs alone.
    ...(me?.mode === "local"
      ? [{ id: "models", label: t("local.title"), icon: Cpu, menu: true }]
      : []),
    { id: "integrate", label: t("integrate.nav"), icon: Cable, menu: true },
    ...plugins.sections.map((section) => ({
      id: section.id,
      label: section.label(),
      icon: section.icon,
      menu: section.menu ?? false,
      plugin: section,
    })),
    // Nothing to show where the runtime has no plugins.
    ...(plugins.plugins.length || plugins.problems.length
      ? [{ id: "plugins", label: t("plugins.title"), icon: Blocks, menu: false }]
      : []),
  ];
}
