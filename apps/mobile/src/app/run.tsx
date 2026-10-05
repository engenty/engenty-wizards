import { router, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Modal, Platform, StyleSheet, Text, View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { type BridgeContext, handleBridge } from "../bridge/handle";
import { answerScript, bridgeScript, isBridgeRequest } from "../bridge/script";
import { getRunById, getWizardById, noteRun, useQuery, type Wizard } from "../data/db";
import { syncRun } from "../data/sync";
import { visitorId } from "../data/visitor";
import { lang, t, useLang } from "../i18n";
import { registerPush } from "../notify";
import { FONT, wizardTheme } from "../theme/theme";
import { Scanner } from "../ui/Scanner";
import { Button, ICON, Icon, IconButton, Screen, TopBar } from "../ui/ui";

/** How often an open run is asked for its state while the Run screen shows it. */
const POLL_MS = 6000;

function runIdIn(url: string, wizard: Wizard): string | null {
  try {
    const u = new URL(url);
    const base = new URL(wizard.runtime);
    if (u.origin !== base.origin) {
      return null;
    }
    const m = u.pathname.match(/\/w\/([A-Za-z0-9_-]+)\/([A-Za-z0-9_-]+)\/?$/);
    return m && m[1] === wizard.token ? m[2] : null;
  } catch {
    return null;
  }
}

/**
 * The run is the runtime's own runner (`/w/<token>?app=1`) in a WebView, not a second runner
 * drawn in native views: it belongs to the runtime's release. The app adds what a browser lacks
 * through `window.engentyApp` (bridge/script.ts).
 */
export default function RunScreen() {
  useLang();
  const params = useLocalSearchParams<{ wizard: string; runId?: string; start?: string }>();
  const wizard = useQuery(() => getWizardById(Number(params.wizard)), [params.wizard]);
  const theme = wizardTheme(wizard?.avatar);
  const web = useRef<WebView>(null);
  const [vid, setVid] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const currentRun = useRef<string | null>(params.runId ?? null);
  const [scanning, setScanning] = useState<((text: string | null) => void) | null>(null);

  useEffect(() => {
    if (wizard) {
      void visitorId(wizard.runtime).then(setVid);
    }
  }, [wizard]);

  // The address is fixed once: later steps change it inside the WebView.
  // biome-ignore lint/correctness/useExhaustiveDependencies: set once per wizard
  const uri = useMemo(() => {
    if (!wizard) {
      return null;
    }
    const base = `${wizard.runtime}/w/${wizard.token}`;
    return params.runId
      ? `${base}/${params.runId}?app=1`
      : `${base}?app=1${params.start ? "&start=1" : ""}`;
  }, [wizard?.runtime, wizard?.token]);

  const onRun = useCallback(
    (runId: string) => {
      if (!wizard || currentRun.current === runId) {
        return;
      }
      currentRun.current = runId;
      void registerPush(wizard.runtime, runId);
      void noteRun({
        id: runId,
        wizardId: wizard.id,
        runtime: wizard.runtime,
        token: wizard.token,
        wizardTitle: wizard.title,
        avatar: wizard.avatar,
      });
    },
    [wizard],
  );

  // The run's state while it is shown; done, its result is kept on the phone.
  useEffect(() => {
    const tick = async () => {
      const id = currentRun.current;
      const run = id ? await getRunById(id) : null;
      if (run && (run.status === "waiting_input" || run.status === "running")) {
        await syncRun(run);
      }
    };
    const timer = setInterval(() => void tick(), POLL_MS);
    return () => {
      clearInterval(timer);
      void tick();
    };
  }, []);

  const bridge = useMemo<BridgeContext | null>(
    () =>
      wizard
        ? {
            runtime: wizard.runtime,
            runId: () => currentRun.current,
            scan: () => new Promise((resolve) => setScanning(() => resolve)),
            onRun,
          }
        : null,
    [wizard, onRun],
  );

  const onMessage = async (event: WebViewMessageEvent) => {
    if (!(bridge && wizard)) {
      return;
    }
    // Only the wizard's own runtime may ask; a page the WebView reached elsewhere may not.
    try {
      if (new URL(event.nativeEvent.url).origin !== new URL(wizard.runtime).origin) {
        return;
      }
    } catch {
      return;
    }
    let data: unknown;
    try {
      data = JSON.parse(event.nativeEvent.data);
    } catch {
      return;
    }
    if (!isBridgeRequest(data)) {
      return;
    }
    try {
      const value = await handleBridge(bridge, data.method, data.args);
      web.current?.injectJavaScript(answerScript(data.id, true, value));
    } catch (err) {
      web.current?.injectJavaScript(answerScript(data.id, false, (err as Error).message));
    }
  };

  const finishScan = (text: string | null) => {
    scanning?.(text);
    setScanning(null);
  };

  if (!(wizard && uri && vid)) {
    return (
      <Screen theme={theme} style={{ alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={theme.ink3} />
      </Screen>
    );
  }
  const origin = new URL(wizard.runtime).origin;
  return (
    <Screen theme={theme}>
      <TopBar
        theme={theme}
        title={wizard.title}
        left={
          <IconButton label={t("run.leave")} onPress={() => router.back()}>
            <Icon d={ICON.close} color={theme.ink} />
          </IconButton>
        }
      />
      {failed ? (
        <View style={styles.failed}>
          <Text
            style={{ color: theme.ink2, fontFamily: FONT.ui, fontSize: 15, textAlign: "center" }}
          >
            {t("run.offline")}
          </Text>
          <Button
            theme={theme}
            kind="secondary"
            label={t("run.retry")}
            onPress={() => {
              setFailed(false);
              web.current?.reload();
            }}
          />
        </View>
      ) : null}
      <WebView
        ref={web}
        source={{ uri }}
        style={{ flex: 1, backgroundColor: theme.stage, display: failed ? "none" : "flex" }}
        containerStyle={{ backgroundColor: theme.stage }}
        injectedJavaScriptBeforeContentLoaded={bridgeScript({
          origin,
          visitorId: vid,
          lang,
          secure: origin.startsWith("https:"),
        })}
        injectedJavaScriptBeforeContentLoadedForMainFrameOnly
        onMessage={(e) => void onMessage(e)}
        onNavigationStateChange={(nav) => {
          const runId = runIdIn(nav.url, wizard);
          if (runId) {
            onRun(runId);
          }
        }}
        onShouldStartLoadWithRequest={(req) => {
          // Frames (widgets, the human check) load as the page asks.
          if (req.isTopFrame === false) {
            return true;
          }
          try {
            if (new URL(req.url).origin === origin || req.url.startsWith("about:")) {
              return true;
            }
          } catch {
            return false;
          }
          // Another website opens in the system's browser, not inside the runner.
          void WebBrowser.openBrowserAsync(req.url);
          return false;
        }}
        setSupportMultipleWindows
        onOpenWindow={(e) => void WebBrowser.openBrowserAsync(e.nativeEvent.targetUrl)}
        onFileDownload={(e) =>
          void handleBridge(bridge as BridgeContext, "download", {
            url: e.nativeEvent.downloadUrl,
          }).catch(() => undefined)
        }
        onError={() => setFailed(true)}
        onHttpError={(e) => {
          if (e.nativeEvent.statusCode >= 500) {
            setFailed(true);
          }
        }}
        domStorageEnabled
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        mediaCapturePermissionGrantType="grantIfSameHostElsePrompt"
        geolocationEnabled
        allowsBackForwardNavigationGestures={false}
        applicationNameForUserAgent="engenty-wizards-app/1"
        pullToRefreshEnabled={false}
        overScrollMode="never"
        keyboardDisplayRequiresUserAction={false}
        contentInsetAdjustmentBehavior="never"
        startInLoadingState
        renderLoading={() => (
          <View style={[StyleSheet.absoluteFill, styles.loading, { backgroundColor: theme.stage }]}>
            <ActivityIndicator color={theme.ink3} />
          </View>
        )}
        {...(Platform.OS === "android" ? { textZoom: 100 } : {})}
      />
      <Modal
        visible={scanning !== null}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => finishScan(null)}
      >
        <Scanner
          title={t("scan.title")}
          hint={t("scan.fieldHint")}
          onClose={() => finishScan(null)}
          onCode={(text) => {
            finishScan(text);
            return true;
          }}
        />
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  loading: { alignItems: "center", justifyContent: "center" },
  failed: { padding: 32, gap: 16, alignItems: "center" },
});
