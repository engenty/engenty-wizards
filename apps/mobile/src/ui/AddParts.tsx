import { router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { findWizard as findSaved, useQuery } from "../data/db";
import { hostLabel } from "../data/links";
import { addWizard, type Found } from "../data/wizards";
import { Engenty } from "../engenty/Engenty";
import { t } from "../i18n";
import { APP_THEME, type Theme, wizardTheme } from "../theme/theme";
import { Button, text } from "./ui";

/** Scan code | Enter ID, as an iOS segmented control: the scanner one tap away, not in front. */
export function AddSwitch({ active, onCamera }: { active: "scan" | "id"; onCamera?: boolean }) {
  const theme = APP_THEME;
  const item = (key: "scan" | "id", label: string, go: () => void) => {
    const on = active === key;
    return (
      <Pressable
        accessibilityRole="tab"
        accessibilityState={{ selected: on }}
        onPress={on ? undefined : go}
        style={[styles.segment, on ? styles.segmentOn : null]}
      >
        <Text style={{ color: theme.ink, fontSize: 14, fontWeight: on ? "600" : "500" }}>
          {label}
        </Text>
      </Pressable>
    );
  };
  return (
    <View
      style={[
        styles.track,
        { backgroundColor: onCamera ? "rgba(0,0,0,0.45)" : "rgba(255,255,255,0.10)" },
      ]}
    >
      {item("scan", t("add.scan"), () => router.replace("/scan"))}
      {item("id", t("add.id"), () => router.replace("/add"))}
    </View>
  );
}

/** The wizard behind an ID or a link, before it is added: on its own colour, Add and Start. */
export function FoundCard({ found }: { found: Found }) {
  const theme: Theme = wizardTheme(found.wizard.avatar);
  const [busy, setBusy] = useState<"add" | "start" | null>(null);
  const host = hostLabel(found.runtime);
  const saved = useQuery(() => findSaved(found.runtime, found.token), [found.runtime, found.token]);
  const add = async (start: boolean) => {
    setBusy(start ? "start" : "add");
    const id = await addWizard(found);
    router.dismissAll();
    if (start || found.runId) {
      router.push({
        pathname: "/run",
        params: { wizard: String(id), ...(found.runId ? { runId: found.runId } : { start: "1" }) },
      });
    } else {
      router.push({ pathname: "/wizard/[id]", params: { id: String(id) } });
    }
  };
  const sub = [found.wizard.brand.name || null, host ?? "engenty.ai"].filter(Boolean).join(" · ");
  return (
    <View style={[styles.found, { backgroundColor: theme.stage, borderColor: theme.line }]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Engenty kind={found.wizard.avatar} size={46} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={[text.bodySemi, { color: theme.ink }]}>
            {found.wizard.title}
          </Text>
          <Text numberOfLines={1} style={[text.foot, { color: theme.ink3 }]}>
            {sub}
          </Text>
        </View>
      </View>
      {found.wizard.description ? (
        <Text numberOfLines={3} style={[text.sub, { color: theme.ink2 }]}>
          {found.wizard.description}
        </Text>
      ) : null}
      {found.wizard.available ? (
        <View style={{ flexDirection: "row", gap: 8 }}>
          {saved ? null : (
            <Button
              theme={theme}
              kind="glass"
              label={t("add.add")}
              busy={busy === "add"}
              onPress={() => void add(false)}
              style={{ flex: 1 }}
            />
          )}
          <Button
            theme={theme}
            label={t("add.start")}
            busy={busy === "start"}
            onPress={() => void add(true)}
            style={{ flex: 1 }}
          />
        </View>
      ) : (
        <Text style={[text.sub, { color: theme.ink2 }]}>
          {found.wizard.unavailableReason ?? t("add.unavailable")}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: "row", borderRadius: 17, padding: 2, height: 34, width: 240 },
  segment: { flex: 1, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  segmentOn: {
    backgroundColor: "rgba(255,255,255,0.24)",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  found: { gap: 12, padding: 14, borderRadius: 24, borderWidth: StyleSheet.hairlineWidth },
});
