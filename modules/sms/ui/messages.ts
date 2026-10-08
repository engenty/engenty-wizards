/** The studio half's words. `de` is the source. */
export const messages = {
  de: {
    title: "SMS",
    intro:
      "Wizards laufen per SMS auf der eigenen Nummer: eine Frage pro Nachricht, Auswahl als Nummern, Bilder und Dateien als Link. Dafür braucht es ein Twilio-Konto mit einer SMS-fähigen Nummer.",
    accountSid: "Account SID",
    accountSidHint: "Aus der Twilio-Konsole, beginnt mit AC.",
    token: "Auth Token",
    tokenHint:
      "Der Auth Token des Kontos. Damit wird auch jede Nachricht von Twilio auf ihre Signatur geprüft.",
    tokenKept: "Ist hinterlegt. Leer lassen, um ihn zu behalten.",
    number: "Nummer",
    numberHint: "Die Twilio-Nummer, von der die Texte kommen, mit Ländervorwahl: +43660…",
    save: "Speichern",
    saved: "Gespeichert.",
    disconnect: "Trennen",
    twilio: "In Twilio eintragen",
    twilioHint:
      "Bei der Nummer unter Messaging → „A message comes in“: diese Adresse, als Webhook mit HTTP POST.",
    webhook: "Webhook-Adresse",
    copy: "Kopieren",
    copied: "Kopiert",
    testTo: "Test-SMS an",
    sendTest: "Senden",
    testSent: "Angekommen? Dann passt alles.",
    keyword: "Stichwort",
    keywordHint:
      "Wer dieses Wort an die Nummer schreibt, startet den Wizard. Der Link und der QR-Code tippen es vor.",
    link: "Link",
    error_bad_keyword:
      "Ein Stichwort besteht aus Buchstaben, Ziffern, Leerzeichen und Bindestrichen, bis zu 40.",
    error_keyword_taken: "Ein anderer Wizard hat dieses Stichwort schon.",
    error_no_token: "Es braucht einen Auth Token.",
    error_provider: "Twilio hat die Nachricht nicht angenommen: {message}",
    error_other: "{message}",
  },
  en: {
    title: "SMS",
    intro:
      "Wizards run by text message on your own number: one question per text, choices as numbers, pictures and files as links. It takes a Twilio account with a number that can text.",
    accountSid: "Account SID",
    accountSidHint: "From the Twilio console, starts with AC.",
    token: "Auth token",
    tokenHint:
      "The account's auth token. It also checks every message from Twilio for its signature.",
    tokenKept: "Is set. Leave empty to keep it.",
    number: "Number",
    numberHint: "The Twilio number the texts come from, with the country code: +43660…",
    save: "Save",
    saved: "Saved.",
    disconnect: "Disconnect",
    twilio: "Enter in Twilio",
    twilioHint:
      "On the number under Messaging → “A message comes in”: this address, as a webhook with HTTP POST.",
    webhook: "Webhook address",
    copy: "Copy",
    copied: "Copied",
    testTo: "Test text to",
    sendTest: "Send",
    testSent: "Arrived? Then everything is set.",
    keyword: "Keyword",
    keywordHint:
      "Whoever texts this word to the number starts the wizard. The link and the QR code type it for them.",
    link: "Link",
    error_bad_keyword: "A keyword is letters, digits, spaces and dashes, up to 40.",
    error_keyword_taken: "Another wizard has this keyword already.",
    error_no_token: "An auth token is needed.",
    error_provider: "Twilio did not take the message: {message}",
    error_other: "{message}",
  },
} as const;
