import { noteText, type RunNote } from "@engenty-wizards/shared/run";
import { useSyncExternalStore } from "react";

/**
 * What the runner says to the person running a wizard, in German and English. The studio spreads
 * these into its own dictionary; a host without one (the WordPress plugin) uses them as they are.
 */
const de = {
  "share.copied": "Kopiert",
  "run.closed": "Hier gerade nicht verfügbar, dafür fehlt: {list}",
  "slot.later": "Spätere Termine zeigen",
  "slot.none": "Gerade sind keine Termine frei.",
  "run.cls.text": "Text",
  "run.cls.image": "Bilder",
  "run.cls.video": "Videos",
  "run.cls.speech": "Sprachausgabe",
  "run.cls.audio": "Sprachnotizen",
  "run.cls.account": "ein engenty-Konto",
  "run.next": "Weiter",
  "run.back": "Zurück",
  "run.accept": "Passt so",
  "run.edit": "Bearbeiten",
  "run.pickItem": "Nr. {n}",
  "run.pickedItem": "Nr. {n} neu",
  "run.regeneratePicked": "Neu erstellt wird nur Nr. {n}.",
  "run.regenerateAll":
    "Alle werden neu erstellt. Tippe oben auf eine Nummer, um nur einzelne zu erneuern.",
  "check.progress": "{done} von {total} geprüft",
  "check.onlyOpen": "Nur offene",
  "check.noFile": "Zu dieser Zeile gibt es keine Datei.",
  "check.noPreview": "Für diese Datei gibt es keine Vorschau – öffne sie mit dem Link oben.",
  "check.reopen": "Wieder offen",
  "run.feedbackPlaceholder": "Passt etwas nicht? Schreib, was anders sein soll …",
  "run.feedbackTarget": "Was soll sich ändern?",
  "run.feedbackPick": "Wähle oben, was sich ändern soll.",
  "ai.generated": "KI-generiert",
  "ai.modified": "Mit KI verändert",
  "ai.publish":
    "Mit KI erstellt: Wer das veröffentlicht, muss es als KI-generiert kennzeichnen (EU AI Act, Art. 50). Die Datei trägt die Kennzeichnung bereits in ihren Metadaten.",
  "run.regenerateGo": "Neu erstellen",
  "run.retry": "Erneut versuchen",
  "run.again": "Nochmal",
  "run.copy": "Text kopieren",
  "run.failed": "Da hat etwas nicht geklappt.",
  "run.notFound": "Diesen Wizard gibt es nicht (mehr).",
  "run.working": "Einen Moment …",
  "run.elapsed": "{s} s",
  "run.cancelled": "Abgebrochen.",
  "run.addRow": "Zeile hinzufügen",
  "run.upload": "Datei wählen oder hierher ziehen",
  "run.uploading": "Lädt hoch …",
  "run.net": "Netto",
  "run.vat": "USt. {r} %",
  "run.total": "Gesamt",
  "run.uploadMore": "Weitere Datei",
  "run.camera": "Kamera",
  "camera.title": "Mit der Kamera aufnehmen",
  "camera.hint": "Gerade und gut beleuchtet ins Bild halten.",
  "camera.taken": "{n} aufgenommen",
  "camera.shoot": "Aufnehmen",
  "camera.done": "Fertig",
  "camera.denied":
    "Die Kamera ist für diese Seite nicht freigegeben. Erlaube sie in den Website-Einstellungen deines Browsers (Schloss-Symbol in der Adresszeile) – oder nimm das Foto mit der Kamera-App auf.",
  "connect.go": "Verbinden",
  "connect.connected": "Verbunden über {name}",
  "connect.disconnect": "Trennen",
  "connect.none": "Auf diesem Server ist noch kein Anbieter zum Verbinden eingerichtet.",
  "connect.openLink": "Hier klicken, um die Anmeldung in einem neuen Tab zu öffnen",
  "list.empty": "Noch keine Einträge.",
  "list.delete": "Zeile löschen",
  "ask.typeInto": "Text in die Seite tippen …",
  "ask.hide": "verdeckt",
  "ask.up": "Nach oben",
  "ask.down": "Nach unten",
  "ask.pictureHint":
    "Das ist die Seite, die der Wizard geöffnet hat. Du kannst auch direkt ins Bild klicken und tippen.",
  "ask.remember": "Anmeldung für nächstes Mal merken",
  "ask.private":
    "Was du eingibst, geht direkt in die Seite. Die KI bekommt es nicht zu sehen. Gemerkte Anmeldungen werden verschlüsselt gespeichert.",
  "ask.skip": "Überspringen",
  "ask.done": "Ich bin angemeldet",
  "ask.signIn": "Anmelden",
  "ask.wants": "Der Wizard möchte in {service} Folgendes ausführen:",
  "ask.allowRest": "Für den Rest dieses Durchlaufs erlauben",
  "ask.allow": "Erlauben",
  "ask.deny": "Nicht erlauben",
  "store.open": "Was dieser Wizard sich merkt",
  "store.title": "Gespeichert für dich",
  "store.explain":
    "Dieser Wizard merkt sich Listen, Dateien und verbundene Konten für deinen nächsten Durchlauf. Nur du siehst sie.",
  "store.empty": "Noch nichts gespeichert.",
  "store.rows": "{n} Einträge",
  "store.signIns": "Gemerkte Anmeldungen im Browser",
  "store.files": "{n} Dateien · {size}",
  "store.delete": "Alles löschen",
  "store.confirmDelete": "Wirklich alles löschen",
  "common.close": "Schließen",
  "run.uploadTouch": "Datei wählen",
  "run.maxFiles": "Hier gehen höchstens {n} – die übrigen habe ich weggelassen.",
  "run.filesMin": "{n} von mindestens {min}",
  "run.filesOf": "{n} von höchstens {max}",
  "run.moveFile": "Nr. {n} verschieben",
  "run.moveFileHint": "Ziehen, um die Reihenfolge zu ändern",
  "run.removeFile": "Entfernen",
  "run.awake": "Der Bildschirm bleibt an, solange der Wizard arbeitet.",
  "run.openFull": "Groß öffnen",
  "run.yes": "Ja",
  "run.no": "Nein",
  "run.share": "Teilen",
  "run.shareNow": "Jetzt teilen",
  "run.shareFile": "Als Datei teilen oder in einer App öffnen",
  "run.print": "Drucken",
  "camera.asking": "Dein Browser fragt gleich nach der Kamera. Das Bild bleibt in diesem Wizard.",
  "camera.native": "Kamera-App öffnen",
  "camera.pick": "Foto auswählen",
  "camera.torch": "Licht",
  "camera.flip": "Kamera wechseln",
  "camera.photo": "Foto",
  "camera.video": "Video",
  "camera.record": "Aufnahme starten",
  "camera.stop": "Aufnahme beenden",
  "camera.recording": "Nimmt auf – tippe zum Beenden.",
  "camera.clipHint": "Ein kurzer Clip, höchstens {s} Sekunden.",
  "camera.hintMany": "Seite für Seite aufnehmen, dann „Fertig“.",
  "scan.button": "Scannen",
  "scan.title": "Code scannen",
  "scan.asking": "Dein Browser fragt gleich nach der Kamera – sie liest nur den Code.",
  "scan.hint": "Halte den QR- oder Strichcode in den Rahmen.",
  "scan.hintQr": "Halte den QR-Code in den Rahmen. Strichcodes liest dieses Gerät hier nicht.",
  "scan.miss": "Auf dem Foto war kein Code zu erkennen. Versuch es näher und schärfer.",
  "scan.fromPhoto": "Foto mit dem Code wählen",
  "scan.typeInstead": "Lieber eintippen",
  "location.use": "Meinen Standort übernehmen",
  "location.locating": "Standort wird bestimmt …",
  "location.refining": "wird noch genauer …",
  "location.accuracy": "auf etwa {m} m genau",
  "location.map": "Karte",
  "location.remove": "Standort entfernen",
  "location.why":
    "Dein Browser fragt nach deinem Standort. Er wird nur für diesen Wizard verwendet. Du kannst auch einfach die Adresse eintippen.",
  "location.denied":
    "Der Standort ist für diese Seite nicht freigegeben. Erlaube ihn in den Website-Einstellungen deines Browsers (Schloss-Symbol in der Adresszeile) – oder tippe die Adresse unten ein.",
  "location.manual": "Adresse oder Ort eintippen",
  "location.label": "Adresse oder Beschreibung des Orts",
  "voice.start": "Sprachnotiz aufnehmen",
  "voice.stop": "Stopp",
  "voice.recording": "Aufnahme läuft …",
  "voice.left": "noch {s} s",
  "voice.again": "Neu aufnehmen",
  "voice.remove": "Löschen",
  "voice.pick": "Audiodatei wählen",
  "voice.why":
    "Dein Browser fragt nach dem Mikrofon. Die Aufnahme wird danach in Text umgewandelt.",
  "voice.denied":
    "Das Mikrofon ist für diese Seite nicht freigegeben. Erlaube es in den Website-Einstellungen deines Browsers – oder nimm die Notiz mit der Diktier-App auf und wähle die Datei.",
  "voice.noRecorder":
    "Dieser Browser kann hier nicht aufnehmen. Nimm die Notiz mit der Diktier-App auf und wähle die Datei.",
  "sign.open": "Hier unterschreiben",
  "sign.hint": "Mit dem Finger unterschreiben",
  "sign.pad": "Unterschriftsfeld",
  "sign.clear": "Löschen",
  "sign.accept": "Übernehmen",
  "sign.again": "Neu unterschreiben",
  "sign.remove": "Unterschrift entfernen",
  "notify.ask": "Bescheid geben, wenn es fertig ist",
  "notify.on": "Du bekommst Bescheid",
  "notify.why":
    "Mit Ton, Vibration oder einer Mitteilung. Dein Browser fragt dafür einmal um Erlaubnis.",
  "notify.onHint": "Du kannst die App wechseln – eine Mitteilung holt dich zurück.",
  "notify.quiet": "Mit Ton und Vibration, solange diese Seite offen ist.",
  "notify.blocked":
    "Mitteilungen sind für diese Seite blockiert – es gibt Ton und Vibration, solange sie offen ist. Erlauben kannst du sie in den Website-Einstellungen deines Browsers.",
  "notify.done": "Dein Ergebnis ist fertig.",
  "notify.next": "Es geht weiter – wirf einen Blick darauf.",
  "notify.needsYou": "Der Wizard braucht dich kurz.",
  "common.offline": "Keine Verbindung. Prüfe dein Netz und versuch es noch einmal.",
  "common.retry": "Erneut versuchen",
  "common.cancel": "Abbrechen",
  "run.start": "Los geht's",
  "run.unavailable": "Dieser Wizard ist gerade nicht verfügbar.",
  "run.resume": "Letzten Durchlauf fortsetzen",
};

