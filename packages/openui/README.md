# @engenty-wizards/openui

Wizards in [OpenUI](https://github.com/thesysdev/openui) chats. The chat's model decides that
a wizard runs and what it already knows. The wizard then runs inside the conversation as its
author defined it, drawn by the runner (`packages/runner`) in the chat's own page.

```tsx
// The browser
import { addWizard, configureWizards, Wizard } from "@engenty-wizards/openui";
import { openuiChatLibrary } from "@openuidev/react-ui/genui-lib";
import "@engenty-wizards/runner/runner.css";

configureWizards({ runtime: "/wizards-runtime" }); // where the runtime answers
const library = addWizard(openuiChatLibrary, Wizard);
```

```ts
// The server that builds the system prompt
import { addWizard, loadWizards, wizardRules } from "@engenty-wizards/openui/prompt";

const wizards = await loadWizards("http://localhost:24368", ["<token>"]);
const prompt = addWizard(openuiChatLibrary).prompt({
  ...openuiChatPromptOptions,
  additionalRules: [...(openuiChatPromptOptions.additionalRules ?? []), ...wizardRules(wizards)],
});
```

What the model writes: `Wizard("<token>", "<note>", {plate: "W-12345"})`. The prefill starts
the page's fields, and the person still sees and sends each page. When the run is done, the
component sends a `continue_conversation` action with the result's texts as its context.

A whole chat to try it with: `examples/openui-chat`.
