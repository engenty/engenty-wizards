import { defineStudioPlugin } from "@engenty-wizards/plugin-sdk/studio";
import { MessageCircle } from "lucide-react";
import { setStudio, t } from "./app";
import { SettingsSection } from "./Settings";
import { ShareSection } from "./Share";

/**
 * The studio half: the number and the token in the settings, and the keyword with its link
 * under the WhatsApp row of the share dialog. Everything talks to src/plugin.ts.
 */
export default defineStudioPlugin((studio) => {
  setStudio(studio);
  studio.registerSettingsSection({
    id: "whatsapp",
    label: () => t("title"),
    icon: MessageCircle,
    component: SettingsSection,
  });
  studio.registerShareSection({ runner: "whatsapp", component: ShareSection });
});
