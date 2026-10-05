import { BlurView } from "expo-blur";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { router } from "expo-router";
import { Children, Fragment, isValidElement, type ReactNode } from "react";
import {
  ActivityIndicator,
  Platform,
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
import type { Theme } from "../theme/theme";

/** Strokes on a 24 × 24 grid, round caps: the icons of the app's own chrome. */
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
  back: "m14.5 4.5-7.5 7.5 7.5 7.5",
  next: "m9.5 5.5 6.5 6.5-6.5 6.5",
  close: ["M17 7 7 17", "m7 7 10 10"],
  plus: ["M5 12h14", "M12 5v14"],
  arrow: ["M5 12h14", "m12 5 7 7-7 7"],
  share: [
    "M12 3v12",
    "m8 7 4-4 4 4",
    "M8 10H6.5A1.5 1.5 0 0 0 5 11.5v8A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5v-8a1.5 1.5 0 0 0-1.5-1.5H16",
  ],
  link: [
    "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71",
    "M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71",
  ],
  more: ["M5 12h.01", "M12 12h.01", "M19 12h.01"],
  search: ["M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13", "m20 20-4.8-4.8"],
  flash: "M13 2 3 14h9l-1 8 10-12h-9l1-8z",
  check: "m5 12.5 4.5 4.5L19 7.5",
};

/** Filled glyphs on a 24 × 24 grid, for the tab bar and the settings tiles. */
export function Glyph({ d, size = 24, color }: { d: string; size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d={d} fill={color} fillRule="evenodd" />
    </Svg>
  );
}

export const GLYPH = {
  grid: "M5.5 3h3A2.5 2.5 0 0 1 11 5.5v3A2.5 2.5 0 0 1 8.5 11h-3A2.5 2.5 0 0 1 3 8.5v-3A2.5 2.5 0 0 1 5.5 3Zm10 0h3A2.5 2.5 0 0 1 21 5.5v3a2.5 2.5 0 0 1-2.5 2.5h-3A2.5 2.5 0 0 1 13 8.5v-3A2.5 2.5 0 0 1 15.5 3Zm-10 10h3a2.5 2.5 0 0 1 2.5 2.5v3A2.5 2.5 0 0 1 8.5 21h-3A2.5 2.5 0 0 1 3 18.5v-3A2.5 2.5 0 0 1 5.5 13Zm10 0h3a2.5 2.5 0 0 1 2.5 2.5v3a2.5 2.5 0 0 1-2.5 2.5h-3a2.5 2.5 0 0 1-2.5-2.5v-3a2.5 2.5 0 0 1 2.5-2.5Z",
  clock:
    "M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20Zm0 4a1 1 0 0 0-1 1v5.5a1 1 0 0 0 .47.85l3.5 2.2a1 1 0 1 0 1.06-1.7L13 11.95V7a1 1 0 0 0-1-1Z",
  globe:
    "M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20Zm-1.6 2.2A8 8 0 0 0 4.06 11h3.48c.13-2.6.75-4.98 1.86-6.8Zm3.2 0c1.1 1.82 1.73 4.2 1.86 6.8h3.48a8 8 0 0 0-5.34-6.8ZM12 4.3c-1.2 1.5-2.3 3.9-2.45 6.7h4.9C14.3 8.2 13.2 5.8 12 4.3ZM4.06 13a8 8 0 0 0 5.34 6.8c-1.1-1.82-1.73-4.2-1.86-6.8H4.06Zm5.5 0c.14 2.8 1.24 5.2 2.44 6.7 1.2-1.5 2.3-3.9 2.45-6.7H9.56Zm6.9 0c-.13 2.6-.75 4.98-1.86 6.8a8 8 0 0 0 5.34-6.8h-3.48Z",
  bell: "M12 2a6 6 0 0 0-6 6v4.2L4.3 15.4A1 1 0 0 0 5.2 17h13.6a1 1 0 0 0 .9-1.6L18 12.2V8a6 6 0 0 0-6-6Zm-2.8 16.5a2.9 2.9 0 0 0 5.6 0H9.2Z",
  disk: "M6 5h12a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3Zm11 9.3a1.3 1.3 0 1 0 0-2.6 1.3 1.3 0 0 0 0 2.6Z",
  server:
    "M5 3h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm2 3a1 1 0 1 0 0 2 1 1 0 0 0 0-2Zm-2 7h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2Zm2 3a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z",
  info: "M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20Zm0 8a1.2 1.2 0 0 0-1.2 1.2v5.6a1.2 1.2 0 0 0 2.4 0v-5.6A1.2 1.2 0 0 0 12 10Zm0-4a1.4 1.4 0 1 0 0 2.8A1.4 1.4 0 0 0 12 6Z",
};

