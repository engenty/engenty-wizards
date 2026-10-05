import { File } from "expo-file-system";
import { useLocalSearchParams } from "expo-router";
import * as Sharing from "expo-sharing";
import { useEffect, useState } from "react";
import { WebView } from "react-native-webview";
import { keptFile, runFolder } from "../data/results";
import { t, useLang } from "../i18n";
import { APP_THEME } from "../theme/theme";
import { goBack, ICON, Icon, IconButton, Screen, TopBar } from "../ui/ui";

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

/**
 * A kept file, shown without network: the WebView may read the run's folder and nothing else.
 * Markdown and text are shown as text; HTML as the page it is, with its links going nowhere.
 */
export default function FileScreen() {
  useLang();
  const { run, name } = useLocalSearchParams<{ run: string; name: string }>();
  const theme = APP_THEME;
  const file = keptFile(run, name);
  const [html, setHtml] = useState<string | null>(null);
  const plain = /\.(md|txt|json|csv)$/i.test(name);

  useEffect(() => {
    if (plain) {
      void new File(file.uri)
        .text()
        .then((text) =>
          setHtml(
            `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0;padding:16px;background:${theme.stage};color:${theme.ink};font:15px/1.5 -apple-system,system-ui,sans-serif"><pre style="white-space:pre-wrap;word-break:break-word;font:inherit">${escapeHtml(text)}</pre></body>`,
          ),
        );
    }
  }, [plain, file.uri]);

  return (
    <Screen theme={theme}>
      <TopBar
        theme={theme}
        title={name}
        onBack={goBack}
        right={
          <IconButton
            label={t("result.shareFiles")}
            onPress={() => void Sharing.shareAsync(file.uri)}
          >
            <Icon d={ICON.share} color={theme.ink} size={22} />
          </IconButton>
        }
      />
      {plain ? (
        html ? (
          <WebView
            source={{ html }}
            originWhitelist={["about:*"]}
            style={{ backgroundColor: theme.stage }}
          />
        ) : null
      ) : (
        <WebView
          source={{ uri: file.uri }}
          originWhitelist={["file://*"]}
          allowingReadAccessToURL={runFolder(run).uri}
          allowFileAccess
          onShouldStartLoadWithRequest={(req) => req.url.startsWith("file://")}
          style={{ backgroundColor: "#fff" }}
        />
      )}
    </Screen>
  );
}
