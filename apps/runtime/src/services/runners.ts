import { type WizardDefinition, wizardLang } from "@engenty-wizards/shared/definition";
import type { PublicWizard } from "@engenty-wizards/shared/run";
import {
  BUILT_IN_RUNNERS,
  DEFAULT_RUNNER,
  DEFAULT_RUNNER_SETTINGS,
  type RunnerFit,
  type RunnerInfo,
  type RunnerSettings,
  runnerFit,
} from "@engenty-wizards/shared/runners";
import { pluginsOf } from "../plugins/registry.js";
import { currentTenant } from "../tenants/tenant.js";
import { ServiceError } from "./errors.js";
import { shareUrl, type WizardRow } from "./wizards.js";

/**
 * The runners a wizard can run through: the built-in page and chat, and the ones the tenant's
 * plugins add. Which of them a wizard offers is set per wizard (`wizard.runners`): the one its
 * link opens, and the ones switched on beside it.
 */

/** The runners this tenant has, built-ins first. */
export async function runnersOf(tenantId = currentTenant()): Promise<RunnerInfo[]> {
  const plugins = await pluginsOf(tenantId);
  return [
    ...BUILT_IN_RUNNERS,
    ...plugins.flatMap((p) => [...p.runners.values()].map((r) => r.info)),
  ];
}

/**
 * How a wizard is offered, on the runners there are: a runner switched on that is gone (a
 * plugin the tenant lost) is left out, and the link opens the first one left.
 */
export function runnerSettingsOf(w: WizardRow, available: RunnerInfo[]): RunnerSettings {
  const ids = new Set(available.map((r) => r.id));
  const wanted = w.runners ?? DEFAULT_RUNNER_SETTINGS;
  const enabled = wanted.enabled.filter((id) => ids.has(id));
  if (!enabled.includes(DEFAULT_RUNNER) && ids.has(DEFAULT_RUNNER) && !enabled.length) {
    enabled.push(DEFAULT_RUNNER);
  }
  const fallback = enabled[0] ?? DEFAULT_RUNNER;
  return {
    default: enabled.includes(wanted.default) ? wanted.default : fallback,
    enabled,
  };
}

/** Checks what the owner wants to set, against the runners the tenant has. */
export async function checkRunnerSettings(settings: RunnerSettings): Promise<RunnerSettings> {
  const available = await runnersOf();
  const ids = new Set(available.map((r) => r.id));
  const unknown = settings.enabled.find((id) => !ids.has(id));
  if (unknown) {
    throw new ServiceError("invalid", `There is no runner "${unknown}" here.`);
  }
  const enabled = [...new Set(settings.enabled)];
  if (!enabled.length) {
    throw new ServiceError("invalid", "At least one runner stays on.");
  }
  if (!enabled.includes(settings.default)) {
    throw new ServiceError("invalid", "The link opens a runner that is switched on.");
  }
  return { default: settings.default, enabled };
}

/** The runners with how each fits the draft, and how the wizard is offered. */
export async function wizardRunners(w: WizardRow): Promise<{
  runners: (RunnerInfo & { fit: RunnerFit })[];
  settings: RunnerSettings;
}> {
  const available = await runnersOf();
  return {
    runners: available.map((r) => ({ ...r, fit: runnerFit(w.draft, r) })),
    settings: runnerSettingsOf(w, available),
  };
}

/** The address a runner opens the wizard at: the link itself for the default, else its sub-path. */
export function runnerUrl(
  w: WizardRow,
  runner: RunnerInfo,
  settings: RunnerSettings,
): string | null {
  if (runner.kind !== "page") {
    return null;
  }
  return runner.id === settings.default
    ? shareUrl(w.shareToken)
    : `${shareUrl(w.shareToken)}/${runner.id}`;
}

/** What the wizard's public page offers: the runners switched on, the link's first. */
export async function publicRunners(
  w: WizardRow,
  def: WizardDefinition,
): Promise<PublicWizard["runners"]> {
  const available = await runnersOf();
  const settings = runnerSettingsOf(w, available);
  const lang = wizardLang(def);
  return settings.enabled
    .map((id) => available.find((r) => r.id === id))
    .filter((r): r is RunnerInfo => Boolean(r))
    .sort((a, b) => Number(b.id === settings.default) - Number(a.id === settings.default))
    .map((r) => ({
      id: r.id,
      label: r.label[lang],
      kind: r.kind,
      url: runnerUrl(w, r, settings),
    }));
}
