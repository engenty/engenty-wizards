import { Tabs } from "expo-router";
import { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { t, useLang } from "../../i18n";
import { APP_THEME } from "../../theme/theme";
import { GLYPH, Glass, Glyph, LIQUID_GLASS } from "../../ui/ui";

const TABS = [
  { name: "index", label: () => t("tabs.wizards"), glyph: GLYPH.grid },
  { name: "results", label: () => t("tabs.results"), glyph: GLYPH.clock },
] as const;

const BAR_WIDTH = 266;
const PAD = 4;
const GAP = 2;
const TAB_WIDTH = (BAR_WIDTH - 2 * PAD - GAP) / 2;
const TAB_HEIGHT = 54;

/** The glass the bar is made of: lit a little, so it shows as glass on the flat stage too. */
const BAR_TINT = "rgba(255,255,255,0.08)";
/** The lens over the active tab: clear glass with a light in it; a plain pill where there is no glass. */
const LENS_TINT = "rgba(255,255,255,0.28)";

/**
 * Two tabs, Wizards and Results, in a glass capsule that floats over the content; scanning hides
 * behind the Wizards screen's "+". The active tab sits under a lens that slides to the tab just
 * picked, as the system's own bars do; the capsule answers a touch with the glass's own shimmer.
 */
function TabBar({
  index,
  onPick,
}: {
  index: number;
  onPick: (name: (typeof TABS)[number]["name"]) => void;
}) {
  const theme = APP_THEME;
  const insets = useSafeAreaInsets();
  const x = useSharedValue(index * (TAB_WIDTH + GAP));
  useEffect(() => {
    x.value = withSpring(index * (TAB_WIDTH + GAP), { damping: 18, stiffness: 190, mass: 0.8 });
  }, [index, x]);
  const lens = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrap, { bottom: Math.max(insets.bottom - 6, 12) }]}
    >
      <View style={styles.bar}>
        <Glass interactive tint={BAR_TINT} style={StyleSheet.absoluteFill} />
        <Animated.View pointerEvents="none" style={[styles.lensSlot, lens]}>
          {LIQUID_GLASS ? (
            <Glass clear tint={LENS_TINT} style={styles.lens} />
          ) : (
            <View style={[styles.lens, styles.lensPlain]} />
          )}
        </Animated.View>
        {TABS.map((tab, i) => {
          const active = index === i;
          const color = active ? theme.ink : theme.ink2;
          return (
            <Pressable
              key={tab.name}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              onPress={() => onPick(tab.name)}
              style={styles.tab}
            >
              <Glyph d={tab.glyph} size={24} color={color} />
              <Text style={{ color, fontSize: 10, fontWeight: active ? "600" : "500" }}>
                {tab.label()}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function TabsLayout() {
  useLang();
  const theme = APP_THEME;
  return (
    <Tabs
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: theme.stage } }}
      tabBar={({ state, navigation }) => (
        <TabBar index={state.index} onPick={(name) => navigation.navigate(name)} />
      )}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="results" />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: 0, right: 0, alignItems: "center" },
  bar: {
    flexDirection: "row",
    gap: GAP,
    padding: PAD,
    borderRadius: (TAB_HEIGHT + 2 * PAD) / 2,
    width: BAR_WIDTH,
    overflow: "hidden",
  },
  lensSlot: { position: "absolute", left: PAD, top: PAD },
  lens: { width: TAB_WIDTH, height: TAB_HEIGHT, borderRadius: TAB_HEIGHT / 2 },
  lensPlain: { backgroundColor: "rgba(255,255,255,0.16)" },
  tab: {
    flex: 1,
    height: TAB_HEIGHT,
    borderRadius: TAB_HEIGHT / 2,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
});
