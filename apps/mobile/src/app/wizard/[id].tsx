import { router, useLocalSearchParams } from "expo-router";
import { useEffect } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getWizardById, listResults, openRunOf, saveWizard, useQuery } from "../../data/db";
import { hostLabel, wizardUrl } from "../../data/links";
import { getWizard, RuntimeError } from "../../data/runtime";
import { infoOf } from "../../data/wizards";
import { Engenty } from "../../engenty/Engenty";
import { formatTime, t, useLang } from "../../i18n";
import { FONT, wizardTheme } from "../../theme/theme";
import { shareLink } from "../../ui/open-file";
import { ResultRow } from "../../ui/ResultRow";
import {
  Button,
  Group,
  ICON,
  Icon,
  IconButton,
  Row,
  Screen,
  SectionTitle,
  TopBar,
  text,
} from "../../ui/ui";

/** One wizard: what it is, its results on the phone, and Start at the bottom, in reach. */
export default function WizardScreen() {
  useLang();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const wizardId = Number(id);
  const wizard = useQuery(() => getWizardById(wizardId), [wizardId]);
  const open = useQuery(() => openRunOf(wizardId), [wizardId]);
  const results = useQuery(() => listResults(wizardId), [wizardId]);
  const theme = wizardTheme(wizard?.avatar);

  // What the runtime says now: a new title, that the wizard is closed, or that its link is gone
  // (a new link, or the wizard deleted). Keyed on the address: the saved row is read again after
  // the save, and must not ask again.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runtime and token name the wizard
  useEffect(() => {
    if (!wizard) {
      return;
    }
    getWizard(wizard.runtime, wizard.token)
      .then((w) => saveWizard(wizard.runtime, wizard.token, infoOf(w)))
      .catch((err) => {
        if (err instanceof RuntimeError && err.status === 404) {
          return saveWizard(wizard.runtime, wizard.token, { ...wizard, available: false });
        }
      })
      .catch(() => undefined);
  }, [wizard?.runtime, wizard?.token]);

  if (!wizard) {
    return <Screen theme={theme}>{null}</Screen>;
  }
  const info = (label: string, value: string) => (
    <Row key={label}>
      <Text style={[text.body, { flex: 1, color: theme.ink }]}>{label}</Text>
      <Text style={[text.body, { color: theme.ink3 }]}>{value}</Text>
    </Row>
  );
  return (
    <Screen theme={theme}>
      <TopBar
        theme={theme}
        onBack={() => router.back()}
        right={
          <IconButton
            label={t("result.shareLink")}
            onPress={() => void shareLink(wizardUrl(wizard.runtime, wizard.token), wizard.title)}
          >
            <Icon d={ICON.share} color={theme.ink} size={22} strokeWidth={2.1} />
          </IconButton>
        }
      />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 170, gap: 24 }}>
        <View style={{ alignItems: "center", gap: 4 }}>
          <Engenty kind={wizard.avatar} size={150} />
          <Text style={[styles.title, { color: theme.ink }]}>{wizard.title}</Text>
          {wizard.brand.name ? (
            <Text style={[text.sub, { color: theme.ink3 }]}>
              {t("start.by", { name: wizard.brand.name })}
            </Text>
          ) : null}
          {wizard.description ? (
            <Text style={[text.body, styles.description, { color: theme.ink2 }]}>
              {wizard.description}
            </Text>
          ) : null}
          {wizard.available ? null : (
            <Text style={[text.body, styles.description, { color: theme.ink2 }]}>
              {t("add.unavailable")}
            </Text>
          )}
        </View>
        <Group theme={theme}>
          {[
            info(t("start.runsOn"), hostLabel(wizard.runtime) ?? "engenty.ai"),
            info(t("start.results2"), t("start.onPhone", { n: results?.length ?? 0 })),
          ]}
        </Group>
        {results?.length ? (
          <View style={{ gap: 8 }}>
            <SectionTitle theme={theme}>{t("start.results")}</SectionTitle>
            <Group theme={theme} inset={70}>
              {results.map((run) => (
                <ResultRow key={run.id} run={run} theme={theme} />
              ))}
            </Group>
          </View>
        ) : null}
      </ScrollView>
      {wizard.available ? (
        <View style={[styles.bar, { bottom: Math.max(insets.bottom, 16) }]}>
          {open ? (
            <Button
              theme={theme}
              kind="glass"
              label={t("start.resume", { time: formatTime(open.startedAt) })}
              onPress={() =>
                router.push({
                  pathname: "/run",
                  params: { wizard: String(wizard.id), runId: open.id },
                })
              }
            />
          ) : null}
          <Button
            theme={theme}
            label={open ? t("start.new") : t("start.start")}
            onPress={() =>
              router.push({ pathname: "/run", params: { wizard: String(wizard.id), start: "1" } })
            }
          />
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    fontFamily: FONT.display,
    fontSize: 30,
    lineHeight: 36,
    letterSpacing: -0.6,
    textAlign: "center",
    marginTop: 4,
  },
  description: { textAlign: "center", marginTop: 10, marginHorizontal: 8, lineHeight: 23 },
  bar: { position: "absolute", left: 16, right: 16, gap: 10 },
});
