import { Geist_400Regular, Geist_500Medium, Geist_600SemiBold } from "@expo-google-fonts/geist";
import { GeistMono_400Regular } from "@expo-google-fonts/geist-mono";
import { SpaceGrotesk_600SemiBold, SpaceGrotesk_700Bold } from "@expo-google-fonts/space-grotesk";
import { useFonts } from "expo-font";
import * as Notifications from "expo-notifications";
import { router, Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { AppState } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { getRunById, readSetting } from "../data/db";
import { syncOpenRuns, syncRun } from "../data/sync";
import { type Lang, setLang, useLang } from "../i18n";
import { APP_THEME } from "../theme/theme";

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fonts] = useFonts({
    Geist_400Regular,
    Geist_500Medium,
    Geist_600SemiBold,
    GeistMono_400Regular,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
  });
  useLang();

  useEffect(() => {
    void readSetting<Lang | null>("lang", null).then((lang) => lang && setLang(lang));
  }, []);

  useEffect(() => {
    if (fonts) {
      void SplashScreen.hideAsync();
    }
  }, [fonts]);

  // Runs go on on the server while the app sleeps: coming back, it asks how they are.
  useEffect(() => {
    void syncOpenRuns();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void syncOpenRuns();
      }
    });
    return () => sub.remove();
  }, []);

  // A tap on a run's notification opens its result when it is done, else the run.
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(async (response) => {
      const runId = response.notification.request.content.data?.runId;
      const known = typeof runId === "string" ? await getRunById(runId) : null;
      if (!known) {
        return;
      }
      const run = (await syncRun(known)) ?? known;
      if (run.status === "done" && run.result) {
        router.push({ pathname: "/result/[id]", params: { id: run.id } });
      } else if (run.wizardId !== null) {
        router.push({ pathname: "/run", params: { wizard: String(run.wizardId), runId: run.id } });
      }
    });
    return () => sub.remove();
  }, []);

  if (!fonts) {
    return null;
  }
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: APP_THEME.stage },
          animation: "slide_from_right",
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="scan"
          options={{ presentation: "fullScreenModal", animation: "fade" }}
        />
        <Stack.Screen name="add" options={{ presentation: "modal" }} />
        <Stack.Screen name="settings" />
        <Stack.Screen name="wizard/[id]" />
        <Stack.Screen name="run" options={{ gestureEnabled: false }} />
        <Stack.Screen name="result/[id]" />
      </Stack>
    </SafeAreaProvider>
  );
}
