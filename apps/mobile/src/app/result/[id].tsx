import { router, useLocalSearchParams } from "expo-router";
import * as Sharing from "expo-sharing";
import { useState } from "react";
import {
  ActionSheetIOS,
  Alert,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
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
import { formatBytes, formatDate, t, useLang } from "../../i18n";
import { type Theme, wizardTheme } from "../../theme/theme";
import { openKept, shareLink } from "../../ui/open-file";
import {
  Button,
  Footer,
  Group,
  ICON,
  Icon,
  IconButton,
  Row,
  Screen,
  TopBar,
  text,
} from "../../ui/ui";

const onServer = (run: Run) => run.expiresAt === null || new Date(run.expiresAt) > new Date();

const TILE: Record<string, { label: string; color: string }> = {
  pdf: { label: "PDF", color: "#d93a2b" },
  docx: { label: "DOC", color: "#2b5fd9" },
  xlsx: { label: "XLS", color: "#1e7b45" },
  csv: { label: "CSV", color: "#1e7b45" },
  zip: { label: "ZIP", color: "#6b6f7a" },
  png: { label: "PNG", color: "#8a3bd1" },
  mp4: { label: "MP4", color: "#c2410c" },
  mp3: { label: "MP3", color: "#c2410c" },
  html: { label: "HTML", color: "#0e7490" },
  md: { label: "TXT", color: "#6b6f7a" },
  txt: { label: "TXT", color: "#6b6f7a" },
  json: { label: "JSON", color: "#6b6f7a" },
};

/** A file as the Files app shows it: a page with its type on a coloured label. */
function FileTile({ format }: { format: string }) {
  const tile = TILE[format] ?? { label: format.toUpperCase(), color: "#6b6f7a" };
  return (
    <View style={styles.tile}>
      <View style={styles.fold} />
      <Text style={[styles.tileLabel, { backgroundColor: tile.color }]}>{tile.label}</Text>
    </View>
  );
}

function sizeOf(run: Run, name: string | undefined): string | null {
  if (!name) {
    return null;
  }
  const file = keptFile(run.id, name);
  return file.exists ? formatBytes(file.size ?? 0) : null;
}

function FileRow({ run, d, theme }: { run: Run; d: KeptDeliverable; theme: Theme }) {
  const [busy, setBusy] = useState(false);
  const first = d.formats[0];
  const name = first ? d.files[first] : undefined;
  const server = onServer(run);
  const get = async (format: string) => {
    const kept = d.files[format];
    if (kept) {
      return keptFile(run.id, kept);
    }
    setBusy(true);
    try {
      return await fetchFormat(run, d.stepId, format);
    } finally {
      setBusy(false);
    }
  };
  const open = async (format: string) => {
    try {
      await openKept(run.id, await get(format));
    } catch {
      Alert.alert(t("common.offline"));
    }
  };
  // Other formats: a native menu, the ones not on the phone fetched while the server has the run.
  const formats = () => {
    const choices = d.formats.filter((f) => d.files[f] || server);
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: [...choices.map((f) => TILE[f]?.label ?? f), t("common.cancel")],
          cancelButtonIndex: choices.length,
        },
        (i) => i < choices.length && void open(choices[i]),
      );
    } else {
      Alert.alert(d.label, undefined, [
        ...choices.map((f) => ({ text: TILE[f]?.label ?? f, onPress: () => void open(f) })),
        { text: t("common.cancel"), style: "cancel" as const },
      ]);
    }
  };
  if (!first) {
    return d.text ? (
      <Row>
        <Text numberOfLines={8} style={[text.sub, { color: theme.ink2, paddingVertical: 12 }]}>
          {d.text}
        </Text>
      </Row>
    ) : null;
  }
  const size = sizeOf(run, name);
  return (
    <Row
      height={72}
      onPress={() => void open(first)}
      onLongPress={d.formats.length > 1 ? formats : undefined}
    >
      <FileTile format={first} />
      <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
        <Text numberOfLines={1} style={[text.bodySemi, { color: theme.ink }]}>
          {name ?? d.label}
        </Text>
        <Text numberOfLines={1} style={[text.sub, { color: theme.ink3 }]}>
          {[name ? d.label : null, size ?? (name ? null : t("result.notKept"))]
            .filter(Boolean)
            .join(" · ")}
          {d.formats.length > 1 ? ` · ${d.formats.map((f) => TILE[f]?.label ?? f).join(", ")}` : ""}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("result.shareFiles")}
        disabled={busy || (!name && !server)}
        onPress={async () => {
          try {
            const file = await get(first);
            await Sharing.shareAsync(file.uri, { dialogTitle: d.label });
          } catch {
            Alert.alert(t("common.offline"));
          }
        }}
        style={[styles.share, { backgroundColor: theme.paper3 }]}
      >
        <Icon d={ICON.share} size={18} color={theme.ink} strokeWidth={2.1} />
      </Pressable>
    </Row>
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
        <TopBar theme={theme} onBack={() => router.back()} />
      </Screen>
    );
  }
  const result = run.result;
  const server = onServer(run);
  const files = result.deliverables.flatMap((d) =>
    Object.values(d.files).map((name) => ({ label: d.label, name })),
  );
  const image = result.deliverables
    .flatMap((d) => d.assets)
    .find((a) => a.file && a.mime.startsWith("image/"));

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

  const more = () =>
    Alert.alert(result.title, undefined, [
      ...(server && run.wizardId !== null
        ? [
            {
              text: t("result.openRun"),
              onPress: () =>
                router.push({
                  pathname: "/run",
                  params: { wizard: String(run.wizardId), runId: run.id },
                }),
            },
          ]
        : []),
      {
        text: t("result.delete"),
        style: "destructive" as const,
        onPress: async () => {
          deleteFiles(run.id);
          await deleteRun(run.id);
          router.back();
        },
      },
      { text: t("common.cancel"), style: "cancel" as const },
    ]);

  return (
    <Screen theme={theme}>
      <TopBar
        theme={theme}
        onBack={() => router.back()}
        right={
          <IconButton label={t("result.delete")} onPress={more}>
            <Icon d={ICON.more} color={theme.ink} strokeWidth={3.2} />
          </IconButton>
        }
      />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 140 }}>
        <View style={{ alignItems: "center" }}>
          {image?.file ? (
            <Image
              source={{ uri: keptFile(run.id, image.file).uri }}
              style={styles.preview}
              resizeMode="cover"
              accessibilityLabel={image.name}
            />
          ) : files.length ? (
            <View style={[styles.preview, styles.page]}>
              <Text style={styles.pageTitle} numberOfLines={2}>
                {result.title}
              </Text>
              {[100, 92, 100, 70, 100, 85, 100, 60].map((w, i) => (
                <View key={i} style={[styles.line, { width: `${w}%` }]} />
              ))}
            </View>
          ) : (
            <Engenty kind={run.avatar} size={110} />
          )}
        </View>
        <Text style={[text.title, { color: theme.ink, textAlign: "center", marginTop: 22 }]}>
          {result.title}
        </Text>
        <Text style={[text.sub, { color: theme.ink3, textAlign: "center", marginTop: 2 }]}>
          {run.wizardTitle} · {formatDate(run.finishedAt ?? run.updatedAt)}
        </Text>
        {result.message ? (
          <Text style={[text.body, { color: theme.ink2, textAlign: "center", marginTop: 12 }]}>
            {result.message}
          </Text>
        ) : null}
        {result.deliverables.length ? (
          <Group theme={theme} inset={70} style={{ marginTop: 22 }}>
            {result.deliverables.map((d) => (
              <FileRow key={d.stepId} run={run} d={d} theme={theme} />
            ))}
          </Group>
        ) : null}
        <Footer theme={theme}>
          {!server
            ? t("result.keptGone")
            : run.expiresAt
              ? t("result.keptUntil", { date: formatDate(run.expiresAt) })
              : t("result.keptOnly")}
        </Footer>
      </ScrollView>
      <View style={[styles.bar, { bottom: Math.max(insets.bottom, 16) }]}>
        {server ? (
          <Button
            theme={theme}
            kind="glass"
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
            style={{ flex: 1.15 }}
          />
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  preview: {
    width: 150,
    height: 196,
    borderRadius: 6,
    marginTop: 6,
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 14 },
  },
  page: { backgroundColor: "#fbfbf8", padding: 14, gap: 7 },
  pageTitle: { fontSize: 10, fontWeight: "700", color: "#222", marginBottom: 4 },
  line: { height: 4, borderRadius: 2, backgroundColor: "#dddddd" },
  tile: {
    width: 38,
    height: 48,
    borderRadius: 6,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "flex-end",
    paddingBottom: 6,
    overflow: "hidden",
  },
  fold: {
    position: "absolute",
    right: 0,
    top: 0,
    width: 10,
    height: 10,
    backgroundColor: "#d9d9d9",
    borderBottomLeftRadius: 3,
  },
  tileLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: "#fff",
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
    overflow: "hidden",
  },
  share: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  bar: { position: "absolute", left: 16, right: 16, flexDirection: "row", gap: 10 },
});
