import { File, Paths } from "expo-file-system";
import * as Haptics from "expo-haptics";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import * as Sharing from "expo-sharing";
import * as WebBrowser from "expo-web-browser";
import { AppState } from "react-native";
import { getRunById } from "../data/db";
import { keepDownload } from "../data/results";
import { visitorHeaders } from "../data/runtime";
import { notifyNow, registerPush, requestNotifyPermission } from "../notify";
import { shareLink } from "../ui/open-file";
import type { Ability } from "./script";

/** What the Run screen hands the bridge: where the page is and the parts only a screen has. */
export interface BridgeContext {
  runtime: string;
  /** The run the page shows right now, when it shows one. */
  runId: () => string | null;
  /** Opens the native scanner over the page; null when the person closed it. */
  scan: () => Promise<string | null>;
  /** The runner started or opened a run. */
  onRun: (runId: string) => void;
}

const KEEP_AWAKE = "wizard-run";

/** Only addresses of the wizard's own runtime are fetched with its visitor cookie. */
function ownUrl(ctx: BridgeContext, url: unknown): string {
  if (typeof url !== "string") {
    throw new Error("no url");
  }
  const parsed = new URL(url);
  if (parsed.origin !== new URL(ctx.runtime).origin) {
    throw new Error("not this runtime");
  }
  return parsed.href;
}

async function shareFile(ctx: BridgeContext, url: string, title?: string) {
  const runId = ctx.runId();
  const run = runId ? await getRunById(runId) : null;
  // A file of a run in the app's results is kept there; anything else goes through the cache.
  const file = run
    ? await keepDownload(run, url)
    : await File.downloadFileAsync(url, Paths.cache, {
        headers: await visitorHeaders(ctx.runtime),
        idempotent: true,
      });
  await Sharing.shareAsync(file.uri, { dialogTitle: title, mimeType: file.type ?? undefined });
}

export async function handleBridge(
  ctx: BridgeContext,
  method: Ability,
  args: unknown,
): Promise<unknown> {
  const a = (args ?? {}) as Record<string, unknown>;
  switch (method) {
    case "scan":
      return ctx.scan();
    case "share": {
      if (typeof a.link === "string") {
        await shareLink(a.link, typeof a.title === "string" ? a.title : undefined);
        return true;
      }
      await shareFile(ctx, ownUrl(ctx, a.url), typeof a.title === "string" ? a.title : undefined);
      return true;
    }
    case "download": {
      // Kept with the run, then handed on: Files, Photos, another app.
      await shareFile(ctx, ownUrl(ctx, a.url));
      return true;
    }
    case "keepAwake":
      if (args === true) {
        await activateKeepAwakeAsync(KEEP_AWAKE);
      } else {
        deactivateKeepAwake(KEEP_AWAKE);
      }
      return true;
    case "notify": {
      if (AppState.currentState === "active") {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        return true;
      }
      await notifyNow({
        title: String(a.title ?? ""),
        body: String(a.body ?? ""),
        data: { runtime: ctx.runtime, runId: ctx.runId() },
      });
      return true;
    }
    case "notifyPermission": {
      const allowed = await requestNotifyPermission();
      const runId = ctx.runId();
      if (allowed && runId) {
        void registerPush(ctx.runtime, runId);
      }
      return allowed;
    }
    case "signIn":
      // The system's sheet: Google refuses a sign-in inside a WebView. The runner hears of the
      // connected account over the run's stream, as with its popup.
      await WebBrowser.openBrowserAsync(String(a.url ?? ""));
      return true;
    case "run":
      if (typeof a.runId === "string") {
        ctx.onRun(a.runId);
      }
      return true;
    default:
      throw new Error(`unknown method ${method satisfies never}`);
  }
}
