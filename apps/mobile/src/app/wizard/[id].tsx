import { router, useLocalSearchParams } from "expo-router";
import { useEffect } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { getWizardById, listResults, openRunOf, saveWizard, useQuery } from "../../data/db";
import { hostLabel } from "../../data/links";
import { getWizard } from "../../data/runtime";
import { infoOf } from "../../data/wizards";
import { Engenty } from "../../engenty/Engenty";
import { formatTime, t, useLang } from "../../i18n";
import { FONT, wizardTheme } from "../../theme/theme";
import { ResultRow } from "../../ui/ResultRow";
import { Button, goBack, ICON, Label, Screen, SectionTitle, TopBar } from "../../ui/ui";

export default function WizardScreen() {
  useLang();
  const { id } = useLocalSearchParams<{ id: string }>();
  const wizardId = Number(id);
  const wizard = useQuery(() => getWizardById(wizardId), [wizardId]);
  const open = useQuery(() => openRunOf(wizardId), [wizardId]);
  const results = useQuery(() => listResults(wizardId), [wizardId]);
  const theme = wizardTheme(wizard?.avatar);

  // What the runtime says now: a new title, or that the wizard is closed. Keyed on the address:
  // the saved row is read again after the save, and must not ask again.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runtime and token name the wizard
  useEffect(() => {
    if (!wizard) {
      return;
    }
    getWizard(wizard.runtime, wizard.token)
      .then((w) => saveWizard(wizard.runtime, wizard.token, infoOf(w)))
      .catch(() => undefined);
  }, [wizard?.runtime, wizard?.token]);

  if (!wizard) {
    return <Screen theme={theme}>{null}</Screen>;
  }
  const host = hostLabel(wizard.runtime);
  return (
    <Screen theme={theme}>
      <TopBar theme={theme} onBack={goBack} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 40, gap: 28 }}>
        <View style={{ alignItems: "center", gap: 10 }}>
          <Engenty kind={wizard.avatar} size={180} />
          <Text style={[styles.title, { color: theme.ink }]}>{wizard.title}</Text>
          {wizard.brand.name || host ? (
            <Label theme={theme}>
              {[wizard.brand.name ? t("start.by", { name: wizard.brand.name }) : null, host]
                .filter(Boolean)
                .join(" · ")}
            </Label>
          ) : null}
          {wizard.description ? (
            <Text style={[styles.description, { color: theme.ink2 }]}>{wizard.description}</Text>
          ) : null}
          {wizard.available ? (
            <View style={{ alignSelf: "stretch", gap: 10, marginTop: 18 }}>
              <Button
                theme={theme}
                label={t("start.start")}
                icon={ICON.arrow}
                onPress={() =>
                  router.push({
                    pathname: "/run",
                    params: { wizard: String(wizard.id), start: "1" },
                  })
                }
              />
              {open ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() =>
                    router.push({
                      pathname: "/run",
                      params: { wizard: String(wizard.id), runId: open.id },
                    })
                  }
                  style={{ alignItems: "center", paddingVertical: 12 }}
                >
                  <Text style={{ color: theme.ink2, fontFamily: FONT.uiMedium, fontSize: 15 }}>
                    {t("start.resume", { time: formatTime(open.startedAt) })}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : (
            <Text style={[styles.description, { color: theme.ink2, marginTop: 18 }]}>
              {t("add.unavailable")}
            </Text>
          )}
        </View>
        <View style={{ gap: 8 }}>
          <SectionTitle theme={theme}>{t("start.results")}</SectionTitle>
          {results?.length ? (
            results.map((run) => <ResultRow key={run.id} run={run} theme={theme} />)
          ) : (
            <Label theme={theme} style={{ marginHorizontal: 4 }}>
              {t("start.noResults")}
            </Label>
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: FONT.display, fontSize: 30, lineHeight: 34, textAlign: "center" },
  description: { fontFamily: FONT.ui, fontSize: 16, lineHeight: 23, textAlign: "center" },
});
