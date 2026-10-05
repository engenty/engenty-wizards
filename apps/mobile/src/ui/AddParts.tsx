import { router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { findWizard as findSaved, useQuery } from "../data/db";
import { hostLabel } from "../data/links";
import { addWizard, type Found } from "../data/wizards";
import { Engenty } from "../engenty/Engenty";
import { t } from "../i18n";
import { APP_THEME, FONT, type Theme, wizardTheme } from "../theme/theme";
import { Button, ICON, Label } from "./ui";

/** Scan | Enter ID: the scanner is there, one tap away, but the ID field comes first. */
export function AddSwitch({ active }: { active: "scan" | "id" }) {
  const theme = APP_THEME;
  const item = (key: "scan" | "id", label: string, go: () => void) => (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active === key }}
      onPress={active === key ? undefined : go}
      style={[styles.switchItem, active === key ? { backgroundColor: theme.input } : null]}
    >
      <Text
        style={{
          color: theme.ink,
          fontFamily: active === key ? FONT.uiSemi : FONT.uiMedium,
          fontSize: 14,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
  return (
    <View style={[styles.switch, { backgroundColor: "rgba(0,0,0,0.3)" }]}>
      {item("scan", t("add.scan"), () => router.replace("/scan"))}
      {item("id", t("add.id"), () => router.replace("/add"))}
    </View>
  );
}

/** The wizard behind an ID or a link, before it is added: what it is and whose. */
export function FoundCard({ found, onDone }: { found: Found; onDone?: () => void }) {
  const theme: Theme = wizardTheme(found.wizard.avatar);
  const [busy, setBusy] = useState<"add" | "start" | null>(null);
  const host = hostLabel(found.runtime);
  const saved = useQuery(() => findSaved(found.runtime, found.token), [found.runtime, found.token]);
  const add = async (start: boolean) => {
    setBusy(start ? "start" : "add");
    const id = await addWizard(found);
    onDone?.();
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
  return (
    <View style={[styles.found, { backgroundColor: theme.stage, borderColor: theme.card }]}>
      <Label theme={theme} style={{ textTransform: "uppercase", letterSpacing: 0.8 }}>
        {t("add.found")}
      </Label>
      <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
        <Engenty kind={found.wizard.avatar} size={64} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[styles.foundTitle, { color: theme.ink }]}>{found.wizard.title}</Text>
          {found.wizard.brand.name ? (
            <Label theme={theme}>{t("start.by", { name: found.wizard.brand.name })}</Label>
          ) : null}
        </View>
      </View>
      {found.wizard.description ? (
        <Text style={{ color: theme.ink2, fontFamily: FONT.ui, fontSize: 15, lineHeight: 21 }}>
          {found.wizard.description}
        </Text>
      ) : null}
      {host ? <Label theme={theme}>{t("add.otherHost", { host })}</Label> : null}
      {found.wizard.available ? (
        <View style={{ flexDirection: "row", gap: 8 }}>
          {saved ? null : (
            <Button
              theme={theme}
              kind="secondary"
              label={t("add.add")}
              busy={busy === "add"}
              onPress={() => void add(false)}
              style={{ flex: 1 }}
            />
          )}
          <Button
            theme={theme}
            label={t("add.start")}
            icon={ICON.arrow}
            busy={busy === "start"}
            onPress={() => void add(true)}
            style={{ flex: 1 }}
          />
        </View>
      ) : (
        <Label theme={theme}>{found.wizard.unavailableReason ?? t("add.unavailable")}</Label>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  switch: { flexDirection: "row", borderRadius: 999, padding: 3 },
  switchItem: { paddingHorizontal: 16, height: 34, borderRadius: 999, justifyContent: "center" },
  found: { gap: 12, padding: 16, borderRadius: 20, borderWidth: 1, marginTop: 6 },
  foundTitle: { fontFamily: FONT.display, fontSize: 21, lineHeight: 26 },
});
