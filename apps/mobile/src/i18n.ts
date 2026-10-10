import { getLocales } from "expo-localization";
import { useSyncExternalStore } from "react";

const en = {
  "brand.wizards": "wizards",
  "wizards.title": "Wizards",
  "wizards.empty": "No wizards yet",
  "wizards.emptyHint": "Scan a wizard's QR code or type its ID.",
  "wizards.add": "Add a wizard",
  "wizards.active": "Continue",
  "wizards.yours": "Your wizards",
  "wizards.running": "Running now",
  "wizards.waiting": "Waits for you",
  "wizards.lastRun": "Last run {date}",
  "wizards.remove": "Remove",
  "wizards.removeAsk": "Remove “{title}”? Its results stay on this phone.",
  "active.started": "started {time}",
  "active.step": "Step {done} of {total}",
  "active.continue": "Continue",
  "tabs.wizards": "Wizards",
  "tabs.results": "Results",
  "add.title": "Add a wizard",
  "add.scan": "Scan code",
  "add.scanHint": "Point the camera at a wizard's QR code.",
  "add.heading": "The wizard's ID",
  "add.id": "Enter ID",
  "add.idLabel": "The wizard's ID or link",
  "add.idHint": "8 letters and digits, under its QR code.",
  "add.paste": "Paste a link",
  "add.askedAt": "Asked at {host}",
  "add.find": "Find",
  "add.found": "Found",
  "add.add": "Add",
  "add.start": "Start",
  "add.notFound": "No wizard with this ID.",
  "add.invalid": "That is not a wizard's ID or link.",
  "add.otherHost": "This wizard runs on {host}, not on engenty.ai.",
  "add.unavailable": "This wizard can't be run right now.",
  "add.tooMany": "Too many tries. Please wait a while.",
  "scan.title": "Scan a code",
  "scan.hint": "Point the camera at the wizard's QR code.",
  "scan.fieldHint": "Point the camera at the code.",
  "scan.permission": "The camera shows the code to the app. Nothing is recorded.",
  "scan.allow": "Allow camera",
  "scan.light": "Light",
  "scan.close": "Close",
  "scan.notWizard": "This code is not a wizard's link.",
  "start.start": "Start",
  "start.resume": "Continue the run from {time}",
  "start.results": "Results of this wizard",
  "start.noResults": "No results yet",
  "start.new": "Start a new run",
  "start.steps": "Steps",
  "start.results2": "Results",
  "start.onPhone": "{n} on this phone",
  "start.runsOn": "Runs on",
  "start.by": "by {name}",
  "run.leave": "Close",
  "run.offline": "No connection. The run goes on on the server.",
  "run.retry": "Try again",
  "results.title": "Results",
  "results.today": "Today",
  "results.search": "Search",
  "results.share": "Share",
  "results.earlier": "Earlier",
  "results.empty": "No results yet",
  "results.emptyHint": "A finished run keeps its result here, also without a connection.",
  "results.expired": "link expired, files kept",
  "result.kept": "Kept on this phone",
  "result.linkUntil": "the link works until {date}",
  "result.linkGone": "the run is gone from the server",
  "result.shareLink": "Share link",
  "result.shareFiles": "Share files",
  "result.open": "Open",
  "result.openRun": "Open the run",
  "result.delete": "Delete result",
  "result.deleteAsk": "Delete this result and its files from this phone?",
  "result.saving": "Saving the files…",
  "result.ai": "AI",
  "result.notKept": "Not on this phone",
  "result.files": "Files",
  "result.keptUntil": "Kept on this phone. The link works until {date}.",
  "result.keptGone": "Kept on this phone. The run is gone from the server.",
  "result.keptOnly": "Kept on this phone.",
  "result.fetch": "Fetch",
  "settings.title": "Settings",
  "settings.language": "Language",
  "settings.notifications": "Notifications",
  "settings.notifyLabel": "When a wizard is done or waits for you",
  "settings.notifyFoot": "Told when a wizard is done or waits for you, also with the app closed.",
  "settings.about": "About",
  "settings.server": "Server",
  "settings.storage": "Results on this phone",
  "settings.used": "Storage used",
  "settings.deleteAll": "Delete all results",
  "settings.deleteAllAsk": "Delete every result on this phone? The wizards stay.",
  "settings.ids": "Wizard IDs",
  "settings.askedAt": "Asked at",
  "settings.runtimeHint":
    "The server that answers IDs. engenty.ai unless your wizards run on a server of their own.",
  "settings.version": "engenty wizards {version}",
  "common.cancel": "Cancel",
  "common.delete": "Delete",
  "common.back": "Back",
  "common.save": "Save",
  "common.offline": "No connection.",
  "notify.done": "“{title}” is done",
  "notify.doneBody": "Your result is ready.",
} as const;

type Key = keyof typeof en;

