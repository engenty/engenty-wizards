// The app's own page: splash while the built-in runtime starts, the server choice, and what
// went wrong. It asks the app for its state and shows it; the app loads the server into the
// window once there is one.
const invoke = (command, args) => window.__TAURI_INTERNALS__.invoke(command, args);
const $ = (id) => document.getElementById(id);
const mac = /Mac/i.test(navigator.platform);

const TEXT = {
  de: {
    lead: "Wo sollen deine Wizards laufen?",
    localTitle: mac ? "Dieser Mac" : "Dieser Computer",
    localHint: "Die App bringt alles mit. Deine Wizards und Daten bleiben auf diesem Gerät.",
    customTitle: "Eigener Server",
    customHint: "Die Adresse eines Servers, auf dem engenty wizards läuft.",
    cloudTitle: "engenty Cloud",
    go: "Weiter",
    starting: "Der Server auf diesem Gerät startet …",
    connecting: (host) => `Verbinde mit ${host} …`,
    opening: "Das Studio wird geöffnet …",
    failedLocal: "Der Server auf diesem Gerät ist nicht gestartet.",
    unreachable: (host) => `${host} ist nicht erreichbar.`,
    retry: "Erneut versuchen",
    logs: "Protokolle anzeigen",
    choose: "Server wechseln…",
    invalid: "Das ist keine gültige Adresse.",
    insecure: "Die Adresse muss mit https:// beginnen.",
  },
  en: {
    lead: "Where should your wizards run?",
    localTitle: mac ? "This Mac" : "This computer",
    localHint: "The app brings everything along. Your wizards and data stay on this device.",
    customTitle: "Own server",
    customHint: "The address of a server that runs engenty wizards.",
    cloudTitle: "engenty Cloud",
    go: "Continue",
    starting: "The server on this device is starting …",
    connecting: (host) => `Connecting to ${host} …`,
    opening: "Opening the studio …",
    failedLocal: "The server on this device did not start.",
    unreachable: (host) => `${host} cannot be reached.`,
    retry: "Try again",
    logs: "Show logs",
    choose: "Change server…",
    invalid: "This is not a valid address.",
    insecure: "The address must start with https://.",
  },
};

let t = TEXT.de;
let state = null;
let shown = "";
/** The remote server that did not answer; cleared by "try again" or another choice. */
let unreachable = null;
let reaching = null;

const hostOf = (url) => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

function view(name) {
  for (const id of ["wait", "choose", "failed"]) {
    $(id).hidden = id !== name;
  }
}

function fillChoice() {
  $("choose-lead").textContent = t.lead;
  $("local-title").textContent = t.localTitle;
  $("local-hint").textContent = t.localHint;
  $("custom-title").textContent = t.customTitle;
  $("custom-hint").textContent = t.customHint;
  $("cloud-title").textContent = t.cloudTitle;
  $("cloud-hint").textContent = hostOf(state.cloud_url);
  $("choose-go").textContent = t.go;
  $("choose-error").hidden = true;
  const kind = state.choice?.kind ?? "local";
  $("choose").elements.kind.value = kind;
  if (kind === "custom") {
    $("custom-url").value = state.choice.url;
  }
}

/** A remote server is shown once it answers at all; who may use it is the server's business. */
async function reach(url) {
  if (reaching === url) {
    return;
  }
  reaching = url;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    await fetch(`${url}/api/health`, { mode: "no-cors", cache: "no-store", signal: controller.signal });
    await invoke("enter_server");
  } catch {
    unreachable = url;
  } finally {
    clearTimeout(timer);
    reaching = null;
    void tick();
  }
}

function render() {
  t = state.german ? TEXT.de : TEXT.en;
  document.documentElement.lang = state.german ? "de" : "en";
  $("version").textContent = state.version;
  $("failed-retry").textContent = t.retry;
  $("failed-logs").textContent = t.logs;
  $("failed-choose").textContent = t.choose;
  $("app").hidden = false;

  if (state.phase === "choose") {
    fillChoice();
    return view("choose");
  }
  if (state.phase === "failed") {
    $("failed-text").textContent = [t.failedLocal, state.error].filter(Boolean).join(" ");
    $("failed-log").textContent = state.log.trim();
    $("failed-log").hidden = !state.log.trim();
    $("failed-log").scrollTop = $("failed-log").scrollHeight;
    $("failed-logs").hidden = false;
    return view("failed");
  }
  if (state.phase === "connecting" && unreachable === state.url) {
    $("failed-text").textContent = t.unreachable(hostOf(state.url));
    $("failed-log").hidden = true;
    $("failed-logs").hidden = true;
    return view("failed");
  }
  $("wait-text").textContent =
    state.phase === "starting"
      ? t.starting
      : state.phase === "connecting"
        ? t.connecting(hostOf(state.url))
        : t.opening;
  view("wait");
  if (state.phase === "connecting") {
    void reach(state.url);
  }
}

async function tick() {
  state = await invoke("shell_state");
  const key = `${JSON.stringify(state)}|${unreachable}`;
  if (key !== shown) {
    shown = key;
    render();
  }
}

$("choose").addEventListener("submit", async (event) => {
  event.preventDefault();
  const kind = $("choose").elements.kind.value;
  try {
    unreachable = null;
    await invoke("choose_server", { kind, url: kind === "custom" ? $("custom-url").value : null });
    await tick();
  } catch (error) {
    $("choose-error").textContent = error === "insecure" ? t.insecure : t.invalid;
    $("choose-error").hidden = false;
  }
});
$("custom-url").addEventListener("focus", () => {
  $("choose").elements.kind.value = "custom";
});
$("failed-retry").addEventListener("click", async () => {
  if (state.phase === "failed") {
    await invoke("retry_start");
  } else {
    unreachable = null;
  }
  void tick();
});
$("failed-logs").addEventListener("click", () => void invoke("open_logs"));
$("failed-choose").addEventListener("click", async () => {
  await invoke("open_server_choice");
  void tick();
});

void tick();
setInterval(() => void tick(), 400);