const LIQUID = isLiquidGlassAvailable();

/** The space a tab's screen leaves at its bottom: its content scrolls under the floating tab bar. */
export const TAB_SPACE = 120;

/**
 * Glass: Liquid Glass on iOS 26, a dark blur elsewhere. Chrome that floats over the content —
 * the tab bar, the nav bar's buttons, a secondary action.
 */
export function Glass({
  style,
  children,
  interactive,
}: {
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
  interactive?: boolean;
}) {
  if (LIQUID) {
    return (
      <GlassView
        glassEffectStyle="regular"
        colorScheme="dark"
        isInteractive={interactive}
        style={[{ overflow: "hidden" }, style]}
      >
        {children}
      </GlassView>
    );
  }
  return (
    <BlurView
      intensity={Platform.OS === "ios" ? 40 : 60}
      tint="dark"
      experimentalBlurMethod="dimezisBlurView"
      style={[styles.blur, style]}
    >
      {children}
    </BlurView>
  );
}

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

/** A round glass button in the nav bar: back, close, more. */
export function IconButton({
  label,
  onPress,
  children,
  plain,
}: {
  label: string;
  onPress: () => void;
  children: ReactNode;
  /** No glass: a button on a camera picture keeps its own background. */
  plain?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
    >
      {plain ? (
        <View style={styles.circle}>{children}</View>
      ) : (
        <Glass interactive style={styles.circle}>
          {children}
        </Glass>
      )}
    </Pressable>
  );
}

/** The nav bar: a glass button on each side, the title in the centre. */
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
    <View style={[styles.bar, { paddingTop: insets.top + 4 }]}>
      <View style={styles.side}>
        {left ??
          (onBack ? (
            <IconButton label="Back" onPress={onBack}>
              <Icon d={ICON.back} color={theme.ink} strokeWidth={2.4} />
            </IconButton>
          ) : null)}
      </View>
      <Text
        numberOfLines={1}
        style={[styles.barTitle, { color: theme.ink }]}
        accessibilityRole="header"
      >
        {title ?? ""}
      </Text>
      <View style={[styles.side, { alignItems: "flex-end" }]}>{right}</View>
    </View>
  );
}

export const goBack = () => (router.canGoBack() ? router.back() : router.replace("/"));

/** A capsule: `primary` in ember, `glass` for the action beside it, `plain` as text. */
export function Button({
  theme,
  label,
  onPress,
  kind = "primary",
  icon,
  busy,
  disabled,
  style,
  small,
}: {
  theme: Theme;
  label: string;
  onPress: () => void;
  kind?: "primary" | "glass" | "plain";
  icon?: string | string[];
  busy?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  small?: boolean;
}) {
  const fg = kind === "primary" ? theme.onEmber : theme.ink;
  const height = small ? 36 : 52;
  const content = busy ? (
    <ActivityIndicator color={fg} />
  ) : (
    <>
      {icon ? <Icon d={icon} size={small ? 16 : 19} color={fg} strokeWidth={2.2} /> : null}
      <Text style={{ color: fg, fontSize: small ? 15 : 17, fontWeight: "600" }}>{label}</Text>
    </>
  );
  const inner: ViewStyle = {
    height,
    borderRadius: height / 2,
    paddingHorizontal: small ? 16 : 22,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  };
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled || busy), busy: Boolean(busy) }}
      onPress={onPress}
      disabled={disabled || busy}
      style={({ pressed }) => [{ opacity: disabled ? 0.45 : pressed ? 0.8 : 1 }, style]}
    >
      {kind === "glass" ? (
        <Glass interactive style={inner}>
          {content}
        </Glass>
      ) : (
        <View style={[inner, kind === "primary" ? { backgroundColor: theme.ember } : null]}>
          {content}
        </View>
      )}
    </Pressable>
  );
}