const de: Record<Key, string> = {
  "brand.wizards": "wizards",
  "wizards.title": "Wizards",
  "wizards.empty": "Noch keine Wizards",
  "wizards.emptyHint": "Scanne den QR-Code eines Wizards oder tippe seine ID ein.",
  "wizards.add": "Wizard hinzufügen",
  "wizards.active": "Weitermachen",
  "wizards.yours": "Deine Wizards",
  "wizards.running": "Läuft gerade",
  "wizards.waiting": "Wartet auf dich",
  "wizards.lastRun": "Zuletzt {date}",
  "wizards.remove": "Entfernen",
  "wizards.removeAsk": "„{title}“ entfernen? Seine Ergebnisse bleiben auf dem Handy.",
  "active.started": "gestartet {time}",
  "active.step": "Schritt {done} von {total}",
  "active.continue": "Weiter",
  "tabs.wizards": "Wizards",
  "tabs.results": "Ergebnisse",
  "add.title": "Wizard hinzufügen",
  "add.scan": "Code scannen",
  "add.scanHint": "Die Kamera auf den QR-Code eines Wizards richten.",
  "add.heading": "Die ID des Wizards",
  "add.id": "ID eingeben",
  "add.idLabel": "ID oder Link des Wizards",
  "add.idHint": "8 Buchstaben und Ziffern, unter seinem QR-Code.",
  "add.paste": "Link einfügen",
  "add.askedAt": "Gefragt bei {host}",
  "add.find": "Suchen",
  "add.found": "Gefunden",
  "add.add": "Hinzufügen",
  "add.start": "Starten",
  "add.notFound": "Kein Wizard mit dieser ID.",
  "add.invalid": "Das ist keine ID und kein Link eines Wizards.",
  "add.otherHost": "Dieser Wizard läuft auf {host}, nicht auf engenty.ai.",
  "add.unavailable": "Dieser Wizard ist gerade nicht verfügbar.",
  "add.tooMany": "Zu viele Versuche. Bitte warte eine Weile.",
  "scan.title": "Code scannen",
  "scan.hint": "Halte die Kamera auf den QR-Code des Wizards.",
  "scan.fieldHint": "Halte die Kamera auf den Code.",
  "scan.permission": "Die Kamera zeigt der App den Code. Nichts wird aufgenommen.",
  "scan.allow": "Kamera erlauben",
  "scan.light": "Licht",
  "scan.close": "Schließen",
  "scan.notWizard": "Dieser Code ist kein Link eines Wizards.",
  "start.start": "Starten",
  "start.resume": "Durchlauf von {time} fortsetzen",
  "start.results": "Ergebnisse dieses Wizards",
  "start.noResults": "Noch keine Ergebnisse",
  "start.new": "Neuen Durchlauf starten",
  "start.steps": "Schritte",
  "start.results2": "Ergebnisse",
  "start.onPhone": "{n} auf diesem Handy",
  "start.runsOn": "Läuft auf",
  "start.by": "von {name}",
  "run.leave": "Schließen",
  "run.offline": "Keine Verbindung. Der Durchlauf geht auf dem Server weiter.",
  "run.retry": "Nochmal versuchen",
  "results.title": "Ergebnisse",
  "results.today": "Heute",
  "results.search": "Suchen",
  "results.share": "Teilen",
  "results.earlier": "Früher",
  "results.empty": "Noch keine Ergebnisse",
  "results.emptyHint": "Ein fertiger Durchlauf behält sein Ergebnis hier, auch ohne Verbindung.",
  "results.expired": "Link abgelaufen, Dateien behalten",
  "result.kept": "Auf diesem Handy gespeichert",
  "result.linkUntil": "der Link gilt bis {date}",
  "result.linkGone": "der Durchlauf ist vom Server gelöscht",
  "result.shareLink": "Link teilen",
  "result.shareFiles": "Dateien teilen",
  "result.open": "Öffnen",
  "result.openRun": "Durchlauf öffnen",
  "result.delete": "Ergebnis löschen",
  "result.deleteAsk": "Dieses Ergebnis und seine Dateien vom Handy löschen?",
  "result.saving": "Dateien werden gespeichert…",
  "result.ai": "KI",
  "result.notKept": "Nicht auf dem Handy",
  "result.files": "Dateien",
  "result.keptUntil": "Auf diesem Handy gespeichert. Der Link gilt bis {date}",
  "result.keptGone": "Auf diesem Handy gespeichert. Der Durchlauf ist vom Server gelöscht.",
  "result.keptOnly": "Auf diesem Handy gespeichert.",
  "result.fetch": "Laden",
  "settings.title": "Einstellungen",
  "settings.language": "Sprache",
  "settings.notifications": "Benachrichtigungen",
  "settings.notifyLabel": "Wenn ein Wizard fertig ist oder auf dich wartet",
  "settings.notifyFoot":
    "Du hörst, wenn ein Wizard fertig ist oder auf dich wartet, auch bei geschlossener App.",
  "settings.about": "Über",
  "settings.server": "Server",
  "settings.storage": "Ergebnisse auf diesem Handy",
  "settings.used": "Belegter Speicher",
  "settings.deleteAll": "Alle Ergebnisse löschen",
  "settings.deleteAllAsk": "Alle Ergebnisse auf diesem Handy löschen? Die Wizards bleiben.",
  "settings.ids": "Wizard-IDs",
  "settings.askedAt": "Gefragt bei",
  "settings.runtimeHint":
    "Der Server, der IDs beantwortet. engenty.ai, außer deine Wizards laufen auf einem eigenen Server.",
  "settings.version": "engenty wizards {version}",
  "common.cancel": "Abbrechen",
  "common.delete": "Löschen",
  "common.back": "Zurück",
  "common.save": "Speichern",
  "common.offline": "Keine Verbindung.",
  "notify.done": "„{title}“ ist fertig",
  "notify.doneBody": "Dein Ergebnis ist bereit.",
};

export type Lang = "en" | "de";

const listeners = new Set<() => void>();

export let lang: Lang = getLocales()[0]?.languageCode === "de" ? "de" : "en";

export function setLang(next: Lang) {
  lang = next;
  for (const listener of listeners) {
    listener();
  }
}

/** Re-renders a screen when the language changes. */
export function useLang(): Lang {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => lang,
  );
}

export function t(key: Key, vars: Record<string, string | number> = {}): string {
  const text: string = (lang === "de" ? de : en)[key] ?? en[key];
  return text.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? ""));
}

const locale = () => (lang === "de" ? "de-AT" : "en-GB");

export const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" });

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString(locale(), { day: "numeric", month: "short" });

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${Math.max(0, Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}
