import { router, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { WebView } from "react-native-webview";
import { parseInput } from "../data/links";
import { t, useLang } from "../i18n";
import { APP_THEME } from "../theme/theme";
import { goBack, Screen, TopBar } from "../ui/ui";

/**
 * A shared result (`/s/<token>`), read-only, as its runtime shows it. "Make your own" leads to
 * the wizard's link, which the app opens itself.
 */
export default function SharedScreen() {
  useLang();
  const { url } = useLocalSearchParams<{ url: string }>();
  const parsed = parseInput(url ?? "");
  const theme = APP_THEME;
  if (parsed?.kind !== "result") {
    return (
      <Screen theme={theme}>
        <TopBar theme={theme} onBack={goBack} />
      </Screen>
    );
  }
  const origin = new URL(parsed.runtime).origin;
  return (
    <Screen theme={theme}>
      <TopBar theme={theme} title={t("results.title")} onBack={goBack} />
      <WebView
        source={{ uri: `${parsed.runtime}/s/${parsed.token}?app=1` }}
        style={{ flex: 1, backgroundColor: theme.stage }}
        onShouldStartLoadWithRequest={(req) => {
          if (req.isTopFrame === false) {
            return true;
          }
          const next = parseInput(req.url);
          if (next?.kind === "wizard") {
            router.push({ pathname: "/link", params: { url: req.url } });
            return false;
          }
          if (req.url.startsWith(origin)) {
            return true;
          }
          void WebBrowser.openBrowserAsync(req.url);
          return false;
        }}
      />
    </Screen>
  );
}
