import { defineStudioPlugin } from "@engenty-wizards/plugin-sdk/studio";
import { PhoneCall } from "lucide-react";
import { setStudio, t } from "./app";
import { SettingsSection } from "./Settings";

/** The studio half: Twilio, the OpenAI project and the addresses to enter, in the settings. */
export default defineStudioPlugin((studio) => {
  setStudio(studio);
  studio.registerSettingsSection({
    id: "calls",
    label: () => t("title"),
    icon: PhoneCall,
    component: SettingsSection,
  });
});
