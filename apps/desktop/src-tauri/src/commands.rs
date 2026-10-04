//! What pages may ask of the app. The shell's own pages (splash, server choice, error) get the
//! first group through `capabilities/shell.json`; the chosen server's origin gets the second
//! group through the capability `window::enter` adds for it.

use std::thread;

use serde::Serialize;
use tauri::{AppHandle, Manager, WebviewWindow};
use tauri_plugin_opener::OpenerExt;

use crate::{
    i18n, log, sidecar,
    state::{self, Choice, Phase, Shell, CLOUD_URL},
    window,
};

#[derive(Serialize)]
pub struct ShellState {
    phase: Phase,
    choice: Option<Choice>,
    /// The remote server being reached while `connecting`.
    url: Option<String>,
    error: Option<String>,
    /// The end of the runtime's log while `failed`.
    log: String,
    /// The last lines of the installer while `installing`, and after it failed.
    progress: Vec<String>,
    cloud_url: &'static str,
    german: bool,
    version: String,
}

/// Makes a choice the current one and shows it.
pub fn apply(app: &AppHandle, choice: Choice) {
    state::store_choice(app, &choice);
    let shell = app.state::<Shell>();
    let mut inner = shell.inner.lock().unwrap();
    inner.choice = Some(choice.clone());
    inner.error = None;
    if choice == Choice::Local {
        let running = inner.sidecar.as_ref().map(|sidecar| sidecar.ready);
        if running == Some(false) {
            inner.phase = Phase::Starting;
        }
        drop(inner);
        match running {
            Some(true) => {
                window::show_local(app);
            }
            Some(false) => {}
            None => sidecar::start(app, true),
        }
        return;
    }
    // A remote server: the runtime on this machine does not run next to it.
    inner.phase = Phase::Connecting;
    inner.origin = None;
    drop(inner);
    let app = app.clone();
    thread::spawn(move || sidecar::stop(&app));
}

#[tauri::command]
pub fn shell_state(app: AppHandle) -> ShellState {
    let shell = app.state::<Shell>();
    let inner = shell.inner.lock().unwrap();
    let failed = inner.phase == Phase::Failed;
    ShellState {
        phase: inner.phase,
        choice: inner.choice.clone(),
        url: inner.choice.as_ref().and_then(Choice::remote_url),
        error: inner.error.clone(),
        log: if failed {
            log::runtime_tail(&app, 4_000)
        } else {
            String::new()
        },
        progress: inner.progress.clone(),
        cloud_url: CLOUD_URL,
        german: i18n::german(),
        version: app.package_info().version.to_string(),
    }
}

#[tauri::command]
pub fn choose_server(app: AppHandle, kind: String, url: Option<String>) -> Result<(), String> {
    let choice = match kind.as_str() {
        "local" => Choice::Local,
        "cloud" => Choice::Cloud,
        "custom" => Choice::Custom {
            url: state::server_url(&url.unwrap_or_default())?,
        },
        _ => return Err("invalid".into()),
    };
    apply(&app, choice);
    Ok(())
}

/// The shell page reached the remote server: show it.
#[tauri::command]
pub fn enter_server(app: AppHandle) -> Result<(), String> {
    let url = {
        let shell = app.state::<Shell>();
        let inner = shell.inner.lock().unwrap();
        if inner.phase != Phase::Connecting {
            return Err("not connecting".into());
        }
        inner.choice.as_ref().and_then(Choice::remote_url)
    }
    .ok_or("no remote server chosen")?;
    window::enter(&app, &url, &format!("{url}/"));
    Ok(())
}

#[tauri::command]
pub fn retry_start(app: AppHandle) {
    let local = {
        let shell = app.state::<Shell>();
        let inner = shell.inner.lock().unwrap();
        inner.phase == Phase::Failed && inner.choice == Some(Choice::Local)
    };
    if local {
        sidecar::start(&app, true);
    }
}

#[tauri::command]
pub fn open_logs(app: AppHandle) {
    let _ = app
        .opener()
        .open_path(log::dir(&app).to_string_lossy(), None::<&str>);
}

/// Opens an http(s) address in the person's own browser.
#[tauri::command]
pub fn open_external(app: AppHandle, url: String) -> Result<(), String> {
    window::open_external(&app, &url)
}

/// Shows the server choice again; the current server stays until another one is picked.
#[tauri::command]
pub fn open_server_choice(app: AppHandle) {
    {
        let shell = app.state::<Shell>();
        let mut inner = shell.inner.lock().unwrap();
        inner.phase = Phase::Choose;
        inner.origin = None;
    }
    window::show(&app);
    window::show_shell(&app);
}

#[tauri::command]
pub fn set_chrome(window: WebviewWindow, r: u8, g: u8, b: u8) {
    window::set_chrome(&window, r, g, b);
}

/// Debug builds with `ENGENTY_WIZARDS_PROBE=1`: what the page says it shows, into the log.
#[tauri::command]
pub fn probe_report(app: AppHandle, info: String) {
    if cfg!(debug_assertions) && std::env::var("ENGENTY_WIZARDS_PROBE").is_ok() {
        log::line(&app, format!("probe: {info}"));
    }
}