/** A section's title above its group, as iOS lists put it. */
export function SectionTitle({ theme, children }: { theme: Theme; children: ReactNode }) {
  return (
    <Text accessibilityRole="header" style={[styles.section, { color: theme.ink }]}>
      {children}
    </Text>
  );
}

/** The small caps title of a settings group. */
export function GroupTitle({ theme, children }: { theme: Theme; children: ReactNode }) {
  return <Text style={[styles.groupTitle, { color: theme.ink3 }]}>{children}</Text>;
}

/** Text under a group: what its rows mean. */
export function Footer({ theme, children }: { theme: Theme; children: ReactNode }) {
  return <Text style={[styles.footer, { color: theme.ink3 }]}>{children}</Text>;
}

/**
 * Rows in one rounded group, a hairline between them that starts where the row's text starts
 * (`inset`), as an inset grouped list on iOS.
 */
export function Group({
  theme,
  inset = 16,
  children,
  style,
}: {
  theme: Theme;
  inset?: number;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const rows = Children.toArray(children).filter(isValidElement);
  return (
    <View style={[styles.group, { backgroundColor: theme.card }, style]}>
      {rows.map((row, i) => (
        <Fragment key={row.key ?? i}>
          {i > 0 ? (
            <View
              style={{
                height: StyleSheet.hairlineWidth,
                marginLeft: inset,
                backgroundColor: theme.line,
              }}
            />
          ) : null}
          {row}
        </Fragment>
      ))}
    </View>
  );
}

/** A row of a group: tappable when it has `onPress`. */
export function Row({
  onPress,
  onLongPress,
  height = 52,
  children,
  style,
}: {
  onPress?: () => void;
  onLongPress?: () => void;
  height?: number;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const base: ViewStyle = {
    minHeight: height,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  };
  if (!(onPress || onLongPress)) {
    return <View style={[base, style]}>{children}</View>;
  }
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [
        base,
        pressed ? { backgroundColor: "rgba(255,255,255,0.08)" } : null,
        style,
      ]}
    >
      {children}
    </Pressable>
  );
}

export const Chevron = ({ theme }: { theme: Theme }) => (
  <Icon d={ICON.next} size={16} color={theme.ink4} strokeWidth={2.4} />
);

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
    <Text style={[{ color: theme.ink3, fontSize: 15, lineHeight: 20 }, style]}>{children}</Text>
  );
}

export const text = StyleSheet.create({
  body: { fontSize: 17, lineHeight: 22 },
  bodySemi: { fontSize: 17, lineHeight: 22, fontWeight: "600" },
  sub: { fontSize: 15, lineHeight: 20 },
  foot: { fontSize: 13, lineHeight: 18 },
  title: { fontSize: 28, lineHeight: 34, fontWeight: "700" },
});

export const styles = StyleSheet.create({
  blur: {
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.18)",
  },
  bar: { paddingHorizontal: 16, paddingBottom: 6, flexDirection: "row", alignItems: "center" },
  side: { width: 64, alignItems: "flex-start" },
  barTitle: { flex: 1, textAlign: "center", fontSize: 17, fontWeight: "600" },
  circle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  section: { marginHorizontal: 4, fontSize: 20, lineHeight: 25, fontWeight: "600" },
  groupTitle: { marginHorizontal: 16, fontSize: 13, lineHeight: 18, textTransform: "uppercase" },
  footer: { marginHorizontal: 16, marginTop: 7, fontSize: 13, lineHeight: 18 },
  group: { borderRadius: 26, overflow: "hidden" },
});
