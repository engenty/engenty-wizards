import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { readSetting } from "./data/db";
import { registerDevice } from "./data/runtime";
import { lang } from "./i18n";

/**
 * Local notifications: a run that is done, failed or asks while the app is in the background.
 * iOS suspends the app within seconds, so this covers short steps only. For a closed app the
 * runtime pushes through the Manage-App to the device the app gave the run (registerPush).
 */

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

let channel: Promise<unknown> | null = null;

function ensureChannel() {
  if (Platform.OS !== "android") {
    return Promise.resolve();
  }
  channel ??= Notifications.setNotificationChannelAsync("runs", {
    name: "Runs",
    importance: Notifications.AndroidImportance.HIGH,
  });
  return channel;
}

export const notificationsWanted = () => readSetting("notify", true);

/** Asked at the moment the person turns it on, never at the app's start. */
export async function requestNotifyPermission(): Promise<boolean> {
  await ensureChannel();
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) {
    return true;
  }
  if (!current.canAskAgain) {
    return false;
  }
  return (await Notifications.requestPermissionsAsync()).granted;
}

export async function notifyNow(message: {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}) {
  if (!(await notificationsWanted())) {
    return;
  }
  await ensureChannel();
  if (!(await Notifications.getPermissionsAsync()).granted) {
    return;
  }
  await Notifications.scheduleNotificationAsync({
    content: { title: message.title, body: message.body, data: message.data ?? {} },
    trigger: null,
  });
}

/**
 * Gives a run this phone's push device, when the person wants to be told and has allowed it.
 * Never asks for the permission itself. A runtime without push (one that runs alone) or a build
 * without push keys just leaves it.
 */
export async function registerPush(runtime: string, runId: string) {
  try {
    if (!(await notificationsWanted())) {
      return;
    }
    await ensureChannel();
    if (!(await Notifications.getPermissionsAsync()).granted) {
      return;
    }
    const device = await Notifications.getDevicePushTokenAsync();
    if (typeof device.data !== "string") {
      return;
    }
    await registerDevice(runtime, runId, {
      token: device.data,
      platform: Platform.OS === "ios" ? "ios" : "android",
      lang,
    });
  } catch {
    // no push for this run: local notifications still work while the app is open
  }
}
