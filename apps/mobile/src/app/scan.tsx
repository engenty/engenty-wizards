import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { parseInput } from "../data/links";
import { type Found, findWizard } from "../data/wizards";
import { t, useLang } from "../i18n";
import { AddSwitch, FoundCard } from "../ui/AddParts";
import { Scanner } from "../ui/Scanner";

/** The app's scanner: a wizard's QR code (or a shared result's) opens what it links to. */
export default function ScanScreen() {
  useLang();
  const insets = useSafeAreaInsets();
  const [found, setFound] = useState<Found | null>(null);
  return (
    <View style={{ flex: 1 }}>
      <Scanner
        qrOnly
        title={t("scan.title")}
        hint={t("scan.hint")}
        top={<AddSwitch active="scan" onCamera />}
        onClose={() => router.back()}
        onCode={async (text) => {
          const parsed = parseInput(text);
          if (!parsed) {
            return false;
          }
          if (parsed.kind === "result") {
            router.replace({ pathname: "/shared", params: { url: text } });
            return true;
          }
          try {
            setFound(await findWizard(parsed));
            return true;
          } catch {
            return false;
          }
        }}
      />
      {found ? (
        <View style={{ position: "absolute", left: 12, right: 12, bottom: insets.bottom + 12 }}>
          <FoundCard found={found} />
        </View>
      ) : null}
    </View>
  );
}
