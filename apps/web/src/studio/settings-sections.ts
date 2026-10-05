import { Blocks, Cpu, FolderCog, type LucideIcon, Plug, UserRound } from "lucide-react";
import { t } from "../lib/i18n";
import type { Me } from "../lib/session";

export type SettingsSection = "project" | "connectors" | "models" | "integrate" | "account";

/**
 * The sections of the settings, in the order of their list. `menu`: the user menu links to it
 * directly.
 */
export function settingsSections(
  me: Me | null | undefined,
): { id: SettingsSection; label: string; icon: LucideIcon; menu: boolean }[] {
  return [
    { id: "account", label: t("account.title"), icon: UserRound, menu: true },
    { id: "project", label: t("settings.project"), icon: FolderCog, menu: true },
    { id: "connectors", label: t("connectors.title"), icon: Plug, menu: true },
    // Models are chosen on the machine only when the runtime runs alone.
    ...(me?.mode === "local"
      ? [{ id: "models" as const, label: t("local.title"), icon: Cpu, menu: true }]
      : []),
    { id: "integrate", label: t("integrate.nav"), icon: Blocks, menu: true },
  ];
}
