import type { File } from "expo-file-system";
import { startActivityAsync } from "expo-intent-launcher";
import { router } from "expo-router";
import * as Sharing from "expo-sharing";
import { Platform, Share } from "react-native";

/** What a WebView without network shows by itself, on both systems. */
const IN_APP = /\.(html?|md|txt|json|csv|png|jpe?g|webp|gif|mp4|mp3)$/i;

const MIME: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  zip: "application/zip",
};

const extension = (name: string) => name.split(".").pop()?.toLowerCase() ?? "";

/**
 * Shows a kept file: iOS shows PDF and Office files in its WebView like Quick Look does; Android
 * hands those to the system's viewer. A ZIP goes to the share sheet ("Save to Files").
 */
export async function openKept(runId: string, file: File) {
  const ext = extension(file.name);
  if (ext === "zip") {
    await Sharing.shareAsync(file.uri, { mimeType: MIME.zip });
    return;
  }
  if (Platform.OS === "android" && !IN_APP.test(file.name)) {
    try {
      await startActivityAsync("android.intent.action.VIEW", {
        data: file.contentUri,
        type: MIME[ext] ?? file.type ?? "*/*",
        flags: 1,
      });
    } catch {
      await Sharing.shareAsync(file.uri, { mimeType: MIME[ext] ?? undefined });
    }
    return;
  }
  router.push({ pathname: "/file", params: { run: runId, name: file.name } });
}

/** A link into the share sheet: iOS takes `url`, Android only reads `message`. */
export function shareLink(url: string, title?: string) {
  return Share.share(Platform.OS === "ios" ? { url, title } : { message: url, title });
}
