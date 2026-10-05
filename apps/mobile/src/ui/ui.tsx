import { router } from "expo-router";
import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  type StyleProp,
  StyleSheet,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { FONT, type Theme } from "../theme/theme";

/** Lucide's strokes, the icons the web uses: 24 × 24, stroke 2, round caps. */
export function Icon({
  d,
  size = 24,
  color,
  strokeWidth = 2,
}: {
  d: string | string[];
  size?: number;
  color: string;
  strokeWidth?: number;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {(Array.isArray(d) ? d : [d]).map((path) => (
        <Path
          key={path}
          d={path}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </Svg>
  );
}

export const ICON = {
  back: "m15 18-6-6 6-6",
  next: "m9 18 6-6-6-6",
  close: ["M18 6 6 18", "m6 6 12 12"],
  plus: ["M5 12h14", "M12 5v14"],
  arrow: ["M5 12h14", "m12 5 7 7-7 7"],
  grid: [
    "M4.5 3h4A1.5 1.5 0 0 1 10 4.5v4A1.5 1.5 0 0 1 8.5 10h-4A1.5 1.5 0 0 1 3 8.5v-4A1.5 1.5 0 0 1 4.5 3",
    "M15.5 3h4A1.5 1.5 0 0 1 21 4.5v4a1.5 1.5 0 0 1-1.5 1.5h-4A1.5 1.5 0 0 1 14 8.5v-4A1.5 1.5 0 0 1 15.5 3",
    "M15.5 14h4a1.5 1.5 0 0 1 1.5 1.5v4a1.5 1.5 0 0 1-1.5 1.5h-4a1.5 1.5 0 0 1-1.5-1.5v-4a1.5 1.5 0 0 1 1.5-1.5",
    "M4.5 14h4a1.5 1.5 0 0 1 1.5 1.5v4A1.5 1.5 0 0 1 8.5 21h-4A1.5 1.5 0 0 1 3 19.5v-4A1.5 1.5 0 0 1 4.5 14",
  ],
  clock: ["M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0", "M12 7v5l3 2"],
  scan: [
    "M3 7V5a2 2 0 0 1 2-2h2",
    "M17 3h2a2 2 0 0 1 2 2v2",
    "M21 17v2a2 2 0 0 1-2 2h-2",
    "M7 21H5a2 2 0 0 1-2-2v-2",
    "M7 12h10",
  ],
  share: ["M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8", "m16 6-4-4-4 4", "M12 2v13"],
  link: [
    "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71",
    "M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71",
  ],
  file: ["M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z", "M14 2v4a2 2 0 0 0 2 2h4"],
  flash: "M13 2 3 14h9l-1 8 10-12h-9l1-8z",
  trash: ["M3 6h18", "M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6", "M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"],
  clipboard: [
    "M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2",
    "M9 2h6a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1",
  ],
};

export function Screen({
  theme,
  children,
  style,
}: {
  theme: Theme;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[{ flex: 1, backgroundColor: theme.stage }, style]}>{children}</View>;
}

/** The top bar: back on the left, the title in the centre, room for one action on the right. */
export function TopBar({
  theme,
  title,
  onBack,
  left,
  right,
}: {
  theme: Theme;
  title?: string;
  onBack?: () => void;
  left?: ReactNode;
  right?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingTop: insets.top + 6 }]}>
      <View style={styles.side}>
        {left ??
          (onBack ? (
            <IconButton label="Back" onPress={onBack}>
              <Icon d={ICON.back} color={theme.ink} />
            </IconButton>
          ) : null)}
      </View>
      <Text
        numberOfLines={1}
        style={[styles.barTitle, { color: theme.ink, fontFamily: FONT.display }]}
        accessibilityRole="header"
      >
        {title ?? ""}
      </Text>
      <View style={[styles.side, { alignItems: "flex-end" }]}>{right}</View>
    </View>
  );
}

export const goBack = () => (router.canGoBack() ? router.back() : router.replace("/"));

export function IconButton({
  label,
  onPress,
  children,
  background,
}: {
  label: string;
  onPress: () => void;
  children: ReactNode;
  background?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [
        styles.iconButton,
        background ? { backgroundColor: background } : null,
        pressed ? { opacity: 0.6 } : null,
      ]}
    >
      {children}
    </Pressable>
  );
}

export function Button({
  theme,
  label,
  onPress,
  kind = "primary",
  icon,
  busy,
  disabled,
  style,
}: {
  theme: Theme;
  label: string;
  onPress: () => void;
  kind?: "primary" | "secondary" | "quiet";
  icon?: string | string[];
  busy?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const fg = kind === "primary" ? theme.onEmber : theme.ink;
  const bg = kind === "primary" ? theme.ember : kind === "secondary" ? theme.paper2 : "transparent";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled || busy), busy: Boolean(busy) }}
      onPress={onPress}
      disabled={disabled || busy}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, opacity: disabled ? 0.45 : pressed ? 0.8 : 1 },
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          <Text style={[styles.buttonText, { color: fg }]}>{label}</Text>
          {icon ? <Icon d={icon} size={18} color={fg} /> : null}
        </>
      )}
    </Pressable>
  );
}

export function SectionTitle({ theme, children }: { theme: Theme; children: ReactNode }) {
  return (
    <Text accessibilityRole="header" style={[styles.section, { color: theme.ink3 }]}>
      {children}
    </Text>
  );
}

export function Label({
  theme,
  children,
  style,
}: {
  theme: Theme;
  children: ReactNode;
  style?: StyleProp<TextStyle>;
}) {
  return (
    <Text style={[{ color: theme.ink3, fontSize: 13, lineHeight: 18 }, style]}>{children}</Text>
  );
}

/** A small format chip: PDF, ZIP. */
export function Chip({ theme, children }: { theme: Theme; children: ReactNode }) {
  return (
    <View style={[styles.chip, { backgroundColor: theme.paper3 }]}>
      <Text style={{ color: theme.ink, fontFamily: FONT.mono, fontSize: 12 }}>{children}</Text>
    </View>
  );
}

export const styles = StyleSheet.create({
  bar: {
    paddingHorizontal: 8,
    paddingBottom: 4,
    flexDirection: "row",
    alignItems: "center",
  },
  side: { width: 56, alignItems: "flex-start" },
  barTitle: { flex: 1, textAlign: "center", fontSize: 18, lineHeight: 44 },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  button: {
    height: 48,
    borderRadius: 999,
    paddingHorizontal: 22,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  buttonText: { fontFamily: FONT.uiSemi, fontSize: 16 },
  section: {
    marginHorizontal: 4,
    fontFamily: FONT.uiMedium,
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  chip: {
    height: 22,
    paddingHorizontal: 7,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
});
