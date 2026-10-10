import { useSyncExternalStore } from "react";

/**
 * The studio as an app of its own on this device. Chrome and Edge install it on a word; Safari
 * and the phones add it from their own menus, so the studio says where. Installed, it opens in
 * its own window, or from the home screen like any app.
 */

/** Chrome's offer, kept by index.html until the person asks for it. */
export type InstallPrompt = NonNullable<Window["wizardInstall"]>;

/** How this device installs the studio. */
export type InstallWay =
  /** Chrome or Edge holds an offer: one click installs. */
  | "prompt"
  /** An iPhone or iPad: the share sheet, "Add to Home Screen". */
  | "ios"
  /** Safari on a Mac: File → Add to Dock. */
  | "mac"
  /** Chrome on Android without an offer: its menu, "Install app". */
  | "android"
  /** Chrome or Edge on a computer without an offer: the icon in the address bar. */
  | "chromium"
  /** Firefox and others: no install; Chrome or Edge would. */
  | "none";

/** Running as the installed app already: its own window, or from the home screen. */
export const standalone = (): boolean =>
  matchMedia("(display-mode: standalone)").matches ||
  matchMedia("(display-mode: window-controls-overlay)").matches ||
  (navigator as { standalone?: boolean }).standalone === true;

const ua = () => navigator.userAgent;
/** An iPad reports itself as a Mac, but with a touch screen. */
const ios = () =>
  /iPhone|iPad|iPod/.test(ua()) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const chromium = () =>
  Boolean(
    (navigator as { userAgentData?: { brands?: unknown[] } }).userAgentData?.brands?.length,
  ) || /Chrome|Chromium|Edg/.test(ua());
const safari = () => /Safari/.test(ua()) && !/Chrome|Chromium|Edg|Firefox|FxiOS/.test(ua());

export function installWay(prompt: InstallPrompt | null): InstallWay {
  if (prompt) {
    return "prompt";
  }
  // Android first: a touch screen with a desktop platform name is an iPad, unless it says so.
  if (/Android/.test(ua())) {
    return chromium() ? "android" : "none";
  }
  if (ios()) {
    return "ios";
  }
  if (safari()) {
    return "mac";
  }
  return chromium() ? "chromium" : "none";
}

/** Chrome's offer as the page holds it now; drawn again when it arrives or is used. */
export function useInstallPrompt(): InstallPrompt | null {
  return useSyncExternalStore(
    (listener) => {
      window.addEventListener("wizard-install", listener);
      window.addEventListener("appinstalled", listener);
      return () => {
        window.removeEventListener("wizard-install", listener);
        window.removeEventListener("appinstalled", listener);
      };
    },
    () => window.wizardInstall ?? null,
  );
}

/** Takes Chrome up on its offer; the offer is spent either way. */
export async function acceptInstall(prompt: InstallPrompt): Promise<void> {
  try {
    await prompt.prompt();
  } finally {
    window.wizardInstall = null;
    window.dispatchEvent(new Event("wizard-install"));
  }
}
