/**
 * Wizards in OpenUI chats: the Wizard component runs a published wizard inside the chat, page
 * by page, as its author defined it; the chat model only decides that it runs and what it
 * already knows. `prompt.ts` is the server's half: the rules and the list of wizards.
 */

export {
  addWizard,
  loadWizards,
  WIZARD_COMPONENT,
  WIZARD_DESCRIPTION,
  type WizardInfo,
  type WizardProps,
  WizardSpec,
  wizardProps,
  wizardRules,
} from "./prompt.js";
export { useWizardRun } from "./run.js";
export { configureWizards, Wizard, type WizardsConfig } from "./Wizard.js";
