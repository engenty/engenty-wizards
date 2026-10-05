import { router, useLocalSearchParams } from "expo-router";
import * as Sharing from "expo-sharing";
import { useState } from "react";
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  deleteRun,
  getRunById,
  type KeptDeliverable,
  type Run,
  updateRun,
  useQuery,
} from "../../data/db";
import { deleteFiles, fetchFormat, keptFile } from "../../data/results";
import { shareRun } from "../../data/runtime";
import { Engenty } from "../../engenty/Engenty";
import { formatDate, t, useLang } from "../../i18n";
import { FONT, type Theme, wizardTheme } from "../../theme/theme";
import { openKept, shareLink } from "../../ui/open-file";
import { Button, Chip, goBack, ICON, Icon, IconButton, Label, Screen, TopBar } from "../../ui/ui";

const onServer = (run: Run) => run.expiresAt === null || new Date(run.expiresAt) > new Date();

function Deliverable({ run, d, theme }: { run: Run; d: KeptDeliverable; theme: Theme }) {
  const [busy, setBusy] = useState<string | null>(null);
  const open = async (format: string) => {
    const name = d.files[format];
    if (name) {
      await openKept(run.id, keptFile(run.id, name));
      return;
    }
    setBusy(format);
    try {
      const file = await fetchFormat(run, d.stepId, format);
      await openKept(run.id, file);
    } catch {
      Alert.alert(t("common.offline"));
    } finally {
      setBusy(null);
    }
  };
  const server = onServer(run);
  const first = d.formats[0];
  return (
    <View style={[styles.card, { backgroundColor: theme.card }]}>
      <Pressable
        accessibilityRole="button"
        disabled={!first || (!d.files[first] && !server)}
        onPress={() => first && void open(first)}
        style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
      >
        <View style={[styles.fileIcon, { backgroundColor: theme.paper3 }]}>
          <Icon d={ICON.file} color={theme.ink} size={22} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[styles.cardTitle, { color: theme.ink }]}>{d.label}</Text>
          {first && !d.files[first] ? <Label theme={theme}>{t("result.notKept")}</Label> : null}
        </View>
        {first ? <Icon d={ICON.next} size={18} color={theme.ink3} /> : null}
      </Pressable>
      {d.text && !first ? (
        <Text
          numberOfLines={12}
          style={{ color: theme.ink2, fontFamily: FONT.ui, fontSize: 15, lineHeight: 22 }}
        >
          {d.text}
        </Text>
      ) : null}
      {d.assets
        .filter((a) => a.file)
        .map((a) => (
          <View key={a.id}>
            <Image
              source={{ uri: keptFile(run.id, a.file as string).uri }}
              style={{ width: "100%", aspectRatio: 4 / 3, borderRadius: 10 }}
              resizeMode="cover"
              accessibilityLabel={a.name}
            />
            {/* Media a model made or changed keep their label wherever they are shown. */}
            {a.ai ? (
              <View style={[styles.ai, { backgroundColor: "rgba(0,0,0,0.6)" }]}>
                <Text style={{ color: "#fff", fontFamily: FONT.uiSemi, fontSize: 11 }}>
                  {t("result.ai")}
                </Text>
              </View>
            ) : null}
          </View>
        ))}
      {d.formats.length > 1 ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {d.formats.map((f) => (
            <Pressable
              key={f}
              accessibilityRole="button"
              disabled={busy !== null || (!d.files[f] && !server)}
              onPress={() => void open(f)}
              style={{ opacity: !d.files[f] && !server ? 0.4 : 1 }}
            >
              <Chip theme={theme}>{busy === f ? "…" : f.toUpperCase()}</Chip>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** A kept result: shown, shared and saved from the phone's copy, with or without a connection. */
export default function ResultScreen() {
  useLang();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const run = useQuery(() => getRunById(id), [id]);
  const theme = wizardTheme(run?.avatar);
  const [sharing, setSharing] = useState(false);
  if (!run?.result) {
    return (
      <Screen theme={theme}>
        <TopBar theme={theme} onBack={goBack} />
      </Screen>
    );
  }
  const result = run.result;
  const server = onServer(run);
  const files = result.deliverables.flatMap((d) =>
    Object.values(d.files).map((name) => ({ label: d.label, name })),
  );

  const onShareLink = async () => {
    setSharing(true);
    try {
      const shared = run.shareUrl ? { url: run.shareUrl } : await shareRun(run.runtime, run.id);
      if (!run.shareUrl) {
        await updateRun(run.id, { shareUrl: shared.url });
      }
      await shareLink(shared.url, result.title);
    } catch {
      Alert.alert(t("common.offline"));
    } finally {
      setSharing(false);
    }
  };

  const shareFiles = () => {
    const share = (name: string) =>
      void Sharing.shareAsync(keptFile(run.id, name).uri, { dialogTitle: result.title });
    if (files.length === 1) {
      share(files[0].name);
      return;
    }
    Alert.alert(t("result.shareFiles"), undefined, [
      ...files.slice(0, 4).map((f) => ({ text: f.label, onPress: () => share(f.name) })),
      { text: t("common.cancel"), style: "cancel" as const },
    ]);
  };

  return (
    <Screen theme={theme}>
      <TopBar
        theme={theme}
        onBack={goBack}
        right={
          <IconButton
            label={t("result.delete")}
            onPress={() =>
              Alert.alert(t("result.delete"), t("result.deleteAsk"), [
                { text: t("common.cancel"), style: "cancel" },
                {
                  text: t("common.delete"),
                  style: "destructive",
                  onPress: async () => {
                    deleteFiles(run.id);
                    await deleteRun(run.id);
                    goBack();
                  },
                },
              ])
            }
          >
            <Icon d={ICON.trash} color={theme.ink3} size={20} />
          </IconButton>
        }
      />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24, gap: 14 }}>
        <View style={{ alignItems: "center", gap: 8, paddingBottom: 8 }}>
          <Engenty kind={run.avatar} size={96} />
          <Text style={[styles.title, { color: theme.ink }]}>{result.title}</Text>
          <Label theme={theme}>{run.wizardTitle}</Label>
          {result.message ? (
            <Text style={[styles.message, { color: theme.ink2 }]}>{result.message}</Text>
          ) : null}
        </View>
        {result.deliverables.map((d) => (
          <Deliverable key={d.stepId} run={run} d={d} theme={theme} />
        ))}
        <Label theme={theme} style={{ textAlign: "center" }}>
          {t("result.kept")} ·{" "}
          {server
            ? run.expiresAt
              ? t("result.linkUntil", { date: formatDate(run.expiresAt) })
              : ""
            : t("result.linkGone")}
        </Label>
        {server ? (
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              router.push({
                pathname: "/run",
                params: { wizard: String(run.wizardId ?? ""), runId: run.id },
              })
            }
            disabled={run.wizardId === null}
            style={{ alignItems: "center", padding: 8 }}
          >
            {run.wizardId !== null ? (
              <Text style={{ color: theme.ink2, fontFamily: FONT.uiMedium, fontSize: 15 }}>
                {t("result.openRun")}
              </Text>
            ) : null}
          </Pressable>
        ) : null}
      </ScrollView>
      <View
        style={[
          styles.bar,
          {
            paddingBottom: Math.max(insets.bottom, 12),
            borderTopColor: theme.card,
            backgroundColor: theme.stage,
          },
        ]}
      >
        {server ? (
          <Button
            theme={theme}
            kind="secondary"
            label={t("result.shareLink")}
            icon={ICON.link}
            busy={sharing}
            onPress={() => void onShareLink()}
            style={{ flex: 1 }}
          />
        ) : null}
        {files.length ? (
          <Button
            theme={theme}
            label={t("result.shareFiles")}
            icon={ICON.share}
            onPress={shareFiles}
            style={{ flex: 1 }}
          />
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: FONT.display, fontSize: 26, lineHeight: 31, textAlign: "center" },
  message: { fontFamily: FONT.ui, fontSize: 16, lineHeight: 23, textAlign: "center" },
  card: { padding: 14, borderRadius: 18, gap: 12 },
  cardTitle: { fontFamily: FONT.uiSemi, fontSize: 16, lineHeight: 22 },
  fileIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  ai: {
    position: "absolute",
    top: 8,
    left: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  bar: { flexDirection: "row", gap: 10, paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1 },
});
