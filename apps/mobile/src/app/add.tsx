import * as Clipboard from "expo-clipboard";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useQuery } from "../data/db";
import { normalizeCode, parseInput } from "../data/links";
import { FindFailed, type Found, findWizard, idRuntime } from "../data/wizards";
import { t, useLang } from "../i18n";
import { APP_THEME, FONT } from "../theme/theme";
import { AddSwitch, FoundCard } from "../ui/AddParts";
import { Glass, ICON, Icon, IconButton, text } from "../ui/ui";

const ERROR_TEXT = {
  invalid: "add.invalid",
  notFound: "add.notFound",
  tooMany: "add.tooMany",
  offline: "common.offline",
} as const;

const LENGTH = 8;
const ALLOWED = /[^2-9A-HJ-NP-Z]/g;

/** Eight boxes over one hidden field, like a one-time code: four, a dash, four. */
function CodeBoxes({
  value,
  onChange,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  autoFocus: boolean;
}) {
  const theme = APP_THEME;
  const input = useRef<TextInput>(null);
  const [focused, setFocused] = useState(autoFocus);
  const boxes = Array.from({ length: LENGTH }, (_, i) => {
    const current = focused && i === Math.min(value.length, LENGTH - 1);
    return (
      <View
        key={i}
        style={[
          styles.box,
          { borderColor: current ? theme.ember : "rgba(255,255,255,0.18)" },
          current ? { borderWidth: 2 } : null,
        ]}
      >
        <Text style={[styles.boxChar, { color: theme.ink }]}>{value[i] ?? ""}</Text>
      </View>
    );
  });
  return (
    <Pressable onPress={() => input.current?.focus()} accessibilityLabel={t("add.idLabel")}>
      <View style={styles.boxes}>
        {boxes.slice(0, 4)}
        <View style={[styles.dash, { backgroundColor: theme.ink4 }]} />
        {boxes.slice(4)}
      </View>
      <TextInput
        ref={input}
        value={value}
        onChangeText={(v) => {
          // A link pasted into the boxes is taken as a link.
          if (/[/.:]/.test(v)) {
            onChange(v);
            return;
          }
          onChange(normalizeCode(v).replace(ALLOWED, "").slice(0, LENGTH));
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        autoFocus={autoFocus}
        autoCapitalize="characters"
        autoCorrect={false}
        autoComplete="off"
        textContentType="oneTimeCode"
        keyboardAppearance="dark"
        returnKeyType="search"
        caretHidden
        style={styles.hidden}
      />
    </Pressable>
  );
}

/** Add a wizard: a sheet with the ID field first; the scanner is the switch beside it. */
export default function AddScreen() {
  useLang();
  const theme = APP_THEME;
  const params = useLocalSearchParams<{ input?: string }>();
  const [code, setCode] = useState("");
  const [link, setLink] = useState<string | null>(params.input ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [found, setFound] = useState<Found | null>(null);
  const runtime = useQuery(idRuntime);

  const find = async (input: string) => {
    setBusy(true);
    setError(null);
    setFound(null);
    try {
      setFound(await findWizard(input));
    } catch (err) {
      setError(t(ERROR_TEXT[err instanceof FindFailed ? err.reason : "offline"]));
    } finally {
      setBusy(false);
    }
  };

  const take = (v: string) => {
    if (parseInput(v)?.kind === "wizard" || /[/.:]/.test(v)) {
      setLink(v);
      setCode("");
      void find(v);
      return;
    }
    setLink(null);
    setCode(v);
    setError(null);
    setFound(null);
    if (v.length === LENGTH) {
      void find(v);
    }
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: once, for a link the app was opened with
  useEffect(() => {
    if (params.input) {
      void find(params.input);
    }
  }, []);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.deep }}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40, gap: 20 }}
    >
      {/* In a form sheet the header scrolls with the content: a separate bar lays under it. */}
      <View style={styles.top}>
        <IconButton label={t("scan.close")} onPress={() => router.back()}>
          <Icon d={ICON.close} color={theme.ink} strokeWidth={2.4} />
        </IconButton>
        <Text style={[styles.title, { color: theme.ink }]}>{t("add.title")}</Text>
        <View style={{ width: 44 }} />
      </View>
      <View style={{ alignItems: "center" }}>
        <AddSwitch active="id" />
      </View>
      <View style={{ alignItems: "center", gap: 4, marginTop: 4 }}>
        <Text style={[styles.heading, { color: theme.ink }]}>{t("add.heading")}</Text>
        <Text style={[text.sub, { color: theme.ink3, textAlign: "center" }]}>
          {t("add.idHint")}
        </Text>
      </View>
      {link ? (
        <Glass style={styles.link}>
          <Icon d={ICON.link} size={18} color={theme.ink3} />
          <Text numberOfLines={1} style={[text.sub, { flex: 1, color: theme.ink }]}>
            {link}
          </Text>
          <Pressable onPress={() => take("")} hitSlop={8} accessibilityLabel={t("common.cancel")}>
            <Icon d={ICON.close} size={16} color={theme.ink3} />
          </Pressable>
        </Glass>
      ) : (
        <CodeBoxes value={code} onChange={take} autoFocus={!params.input} />
      )}
      {busy ? <ActivityIndicator color={theme.ink3} /> : null}
      {error ? (
        <Text style={[text.sub, { color: theme.rose, textAlign: "center" }]}>{error}</Text>
      ) : null}
      {found ? <FoundCard found={found} /> : null}
      <View style={styles.foot}>
        <Text style={[text.sub, { color: theme.ink3 }]}>
          {runtime ? t("add.askedAt", { host: new URL(runtime).host }) : ""}
        </Text>
        <Pressable
          accessibilityRole="button"
          hitSlop={8}
          onPress={async () => {
            const pasted = await Clipboard.getStringAsync();
            if (pasted) {
              take(pasted.trim());
            }
          }}
        >
          <Text style={[text.sub, { color: theme.ember, fontWeight: "600" }]}>
            {t("add.paste")}
          </Text>
        </Pressable>
      </View>
      {/* The scanner, one tap away in the room below the ID — not only in the switch above. */}
      {found ? null : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("add.scan")}
          onPress={() => router.replace("/scan")}
          style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1 }]}
        >
          <Glass interactive tint="rgba(255,255,255,0.05)" style={styles.scanTile}>
            <Icon d={ICON.scan} size={44} color={theme.ink} strokeWidth={1.7} />
            <Text style={[styles.scanTitle, { color: theme.ink }]}>{t("add.scan")}</Text>
            <Text style={[text.sub, { color: theme.ink3, textAlign: "center" }]}>
              {t("add.scanHint")}
            </Text>
          </Glass>
        </Pressable>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  top: { paddingTop: 14, flexDirection: "row", alignItems: "center" },
  scanTile: {
    marginTop: 8,
    minHeight: 180,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    padding: 20,
  },
  scanTitle: { fontSize: 17, fontWeight: "600", marginTop: 6 },
  title: { flex: 1, textAlign: "center", fontSize: 17, fontWeight: "600" },
  heading: { fontSize: 22, lineHeight: 28, fontWeight: "700" },
  boxes: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 5 },
  box: {
    width: 38,
    height: 52,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(255,255,255,0.09)",
    alignItems: "center",
    justifyContent: "center",
  },
  boxChar: { fontFamily: FONT.mono, fontSize: 24, fontWeight: "600" },
  dash: { width: 10, height: 3, borderRadius: 2 },
  hidden: { position: "absolute", width: 1, height: 1, opacity: 0 },
  link: {
    height: 48,
    borderRadius: 24,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  foot: { flexDirection: "row", justifyContent: "space-between", marginHorizontal: 4 },
});
