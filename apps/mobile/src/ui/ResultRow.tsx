import { router } from "expo-router";
import * as Sharing from "expo-sharing";
import { Pressable, StyleSheet, Text, View } from "react-native";
import ReanimatedSwipeable from "react-native-gesture-handler/ReanimatedSwipeable";
import { deleteRun, type Run } from "../data/db";
import { deleteFiles, keptFile } from "../data/results";
import { Engenty } from "../engenty/Engenty";
import { formatDate, formatTime, t } from "../i18n";
import { APP_THEME, type Theme } from "../theme/theme";
import { shareLink } from "./open-file";
import { Chevron, ICON, Icon, Row, text } from "./ui";

const FORMAT_LABEL: Record<string, string> = {
  pdf: "PDF",
  docx: "Word",
  xlsx: "Excel",
  csv: "CSV",
  png: "PNG",
  mp4: "MP4",
  mp3: "MP3",
  zip: "ZIP",
  html: "HTML",
  md: "Text",
  txt: "Text",
  json: "JSON",
};

const expired = (run: Run) => run.expiresAt !== null && new Date(run.expiresAt) < new Date();

/** Share from the list: the kept file when there is one, else the result's link. */
function shareResult(run: Run) {
  const name = run.result?.deliverables.flatMap((d) => Object.values(d.files))[0];
  if (name) {
    void Sharing.shareAsync(keptFile(run.id, name).uri, { dialogTitle: run.result?.title });
  } else if (run.shareUrl) {
    void shareLink(run.shareUrl, run.result?.title);
  } else {
    router.push({ pathname: "/result/[id]", params: { id: run.id } });
  }
}

function Actions({ run, close }: { run: Run; close: () => void }) {
  const action = (label: string, color: string, onPress: () => void, icon?: string[]) => (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        close();
        onPress();
      }}
      style={[styles.action, { backgroundColor: color }]}
    >
      {icon ? <Icon d={icon} size={16} color="#fff" strokeWidth={2.2} /> : null}
      <Text style={styles.actionText}>{label}</Text>
    </Pressable>
  );
  return (
    <View style={styles.actions}>
      {action(t("results.share"), "#3a7bf6", () => shareResult(run), ICON.share)}
      {action(t("common.delete"), "#e5484d", () => {
        deleteFiles(run.id);
        void deleteRun(run.id);
      })}
    </View>
  );
}

/** A kept result in a group: its wizard's engenty, title, when, the format; swipe to share or delete. */
export function ResultRow({ run, theme = APP_THEME }: { run: Run; theme?: Theme }) {
  const when = run.finishedAt ?? run.updatedAt;
  const today = new Date(when).toDateString() === new Date().toDateString();
  const first = run.result?.deliverables.map((d) => d.formats[0]).find(Boolean);
  const sub = expired(run)
    ? `${formatDate(when)} · ${t("results.expired")}`
    : `${run.wizardTitle} · ${today ? formatTime(when) : formatDate(when)}`;
  return (
    <ReanimatedSwipeable
      friction={1.6}
      rightThreshold={40}
      overshootRight={false}
      containerStyle={{ backgroundColor: theme.card }}
      renderRightActions={(_p, _t, methods) => <Actions run={run} close={() => methods.close()} />}
    >
      <Row
        height={66}
        style={{ backgroundColor: theme.card }}
        onPress={() => router.push({ pathname: "/result/[id]", params: { id: run.id } })}
      >
        <Engenty kind={run.avatar} size={40} />
        <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
          <Text numberOfLines={1} style={[text.bodySemi, { color: theme.ink }]}>
            {run.result?.title ?? run.wizardTitle}
          </Text>
          <Text numberOfLines={1} style={[text.sub, { color: theme.ink3 }]}>
            {sub}
          </Text>
        </View>
        {first ? (
          <Text style={[text.sub, { color: theme.ink4 }]}>{FORMAT_LABEL[first] ?? first}</Text>
        ) : null}
        <Chevron theme={theme} />
      </Row>
    </ReanimatedSwipeable>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 10 },
  action: {
    height: 46,
    borderRadius: 23,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  actionText: { color: "#fff", fontSize: 15, fontWeight: "600" },
});
