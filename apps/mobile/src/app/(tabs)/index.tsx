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
import {
  Button,
  Chevron,
  Group,
  ICON,
  Icon,
  IconButton,
  Row,
  Screen,
  SectionTitle,
  TAB_SPACE,
  text,
} from "../../ui/ui";

function Progress({ run, theme }: { run: Run; theme: Theme }) {
  const total = Math.max(run.progress.total, 1);
  return (
    <View style={{ flexDirection: "row", gap: 4 }}>
      {Array.from({ length: total }, (_, i) => (
        <View
          key={i}
          style={{
            flex: 1,
            height: 4,
            borderRadius: 2,
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
      style={({ pressed }) => [
        styles.active,
        { backgroundColor: theme.stage, borderColor: theme.line, opacity: pressed ? 0.9 : 1 },
      ]}
    >
      <View style={{ flexDirection: "row", gap: 14, alignItems: "center" }}>
        <Engenty kind={run.avatar} size={58} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text numberOfLines={2} style={[styles.activeTitle, { color: theme.ink }]}>
            {run.wizardTitle}
          </Text>
          <Text style={[text.sub, { color: theme.ink3 }]}>
            {[brand, t("active.started", { time: formatTime(run.startedAt) })]
              .filter(Boolean)
              .join(" · ")}
          </Text>
        </View>
      </View>
      {run.progress.total ? (
        <Text style={[text.sub, { color: theme.ink, fontWeight: "600" }]}>
          {t("active.step", {
            done: Math.min(run.progress.done + 1, run.progress.total),
            total: run.progress.total,
          })}
          {run.stepTitle ? ` · ${run.stepTitle}` : ""}
        </Text>
      ) : null}
      {run.status === "running" ? (
        <Text style={[text.sub, { color: theme.ink2 }]}>{t("wizards.running")}</Text>
      ) : null}
      {run.progress.total ? <Progress run={run} theme={theme} /> : null}
      <Button theme={theme} label={t("active.continue")} onPress={open} />
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
    <Row
      height={70}
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
    >
      <Engenty kind={wizard.avatar} size={46} />
      <View style={{ flex: 1, gap: 1 }}>
        <Text numberOfLines={1} style={[text.bodySemi, { color: theme.ink }]}>
          {wizard.title}
        </Text>
        {sub ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            {running ? <View style={[styles.dot, { backgroundColor: theme.ember }]} /> : null}
            <Text
              numberOfLines={1}
              style={[text.sub, { flex: 1, color: running ? theme.ember : theme.ink3 }]}
            >
              {sub}
            </Text>
          </View>
        ) : null}
      </View>
      <Chevron theme={theme} />
    </Row>
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
      <View style={[styles.header, { paddingTop: insets.top + 4 }]}>
        {/* The engenty is the menu. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("settings.title")}
          onPress={() => router.push("/settings")}
          hitSlop={8}
        >
          <Engenty kind="drop" size={40} />
        </Pressable>
        <IconButton label={t("wizards.add")} onPress={() => router.push("/add")}>
          <Icon d={ICON.plus} color={theme.ink} strokeWidth={2.4} />
        </IconButton>
      </View>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: TAB_SPACE, gap: 22 }}
      >
        <Text
          accessibilityRole="header"
          accessibilityLabel="engenty wizards"
          style={styles.wordmark}
        >
          <Text style={{ color: theme.ink }}>engenty</Text>
          <Text style={{ color: theme.ember }}>.</Text>
          <Text style={{ color: theme.ink3, fontFamily: FONT.displayMedium }}>
            {t("brand.wizards")}
          </Text>
        </Text>
        {active ? (
          <View style={{ gap: 8 }}>
            <SectionTitle theme={theme}>{t("wizards.active")}</SectionTitle>
            <ActiveRun run={active} wizard={wizards?.find((w) => w.id === active.wizardId)} />
          </View>
        ) : null}
        {wizards?.length === 0 ? (
          <View style={[styles.empty, { backgroundColor: theme.card }]}>
            <Text style={[text.bodySemi, { color: theme.ink }]}>{t("wizards.empty")}</Text>
            <Text style={[text.sub, { color: theme.ink3 }]}>{t("wizards.emptyHint")}</Text>
            <Button
              theme={theme}
              label={t("wizards.add")}
              onPress={() => router.push("/add")}
              style={{ marginTop: 12, alignSelf: "flex-start" }}
            />
          </View>
        ) : wizards ? (
          <View style={{ gap: 8 }}>
            <SectionTitle theme={theme}>{t("wizards.yours")}</SectionTitle>
            <Group theme={theme} inset={76}>
              {wizards.map((w) => (
                <WizardRow key={w.id} wizard={w} running={runningIds.has(w.id)} />
              ))}
            </Group>
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 16,
    paddingBottom: 4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  active: { gap: 14, padding: 16, borderRadius: 26, borderWidth: StyleSheet.hairlineWidth },
  activeTitle: { fontFamily: FONT.display, fontSize: 21, lineHeight: 26 },
  wordmark: {
    marginHorizontal: 4,
    marginTop: 4,
    fontFamily: FONT.displayBold,
    fontSize: 34,
    lineHeight: 40,
    letterSpacing: -0.8,
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
  empty: { padding: 18, borderRadius: 26, gap: 4 },
});