export type RunnerKey = keyof typeof de;

const en: Record<RunnerKey, string> = {
  "share.copied": "Copied",
  "run.closed": "Not available here right now, it needs: {list}",
  "slot.later": "Show later times",
  "slot.none": "No times are free right now.",
  "run.cls.text": "text",
  "run.cls.image": "images",
  "run.cls.video": "video",
  "run.cls.speech": "speech output",
  "run.cls.audio": "voice notes",
  "run.cls.account": "an engenty account",
  "run.next": "Continue",
  "run.back": "Back",
  "run.accept": "Looks good",
  "run.edit": "Edit",
  "run.pickItem": "No. {n}",
  "run.pickedItem": "No. {n} again",
  "run.regeneratePicked": "Only no. {n} will be made again.",
  "run.regenerateAll": "Applies to all. Tap a number to change single ones only.",
  "check.progress": "{done} of {total} checked",
  "check.onlyOpen": "Open only",
  "check.noFile": "There is no file for this row.",
  "check.noPreview": "This file has no preview – open it with the link above.",
  "check.reopen": "Open again",
  "run.feedbackPlaceholder": "Something not right? Write what should be different …",
  "run.feedbackTarget": "What should change?",
  "run.feedbackPick": "Pick above what should change.",
  "ai.generated": "AI generated",
  "ai.modified": "AI modified",
  "ai.publish":
    "Made with AI: whoever publishes this has to label it as AI-generated (EU AI Act, Art. 50). The file already carries the marking in its metadata.",
  "run.regenerateGo": "Recreate",
  "run.retry": "Try again",
  "run.again": "Start over",
  "run.copy": "Copy text",
  "run.failed": "Something went wrong.",
  "run.notFound": "This wizard does not exist (anymore).",
  "run.working": "One moment …",
  "run.elapsed": "{s} s",
  "run.cancelled": "Cancelled.",
  "run.addRow": "Add row",
  "run.upload": "Choose a file or drop it here",
  "run.uploading": "Uploading …",
  "run.net": "Net",
  "run.vat": "VAT {r} %",
  "run.total": "Total",
  "run.uploadMore": "Another file",
  "run.camera": "Camera",
  "camera.title": "Take a picture",
  "camera.hint": "Hold it flat and well lit.",
  "camera.taken": "{n} taken",
  "camera.shoot": "Capture",
  "camera.done": "Done",
  "camera.denied":
    "The camera is not allowed for this page. Allow it in your browser's site settings (the lock icon in the address bar) — or take the photo with your camera app.",
  "connect.go": "Connect",
  "connect.connected": "Connected through {name}",
  "connect.disconnect": "Disconnect",
  "connect.none": "No provider is set up for connecting on this server yet.",
  "connect.openLink": "Click here to open the sign-in in a new tab",
  "list.empty": "No entries yet.",
  "list.delete": "Delete row",
  "ask.typeInto": "Type into the page …",
  "ask.hide": "hidden",
  "ask.up": "Scroll up",
  "ask.down": "Scroll down",
  "ask.pictureHint":
    "This is the page the wizard has open. You can also click and type right in the picture.",
  "ask.remember": "Remember this sign-in for next time",
  "ask.private":
    "What you enter goes straight into the page. The AI never sees it. Remembered sign-ins are stored encrypted.",
  "ask.skip": "Skip",
  "ask.done": "I am signed in",
  "ask.signIn": "Sign in",
  "ask.wants": "The wizard wants to run this in {service}:",
  "ask.allowRest": "Allow for the rest of this run",
  "ask.allow": "Allow",
  "ask.deny": "Don't allow",
  "store.open": "What this wizard remembers",
  "store.title": "Kept for you",
  "store.explain":
    "This wizard keeps lists, files and connected accounts for your next run. Only you see them.",
  "store.empty": "Nothing kept yet.",
  "store.rows": "{n} entries",
  "store.signIns": "Remembered sign-ins in the browser",
  "store.files": "{n} files · {size}",
  "store.delete": "Delete everything",
  "store.confirmDelete": "Really delete everything",
  "common.close": "Close",
  "run.uploadTouch": "Choose a file",
  "run.maxFiles": "At most {n} fit here – I left out the rest.",
  "run.filesMin": "{n} of at least {min}",
  "run.filesOf": "{n} of at most {max}",
  "run.moveFile": "Move no. {n}",
  "run.moveFileHint": "Drag to change the order",
  "run.removeFile": "Remove",
  "run.awake": "The screen stays on while the wizard works.",
  "run.openFull": "Open full size",
  "run.yes": "Yes",
  "run.no": "No",
  "run.share": "Share",
  "run.shareNow": "Share now",
  "run.shareFile": "Share as a file or open in an app",
  "run.print": "Print",
  "camera.asking": "Your browser is about to ask for the camera. The picture stays in this wizard.",
  "camera.native": "Open the camera app",
  "camera.pick": "Choose a photo",
  "camera.torch": "Light",
  "camera.flip": "Switch camera",
  "camera.photo": "Photo",
  "camera.video": "Video",
  "camera.record": "Start recording",
  "camera.stop": "Stop recording",
  "camera.recording": "Recording — tap to stop.",
  "camera.clipHint": "A short clip, {s} seconds at most.",
  "camera.hintMany": "Capture page after page, then “Done”.",
  "scan.button": "Scan",
  "scan.title": "Scan a code",
  "scan.asking": "Your browser is about to ask for the camera — it only reads the code.",
  "scan.hint": "Hold the QR code or barcode inside the frame.",
  "scan.hintQr": "Hold the QR code inside the frame. This device does not read barcodes here.",
  "scan.miss": "No code was found in the photo. Try closer and sharper.",
  "scan.fromPhoto": "Choose a photo of the code",
  "scan.typeInstead": "Type it instead",
  "location.use": "Use my location",
  "location.locating": "Finding your location …",
  "location.refining": "getting more exact …",
  "location.accuracy": "exact to about {m} m",
  "location.map": "Map",
  "location.remove": "Remove location",
  "location.why":
    "Your browser asks for your location. It is only used for this wizard. You can also just type the address.",
  "location.denied":
    "Location is not allowed for this page. Allow it in your browser's site settings (the lock icon in the address bar) — or type the address below.",
  "location.manual": "Type an address or place",
  "location.label": "Address or description of the place",
  "voice.start": "Record a voice note",
  "voice.stop": "Stop",
  "voice.recording": "Recording …",
  "voice.left": "{s} s left",
  "voice.again": "Record again",
  "voice.remove": "Delete",
  "voice.pick": "Choose an audio file",
  "voice.why":
    "Your browser asks for the microphone. The recording is turned into text afterwards.",
  "voice.denied":
    "The microphone is not allowed for this page. Allow it in your browser's site settings — or record the note with your voice memo app and choose the file.",
  "voice.noRecorder":
    "This browser cannot record here. Record the note with your voice memo app and choose the file.",
  "sign.open": "Sign here",
  "sign.hint": "Sign with your finger",
  "sign.pad": "Signature pad",
  "sign.clear": "Clear",
  "sign.accept": "Use it",
  "sign.again": "Sign again",
  "sign.remove": "Remove signature",
  "notify.ask": "Tell me when it is done",
  "notify.on": "You will be told",
  "notify.why": "With a sound, a buzz or a notification. Your browser asks once for permission.",
  "notify.onHint": "You can switch apps — a notification brings you back.",
  "notify.quiet": "With a sound and a buzz while this page is open.",
  "notify.blocked":
    "Notifications are blocked for this page — you get a sound and a buzz while it is open. You can allow them in your browser's site settings.",
  "notify.done": "Your result is ready.",
  "notify.next": "It goes on — have a look.",
  "notify.needsYou": "The wizard needs you for a moment.",
  "common.offline": "No connection. Check your network and try again.",
  "common.retry": "Try again",
  "common.cancel": "Cancel",
  "run.start": "Let's go",
  "run.unavailable": "This wizard is not available right now.",
  "run.resume": "Continue your last run",
};

export const RUNNER_TEXTS = { de, en } as const;

export type Lang = "de" | "en";

/** The language the runner speaks: set by the host (`configureRunner`, `setRunnerLang`). */
export let lang: Lang = "de";

let dict: Record<RunnerKey, string> = de;
const listeners = new Set<() => void>();

export function setRunnerLang(next: Lang) {
  if (next === lang) {
    return;
  }
  lang = next;
  dict = next === "de" ? de : en;
  for (const listener of listeners) {
    listener();
  }
}

/** The language, for a component that must render again when it changes. */
export function useRunnerLang(): Lang {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => lang,
  );
}

/** What a run reports, in the language the person reads: its note where it has one. */
export function eventText(ev: { message: string; note?: RunNote | null }): string {
  return (ev.note && noteText(ev.note, lang)) || ev.message;
}

export function t(key: RunnerKey, vars?: Record<string, string | number>): string {
  let s: string = dict[key] ?? de[key] ?? key;
  for (const [k, v] of Object.entries(vars ?? {})) {
    s = s.replace(`{${k}}`, String(v));
  }
  return s;
}
