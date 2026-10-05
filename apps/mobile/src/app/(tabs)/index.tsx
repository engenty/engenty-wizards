import { router } from "expo-router";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  listWizards,
  openRuns,
  type Run,
  removeWizard,
  useQuery,
  type Wizard,
} from "../../data/db";
import { hostLabel } from "../../data/links";
import { Engenty } from "../../engenty/Engenty";
import { formatDate, formatTime, t, useLang } from "../../i18n";
import { APP_THEME, FONT, type Theme, wizardTheme } from "../../theme/theme";
import { Button, ICON, Icon, IconButton, Screen } from "../../ui/ui";

function Progress({ run, theme }: { run: Run; theme: Theme }) {
  const total = Math.max(run.progress.total, 1);
  return (
    <View style={{ flexDirection: "row", gap: 4 }}>
      {Array.from({ length: total }, (_, i) => (
        <View
          key={i}
          style={{
            flex: 1,
            height: 5,
            borderRadius: 3,
            backgroundColor: i < run.progress.done ? theme.ember : theme.paper3,
          }}
        />
      ))}
    </View>
  );
}

/** The run not finished yet: tall, on its wizard's colour, with the step it is at. */
function ActiveRun({ run, wizard }: { run: Run; wizard: Wizard | undefined }) {
  const theme = wizardTheme(run.avatar);
  const open = () =>
    router.push({
      pathname: "/run",
      params: { wizard: String(run.wizardId ?? ""), runId: run.id },
    });
  const brand = wizard?.brand.name;
  return (
    <Pressable
      onPress={open}
      accessibilityRole="button"
      style={[styles.active, { backgroundColor: theme.stage, borderColor: theme.card }]}
    >
      <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
        <Engenty kind={run.avatar} size={60} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text numberOfLines={2} style={[styles.activeTitle, { color: theme.ink }]}>
            {run.wizardTitle}
          </Text>
          <Text style={[styles.sub, { color: theme.ink3 }]}>
            {[brand, t("active.started", { time: formatTime(run.startedAt) })]
              .filter(Boolean)
              .join(" · ")}
          </Text>
        </View>
      </View>
      {run.progress.total ? (
        <Text style={[styles.step, { color: theme.ink2 }]}>
          {t("active.step", {
            done: Math.min(run.progress.done + 1, run.progress.total),
            total: run.progress.total,
          })}
          {run.stepTitle ? ` · ${run.stepTitle}` : ""}
        </Text>
      ) : null}
      {run.status === "running" ? (
        <Text style={[styles.sub, { color: theme.ink3 }]}>{t("wizards.running")}</Text>
      ) : null}
      {run.progress.total ? <Progress run={run} theme={theme} /> : null}
      <Button theme={theme} label={t("active.continue")} icon={ICON.arrow} onPress={open} />
    </Pressable>
  );
}

function WizardRow({
  wizard,
  running,
}: {
  wizard: Wizard & { lastRunAt: string | null };
  running: boolean;
}) {
  const theme = APP_THEME;
  const host = hostLabel(wizard.runtime);
  const sub = running
    ? t("wizards.running")
    : [wizard.brand.name || null, host, wizard.lastRunAt ? formatDate(wizard.lastRunAt) : null]
        .filter(Boolean)
        .join(" · ");
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: "/wizard/[id]", params: { id: String(wizard.id) } })}
      onLongPress={() =>
        Alert.alert(wizard.title, t("wizards.removeAsk", { title: wizard.title }), [
          { text: t("common.cancel"), style: "cancel" },
          {
            text: t("wizards.remove"),
            style: "destructive",
            onPress: () => void removeWizard(wizard.id),
          },
        ])
      }
      style={({ pressed }) => [styles.row, pressed ? { opacity: 0.7 } : null]}
    >
      <Engenty kind={wizard.avatar} size={52} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text numberOfLines={1} style={[styles.rowTitle, { color: theme.ink }]}>
          {wizard.title}
        </Text>
        {sub ? (
          <Text
            numberOfLines={1}
            style={[styles.sub, { color: running ? theme.ember : theme.ink3 }]}
          >
            {sub}
          </Text>
        ) : null}
      </View>
      <Icon d={ICON.next} size={18} color={theme.ink4} />
    </Pressable>
  );
}

export default function WizardsScreen() {
  useLang();
  const insets = useSafeAreaInsets();
  const theme = APP_THEME;
  const wizards = useQuery(listWizards);
  const runs = useQuery(openRuns);
  const active = runs?.[0];
  const runningIds = new Set((runs ?? []).map((r) => r.wizardId));
  return (
    <Screen theme={theme}>
      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
        {/* The engenty is the menu. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("settings.title")}
          onPress={() => router.push("/settings")}
          hitSlop={8}
        >
          <Engenty kind="drop" size={44} />
        </Pressable>
        <IconButton
          label={t("wizards.add")}
          onPress={() => router.push("/add")}
          background={theme.card}
        >
          <Icon d={ICON.plus} color={theme.ink} />
        </IconButton>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 8, gap: 18 }}>
        {active ? (
          <View style={{ gap: 8 }}>
            <Text style={[styles.section, { color: theme.ink3 }]}>{t("wizards.active")}</Text>
            <ActiveRun run={active} wizard={wizards?.find((w) => w.id === active.wizardId)} />
          </View>
        ) : null}
        <View style={{ gap: 12 }}>
          <Text
            accessibilityRole="header"
            accessibilityLabel="engenty wizards"
            style={styles.wordmark}
          >
            <Text style={{ color: theme.ink }}>engenty</Text>
            <Text style={{ color: theme.ember }}>.</Text>
            <Text style={{ color: theme.ink3, fontFamily: FONT.uiMedium }}>
              {t("brand.wizards")}
            </Text>
          </Text>
          {wizards?.length === 0 ? (
            <View style={[styles.empty, { backgroundColor: theme.card }]}>
              <Text style={[styles.rowTitle, { color: theme.ink }]}>{t("wizards.empty")}</Text>
              <Text style={[styles.sub, { color: theme.ink3 }]}>{t("wizards.emptyHint")}</Text>
              <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
                <Button
                  theme={theme}
                  label={t("wizards.add")}
                  onPress={() => router.push("/add")}
                />
              </View>
            </View>
          ) : (
            wizards?.map((w) => <WizardRow key={w.id} wizard={w} running={runningIds.has(w.id)} />)
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  section: {
    fontFamily: FONT.uiMedium,
    fontSize: 13,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginHorizontal: 4,
  },
  active: { gap: 12, padding: 14, borderRadius: 20, borderWidth: 1 },
  activeTitle: { fontFamily: FONT.display, fontSize: 20, lineHeight: 25 },
  step: { fontFamily: FONT.uiMedium, fontSize: 15, lineHeight: 21 },
  sub: { fontFamily: FONT.ui, fontSize: 13, lineHeight: 18 },
  wordmark: { fontFamily: FONT.displayBold, fontSize: 30, letterSpacing: -0.6 },
  row: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 6 },
  rowTitle: { fontFamily: FONT.uiSemi, fontSize: 17, lineHeight: 23 },
  empty: { padding: 16, borderRadius: 16, gap: 4 },
});
