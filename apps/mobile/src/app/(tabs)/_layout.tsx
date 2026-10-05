import { Tabs } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { t, useLang } from "../../i18n";
import { APP_THEME } from "../../theme/theme";
import { GLYPH, Glass, Glyph } from "../../ui/ui";

const TABS = [
  { name: "index", label: () => t("tabs.wizards"), glyph: GLYPH.grid },
  { name: "results", label: () => t("tabs.results"), glyph: GLYPH.clock },
] as const;

/**
 * Two tabs, Wizards and Results, in a glass capsule that floats over the content; scanning hides
 * behind the Wizards screen's "+".
 */
export default function TabsLayout() {
  useLang();
  const insets = useSafeAreaInsets();
  const theme = APP_THEME;
  return (
    <Tabs
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: theme.stage } }}
      tabBar={({ state, navigation }) => (
        <View
          pointerEvents="box-none"
          style={[styles.wrap, { bottom: Math.max(insets.bottom - 6, 12) }]}
        >
          <Glass style={styles.bar}>
            {TABS.map((tab, i) => {
              const active = state.index === i;
              const color = active ? theme.ink : theme.ink2;
              return (
                <Pressable
                  key={tab.name}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                  onPress={() => navigation.navigate(tab.name)}
                  style={[styles.tab, active ? styles.active : null]}
                >
                  <Glyph d={tab.glyph} size={24} color={color} />
                  <Text style={{ color, fontSize: 10, fontWeight: active ? "600" : "500" }}>
                    {tab.label()}
                  </Text>
                </Pressable>
              );
            })}
          </Glass>
        </View>
      )}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="results" />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: 0, right: 0, alignItems: "center" },
  bar: { flexDirection: "row", gap: 2, padding: 4, borderRadius: 31, width: 266 },
  tab: {
    flex: 1,
    height: 54,
    borderRadius: 27,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  active: { backgroundColor: "rgba(255,255,255,0.16)" },
});
