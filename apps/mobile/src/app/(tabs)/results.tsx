import { router } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { listResults, useQuery } from "../../data/db";
import { t, useLang } from "../../i18n";
import { APP_THEME } from "../../theme/theme";
import { ResultRow } from "../../ui/ResultRow";
import {
  Glass,
  Group,
  ICON,
  Icon,
  Screen,
  SectionTitle,
  TAB_SPACE,
  TopBar,
  text,
} from "../../ui/ui";

/** Every result made in the app, newest first; opens without a connection. */
export default function ResultsScreen() {
  useLang();
  const theme = APP_THEME;
  const runs = useQuery(() => listResults());
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const found = (runs ?? []).filter(
    (r) =>
      !q ||
      (r.result?.title ?? "").toLowerCase().includes(q) ||
      r.wizardTitle.toLowerCase().includes(q),
  );
  const today = new Date().toDateString();
  const day = (r: (typeof found)[number]) => new Date(r.finishedAt ?? r.updatedAt).toDateString();
  const groups = [
    { title: t("results.today"), runs: found.filter((r) => day(r) === today) },
    { title: t("results.earlier"), runs: found.filter((r) => day(r) !== today) },
  ].filter((g) => g.runs.length);
  return (
    <Screen theme={theme}>
      <TopBar theme={theme} title={t("results.title")} onBack={() => router.navigate("/")} />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 6,
          paddingBottom: TAB_SPACE,
          gap: 22,
        }}
      >
        {runs?.length ? (
          <Glass style={styles.search}>
            <Icon d={ICON.search} size={18} color={theme.ink3} strokeWidth={2.2} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={t("results.search")}
              placeholderTextColor={theme.ink3}
              returnKeyType="search"
              clearButtonMode="while-editing"
              style={[text.body, { flex: 1, color: theme.ink, paddingVertical: 0 }]}
            />
          </Glass>
        ) : null}
        {runs?.length === 0 ? (
          <View style={[styles.empty, { backgroundColor: theme.card }]}>
            <Text style={[text.bodySemi, { color: theme.ink }]}>{t("results.empty")}</Text>
            <Text style={[text.sub, { color: theme.ink3 }]}>{t("results.emptyHint")}</Text>
          </View>
        ) : null}
        {groups.map((g) => (
          <View key={g.title} style={{ gap: 8 }}>
            <SectionTitle theme={theme}>{g.title}</SectionTitle>
            <Group theme={theme} inset={70}>
              {g.runs.map((run) => (
                <ResultRow key={run.id} run={run} />
              ))}
            </Group>
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  search: {
    height: 44,
    borderRadius: 22,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  empty: { padding: 18, borderRadius: 26, gap: 4 },
});
