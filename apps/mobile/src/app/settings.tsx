import Constants from "expo-constants";
import { useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { deleteAllResults, storageUsed, useQuery, writeSetting } from "../data/db";
import { DEFAULT_RUNTIME } from "../data/links";
import { deleteAllFiles } from "../data/results";
import { idRuntime } from "../data/wizards";
import { formatBytes, type Lang, lang, setLang, t, useLang } from "../i18n";
import { notificationsWanted, requestNotifyPermission } from "../notify";
import { APP_THEME, FONT } from "../theme/theme";
import { goBack, Label, Screen, SectionTitle, TopBar } from "../ui/ui";

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  const theme = APP_THEME;
  return (
    <View style={[styles.segmented, { backgroundColor: theme.card }]}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.value)}
            style={[styles.segment, on ? { backgroundColor: theme.input } : null]}
          >
            <Text
              style={{
                color: on ? theme.ink : theme.ink2,
                fontFamily: on ? FONT.uiSemi : FONT.uiMedium,
                fontSize: 15,
              }}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function SettingsScreen() {
  useLang();
  const theme = APP_THEME;
  const used = useQuery(storageUsed);
  const notify = useQuery(notificationsWanted);
  const runtime = useQuery(idRuntime);
  const [editing, setEditing] = useState<string | null>(null);

  const saveRuntime = async () => {
    if (editing === null) {
      return;
    }
    let value = editing.trim() || DEFAULT_RUNTIME;
    if (!/^https?:\/\//.test(value)) {
      value = `https://${value}`;
    }
    try {
      const url = new URL(value);
      await writeSetting("idRuntime", `${url.origin}${url.pathname.replace(/\/+$/, "")}`);
      setEditing(null);
    } catch {
      Alert.alert(t("add.invalid"));
    }
  };

  return (
    <Screen theme={theme}>
      <TopBar theme={theme} title={t("settings.title")} onBack={goBack} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 18, gap: 20 }}>
        <View style={styles.section}>
          <SectionTitle theme={theme}>{t("settings.language")}</SectionTitle>
          <Segmented<Lang>
            value={lang}
            options={[
              { value: "en", label: "English" },
              { value: "de", label: "Deutsch" },
            ]}
            onChange={(v) => {
              setLang(v);
              void writeSetting("lang", v);
            }}
          />
        </View>
        <View style={styles.section}>
          <SectionTitle theme={theme}>{t("settings.notifications")}</SectionTitle>
          <View style={[styles.row, { backgroundColor: theme.card }]}>
            <Text style={[styles.text, { flex: 1, color: theme.ink }]}>
              {t("settings.notifyLabel")}
            </Text>
            <Switch
              value={notify ?? true}
              trackColor={{ true: theme.ember, false: theme.paper3 }}
              thumbColor="#fff"
              onValueChange={async (on) => {
                if (on && !(await requestNotifyPermission())) {
                  return;
                }
                await writeSetting("notify", on);
              }}
            />
          </View>
        </View>
        <View style={styles.section}>
          <SectionTitle theme={theme}>{t("settings.storage")}</SectionTitle>
          <View style={[styles.group, { backgroundColor: theme.card }]}>
            <View style={styles.line}>
              <Text style={[styles.text, { color: theme.ink }]}>{t("settings.used")}</Text>
              <Text style={[styles.text, { color: theme.ink3 }]}>{formatBytes(used ?? 0)}</Text>
            </View>
            <View style={{ height: 1, marginHorizontal: 16, backgroundColor: theme.line }} />
            <Pressable
              accessibilityRole="button"
              style={styles.line}
              onPress={() =>
                Alert.alert(t("settings.deleteAll"), t("settings.deleteAllAsk"), [
                  { text: t("common.cancel"), style: "cancel" },
                  {
                    text: t("common.delete"),
                    style: "destructive",
                    onPress: async () => {
                      deleteAllFiles();
                      await deleteAllResults();
                    },
                  },
                ])
              }
            >
              <Text style={[styles.text, { color: theme.rose, fontFamily: FONT.uiMedium }]}>
                {t("settings.deleteAll")}
              </Text>
            </Pressable>
          </View>
        </View>
        <View style={styles.section}>
          <SectionTitle theme={theme}>{t("settings.ids")}</SectionTitle>
          <View style={[styles.row, { backgroundColor: theme.card }]}>
            <Text style={[styles.text, { color: theme.ink }]}>{t("settings.askedAt")}</Text>
            <TextInput
              value={editing ?? (runtime ? new URL(runtime).host : "")}
              onFocus={() => setEditing(runtime ?? DEFAULT_RUNTIME)}
              onChangeText={setEditing}
              onSubmitEditing={() => void saveRuntime()}
              onBlur={() => void saveRuntime()}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              style={[styles.text, styles.runtimeInput, { color: theme.ink3 }]}
            />
          </View>
          <Label theme={theme} style={{ marginHorizontal: 4 }}>
            {t("settings.runtimeHint")}
          </Label>
        </View>
        <Label theme={theme} style={{ textAlign: "center", marginTop: 6 }}>
          {t("settings.version", { version: Constants.expoConfig?.version ?? "" })}
        </Label>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { gap: 8 },
  segmented: { flexDirection: "row", gap: 4, padding: 4, borderRadius: 14 },
  segment: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  row: {
    minHeight: 56,
    borderRadius: 14,
    paddingVertical: 8,
    paddingLeft: 16,
    paddingRight: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  group: { borderRadius: 14 },
  line: {
    height: 48,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  text: { fontFamily: FONT.ui, fontSize: 15, lineHeight: 21 },
  runtimeInput: { flex: 1, textAlign: "right", paddingVertical: 8 },
});
