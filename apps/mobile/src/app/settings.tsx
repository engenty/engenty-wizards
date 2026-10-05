import Constants from "expo-constants";
import { useState } from "react";
import {
  ActionSheetIOS,
  Alert,
  Platform,
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
import { APP_THEME } from "../theme/theme";
import {
  Chevron,
  Footer,
  GLYPH,
  Glyph,
  Group,
  GroupTitle,
  goBack,
  Row,
  Screen,
  TopBar,
  text,
} from "../ui/ui";

const LANGS: { value: Lang; label: string }[] = [
  { value: "en", label: "English" },
  { value: "de", label: "Deutsch" },
];

/** A setting's icon on its coloured tile, as in the system's Settings. */
function Tile({ color, glyph }: { color: string; glyph: string }) {
  return (
    <View style={[styles.tile, { backgroundColor: color }]}>
      <Glyph d={glyph} size={18} color="#fff" />
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

  const pickLanguage = () => {
    const choose = (v: Lang) => {
      setLang(v);
      void writeSetting("lang", v);
    };
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: [...LANGS.map((l) => l.label), t("common.cancel")],
          cancelButtonIndex: LANGS.length,
        },
        (i) => i < LANGS.length && choose(LANGS[i].value),
      );
    } else {
      Alert.alert(t("settings.language"), undefined, [
        ...LANGS.map((l) => ({ text: l.label, onPress: () => choose(l.value) })),
        { text: t("common.cancel"), style: "cancel" as const },
      ]);
    }
  };

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
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 12,
          paddingBottom: 48,
          gap: 28,
        }}
      >
        <View>
          <Group theme={theme} inset={60}>
            <Row onPress={pickLanguage}>
              <Tile color="#3a7bf6" glyph={GLYPH.globe} />
              <Text style={[text.body, { flex: 1, color: theme.ink }]}>
                {t("settings.language")}
              </Text>
              <Text style={[text.body, { color: theme.ink3 }]}>
                {LANGS.find((l) => l.value === lang)?.label}
              </Text>
              <Chevron theme={theme} />
            </Row>
            <Row>
              <Tile color="#e5484d" glyph={GLYPH.bell} />
              <Text style={[text.body, { flex: 1, color: theme.ink }]}>
                {t("settings.notifications")}
              </Text>
              {/* iOS 26 draws its switch wider than the frame React Native gives it. */}
              <View style={styles.switch}>
                <Switch
                  value={notify ?? true}
                  trackColor={{ true: theme.ember, false: theme.paper3 }}
                  onValueChange={async (on) => {
                    if (on && !(await requestNotifyPermission())) {
                      return;
                    }
                    await writeSetting("notify", on);
                  }}
                />
              </View>
            </Row>
          </Group>
          <Footer theme={theme}>{t("settings.notifyFoot")}</Footer>
        </View>
        <View style={{ gap: 7 }}>
          <GroupTitle theme={theme}>{t("settings.storage")}</GroupTitle>
          <Group theme={theme} inset={60}>
            <Row>
              <Tile color="#6b7280" glyph={GLYPH.disk} />
              <Text style={[text.body, { flex: 1, color: theme.ink }]}>{t("settings.used")}</Text>
              <Text style={[text.body, { color: theme.ink3 }]}>{formatBytes(used ?? 0)}</Text>
            </Row>
            <Row
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
              <Text style={[text.body, { color: "#ff6961" }]}>{t("settings.deleteAll")}</Text>
            </Row>
          </Group>
        </View>
        <View style={{ gap: 7 }}>
          <GroupTitle theme={theme}>{t("settings.ids")}</GroupTitle>
          <Group theme={theme} inset={60}>
            <Row>
              <Tile color="#0e9aa7" glyph={GLYPH.server} />
              <Text style={[text.body, { color: theme.ink }]}>{t("settings.askedAt")}</Text>
              <TextInput
                value={editing ?? (runtime ? new URL(runtime).host : "")}
                onFocus={() => setEditing(runtime ?? DEFAULT_RUNTIME)}
                onChangeText={setEditing}
                onSubmitEditing={() => void saveRuntime()}
                onBlur={() => void saveRuntime()}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                keyboardAppearance="dark"
                style={[text.body, styles.runtime, { color: theme.ink3 }]}
              />
            </Row>
          </Group>
          <Footer theme={theme}>{t("settings.runtimeHint")}</Footer>
        </View>
        <Group theme={theme} inset={60}>
          <Row>
            <Tile color="#6b7280" glyph={GLYPH.info} />
            <Text style={[text.body, { flex: 1, color: theme.ink }]}>{t("settings.about")}</Text>
            <Text style={[text.body, { color: theme.ink3 }]}>
              engenty wizards {Constants.expoConfig?.version ?? ""}
            </Text>
          </Row>
        </Group>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  tile: { width: 30, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  runtime: { flex: 1, textAlign: "right", paddingVertical: 8 },
  switch: { height: 52, justifyContent: "center", alignItems: "flex-end", minWidth: 64 },
});
