import { Tabs } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { t, useLang } from "../../i18n";
import { APP_THEME, FONT } from "../../theme/theme";
import { ICON, Icon } from "../../ui/ui";

const TABS = [
  { name: "index", label: () => t("tabs.wizards"), icon: ICON.grid },
  { name: "results", label: () => t("tabs.results"), icon: ICON.clock },
] as const;

/** Two tabs, Wizards and Results; scanning hides behind the Wizards screen's "+". */
export default function TabsLayout() {
  useLang();
  const insets = useSafeAreaInsets();
  const theme = APP_THEME;
  return (
    <Tabs
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: theme.stage } }}
      tabBar={({ state, navigation }) => (
        <View
          style={[
            styles.bar,
            {
              paddingBottom: Math.max(insets.bottom, 10),
              backgroundColor: theme.deep,
              borderTopColor: theme.card,
            },
          ]}
        >
          {TABS.map((tab, i) => {
            const active = state.index === i;
            const color = active ? theme.ink : theme.ink3;
            return (
              <Pressable
                key={tab.name}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                onPress={() => navigation.navigate(tab.name)}
                style={styles.tab}
              >
                <Icon d={tab.icon} size={22} color={color} />
                <Text
                  style={{
                    color,
                    fontSize: 12,
                    lineHeight: 16,
                    fontFamily: active ? FONT.uiSemi : FONT.uiMedium,
                  }}
                >
                  {tab.label()}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="results" />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingTop: 8,
    borderTopWidth: 1,
  },
  tab: { width: 88, height: 48, alignItems: "center", justifyContent: "center", gap: 3 },
});
