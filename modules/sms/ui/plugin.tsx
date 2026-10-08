import { defineStudioPlugin } from "@engenty-wizards/plugin-sdk/studio";
import { MessageSquareText } from "lucide-react";
import { setStudio, t } from "./app";
import { SettingsSection } from "./Settings";
import { ShareSection } from "./Share";

/**
 * The studio half: the Twilio account and the number in the settings, and the keyword with
 * its link under the SMS row of the share dialog. Everything talks to src/plugin.ts.
 */
export default defineStudioPlugin((studio) => {
  setStudio(studio);
  studio.registerSettingsSection({
    id: "sms",
    label: () => t("title"),
    icon: MessageSquareText,
    component: SettingsSection,
  });
  studio.registerShareSection({ runner: "sms", component: ShareSection });
});
