import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { Run } from "../data/db";
import { Engenty } from "../engenty/Engenty";
import { formatDate, formatTime, t } from "../i18n";
import { APP_THEME, FONT, type Theme } from "../theme/theme";
import { Chip } from "./ui";

const FORMAT_LABEL: Record<string, string> = {
  pdf: "PDF",
  docx: "DOCX",
  xlsx: "XLSX",
  csv: "CSV",
  png: "PNG",
  mp4: "MP4",
  mp3: "MP3",
  zip: "ZIP",
  html: "HTML",
  md: "MD",
  txt: "TXT",
  json: "JSON",
};

const expired = (run: Run) => run.expiresAt !== null && new Date(run.expiresAt) < new Date();

/** A kept result in a list: its wizard's engenty, title, when, the formats. */
export function ResultRow({ run, theme = APP_THEME }: { run: Run; theme?: Theme }) {
  const when = run.finishedAt ?? run.updatedAt;
  const today = new Date(when).toDateString() === new Date().toDateString();
  const formats = [
    ...new Set(run.result?.deliverables.map((d) => d.formats[0]).filter(Boolean) ?? []),
  ];
  const sub = expired(run)
    ? `${formatDate(when)} · ${t("results.expired")}`
    : `${run.wizardTitle} · ${today ? formatTime(when) : formatDate(when)}`;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: "/result/[id]", params: { id: run.id } })}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: theme.card, opacity: pressed ? 0.8 : 1 },
      ]}
    >
      <Engenty kind={run.avatar} size={48} />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text numberOfLines={1} style={[styles.title, { color: theme.ink }]}>
          {run.result?.title ?? run.wizardTitle}
        </Text>
        <Text numberOfLines={1} style={[styles.sub, { color: theme.ink3 }]}>
          {sub}
        </Text>
      </View>
      <View style={{ flexDirection: "row", gap: 4 }}>
        {formats.slice(0, 2).map((f) => (
          <Chip key={f} theme={theme}>
            {FORMAT_LABEL[f] ?? f.toUpperCase()}
          </Chip>
        ))}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    paddingLeft: 10,
    paddingRight: 12,
    borderRadius: 16,
  },
  title: { fontFamily: FONT.uiSemi, fontSize: 16, lineHeight: 22 },
  sub: { fontFamily: FONT.ui, fontSize: 13, lineHeight: 18 },
});
