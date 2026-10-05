import * as Clipboard from "expo-clipboard";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "../data/db";
import { FindFailed, type Found, findWizard, idRuntime } from "../data/wizards";
import { t, useLang } from "../i18n";
import { APP_THEME, FONT } from "../theme/theme";
import { AddSwitch, FoundCard } from "../ui/AddParts";
import { Button, ICON, Icon, IconButton, Label, Screen } from "../ui/ui";

const ERROR_TEXT = {
  invalid: "add.invalid",
  notFound: "add.notFound",
  tooMany: "add.tooMany",
  offline: "common.offline",
} as const;

export default function AddScreen() {
  useLang();
  const theme = APP_THEME;
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ input?: string }>();
  const [input, setInput] = useState(params.input ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [found, setFound] = useState<Found | null>(null);
  const runtime = useQuery(idRuntime);

  const find = async (text = input) => {
    setBusy(true);
    setError(null);
    setFound(null);
    try {
      setFound(await findWizard(text));
    } catch (err) {
      setError(t(ERROR_TEXT[err instanceof FindFailed ? err.reason : "offline"]));
    } finally {
      setBusy(false);
    }
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: once, for a link the app was opened with
  useEffect(() => {
    if (params.input) {
      void find(params.input);
    }
  }, []);

  return (
    <Screen theme={theme}>
      <View style={[styles.top, { paddingTop: Platform.OS === "ios" ? 12 : insets.top + 6 }]}>
        <IconButton label={t("scan.close")} onPress={() => router.back()}>
          <Icon d={ICON.close} color={theme.ink} />
        </IconButton>
        <View style={{ flex: 1, alignItems: "center" }}>
          <AddSwitch active="id" />
        </View>
        <View style={{ width: 44 }} />
      </View>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: 16, gap: 14 }}
        >
          <Text style={[styles.label, { color: theme.ink2 }]}>{t("add.idLabel")}</Text>
          <TextInput
            value={input}
            onChangeText={(v) => {
              setInput(v);
              setError(null);
            }}
            onSubmitEditing={() => void find()}
            autoFocus={!params.input}
            autoCapitalize="characters"
            autoCorrect={false}
            returnKeyType="search"
            placeholder="K7WM 4TQ9"
            placeholderTextColor={theme.ink4}
            style={[
              styles.input,
              { backgroundColor: theme.card, color: theme.ink, borderColor: theme.line },
            ]}
          />
          <Label theme={theme}>{t("add.idHint")}</Label>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Button
              theme={theme}
              kind="secondary"
              label={t("add.paste")}
              icon={ICON.clipboard}
              onPress={async () => {
                const text = await Clipboard.getStringAsync();
                if (text) {
                  setInput(text);
                  void find(text);
                }
              }}
              style={{ flex: 1 }}
            />
            <Button
              theme={theme}
              label={t("add.find")}
              busy={busy}
              disabled={!input.trim()}
              onPress={() => void find()}
              style={{ flex: 1 }}
            />
          </View>
          {runtime ? (
            <Label theme={theme}>{t("add.askedAt", { host: new URL(runtime).host })}</Label>
          ) : null}
          {error ? (
            <Text style={{ color: theme.rose, fontFamily: FONT.ui, fontSize: 15 }}>{error}</Text>
          ) : null}
          {found ? <FoundCard found={found} /> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { paddingHorizontal: 8, flexDirection: "row", alignItems: "center" },
  label: { fontFamily: FONT.uiMedium, fontSize: 15 },
  input: {
    height: 64,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 18,
    fontFamily: FONT.mono,
    fontSize: 26,
    letterSpacing: 3,
  },
});
