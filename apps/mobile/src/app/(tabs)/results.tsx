import { router } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { listResults, useQuery } from "../../data/db";
import { t, useLang } from "../../i18n";
import { APP_THEME, FONT } from "../../theme/theme";
import { ResultRow } from "../../ui/ResultRow";
import { Screen, SectionTitle, TopBar } from "../../ui/ui";

/** Every result made in the app, newest first; opens without a connection. */
export default function ResultsScreen() {
  useLang();
  const theme = APP_THEME;
  const runs = useQuery(() => listResults());
  const today = new Date().toDateString();
  const groups = [
    {
      title: t("results.today"),
      runs:
        runs?.filter((r) => new Date(r.finishedAt ?? r.updatedAt).toDateString() === today) ?? [],
    },
    {
      title: t("results.earlier"),
      runs:
        runs?.filter((r) => new Date(r.finishedAt ?? r.updatedAt).toDateString() !== today) ?? [],
    },
  ].filter((g) => g.runs.length);
  return (
    <Screen theme={theme}>
      <TopBar theme={theme} title={t("results.title")} onBack={() => router.navigate("/")} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 20 }}>
        {runs?.length === 0 ? (
          <View style={[styles.empty, { backgroundColor: theme.card }]}>
            <Text style={[styles.title, { color: theme.ink }]}>{t("results.empty")}</Text>
            <Text style={[styles.sub, { color: theme.ink3 }]}>{t("results.emptyHint")}</Text>
          </View>
        ) : null}
        {groups.map((g) => (
          <View key={g.title} style={{ gap: 8 }}>
            <SectionTitle theme={theme}>{g.title}</SectionTitle>
            {g.runs.map((run) => (
              <ResultRow key={run.id} run={run} />
            ))}
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: FONT.uiSemi, fontSize: 16, lineHeight: 22 },
  sub: { fontFamily: FONT.ui, fontSize: 13, lineHeight: 18 },
  empty: { padding: 16, borderRadius: 16, gap: 4 },
});
