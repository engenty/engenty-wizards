//! The one window: what it may load, where links, popups and downloads go.

use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex, OnceLock,
    },
    time::Instant,
};

use tauri::{
    ipc::CapabilityBuilder,
    webview::{
        DownloadEvent, NewWindowResponse, PageLoadEvent, PermissionKind, PermissionResponse,
    },
    window::Color,
    AppHandle, Manager, Url, WebviewUrl, WebviewWindow, WebviewWindowBuilder,
};
use tauri_plugin_opener::OpenerExt;

use crate::{
    log,
    state::{origin_of, Phase, Shell},
};

pub const MAIN: &str = "main";
const BRIDGE: &str = include_str!("bridge.js");
/// The studio's light page colour, shown until a page reports its own.
const PAPER: Color = Color(250, 248, 245, 255);

static LAUNCHED: OnceLock<Instant> = OnceLock::new();
static FIRST_LOAD: AtomicBool = AtomicBool::new(false);
static DOWNLOADS: Mutex<Option<HashMap<String, PathBuf>>> = Mutex::new(None);

pub fn mark_launch() {
    let _ = LAUNCHED.set(Instant::now());
}

pub fn main(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window(MAIN)
}

pub fn show(app: &AppHandle) {
    if let Some(window) = main(app) {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

pub fn navigate(app: &AppHandle, url: &str) {
    match (main(app), Url::parse(url)) {
        (Some(window), Ok(url)) => {
            if let Err(error) = window.navigate(url) {
                log::line(app, format!("navigation failed: {error}"));
            }
        }
        _ => log::line(app, format!("cannot navigate to {url}")),
    }
}

/// Opens an http(s) address in the person's own browser.
pub fn open_external(app: &AppHandle, url: &str) -> Result<(), String> {
    let parsed = Url::parse(url).map_err(|_| "not an address".to_string())?;
    if !matches!(parsed.scheme(), "http" | "https") {
        return Err("only http and https addresses open in the browser".into());
    }
    app.opener()
        .open_url(parsed.as_str(), None::<&str>)
        .map_err(|e| e.to_string())
}

/// Shows the shell's own page (splash, server choice, error) unless it is already there.
pub fn show_shell(app: &AppHandle) {
    let shell = app.state::<Shell>();
    let (Some(home), Some(window)) = (shell.shell_url.get(), main(app)) else {
        return;
    };
    let there = window
        .url()
        .map(|url| origin_of(&url) == origin_of(home) && url.path() == home.path())
        .unwrap_or(false);
    if !there {
        let _ = window.set_background_color(Some(PAPER));
        let _ = window.navigate(home.clone());
    }
}

/// Gives a server's origin the few commands a server page may call. Nothing else in the app is
/// reachable from web content: no file access, no shell, no process control.
fn grant(app: &AppHandle, origin: &str) {
    let shell = app.state::<Shell>();
    let mut inner = shell.inner.lock().unwrap();
    if inner.granted.contains(origin) {
        return;
    }
    let mut capability = CapabilityBuilder::new(format!("server-{}", inner.granted.len()))
        .local(false)
        .remote(format!("{origin}/*"))
        .window(MAIN)
        .permission("allow-open-external")
        .permission("allow-open-server-choice")
        .permission("allow-set-chrome");
    if probing() {
        capability = capability.permission("allow-probe-report");
    }
    match app.add_capability(capability) {
        Ok(()) => {
            inner.granted.insert(origin.to_string());
        }
        Err(error) => {
            drop(inner);
            log::line(app, format!("capability for {origin} failed: {error}"));
        }
    }
}

/// Shows a server in the window.
pub fn enter(app: &AppHandle, origin: &str, url: &str) {
    grant(app, origin);
    {
        let shell = app.state::<Shell>();
        let mut inner = shell.inner.lock().unwrap();
        inner.phase = Phase::Running;
        inner.origin = Some(origin.to_string());
        inner.error = None;
    }
    navigate(app, url);
}

/// Shows the runtime on this machine if it is up. The first time this opens the one-time link that
/// sets the studio's cookie; afterwards the cookie is there.
pub fn show_local(app: &AppHandle) -> bool {
    let target = {
        let shell = app.state::<Shell>();
        let mut inner = shell.inner.lock().unwrap();
        inner.sidecar.as_mut().filter(|s| s.ready).map(|sidecar| {
            let url = sidecar
                .entry
                .take()
                .unwrap_or_else(|| format!("{}/studio/", sidecar.origin));
            (sidecar.origin.clone(), url)
        })
    };
    match target {
        Some((origin, url)) => {
            enter(app, &origin, &url);
            true
        }
        None => false,
    }
}

/// Opens a path of the studio (`/studio/edit/<id>`), now or once the server is shown.
pub fn open_path(app: &AppHandle, path: &str) {
    let origin = {
        let shell = app.state::<Shell>();
        let mut inner = shell.inner.lock().unwrap();
        match (&inner.phase, inner.origin.clone()) {
            (Phase::Running, Some(origin)) => Some(origin),
            _ => {
                inner.pending_path = Some(path.to_string());
                None
            }
        }
    };
    show(app);
    if let Some(origin) = origin {
        navigate(app, &format!("{origin}{path}"));
    }
}

fn probing() -> bool {
    cfg!(debug_assertions) && std::env::var("ENGENTY_WIZARDS_PROBE").is_ok()
}

/// Debug builds only, with `ENGENTY_WIZARDS_PROBE=1`: the page reports what it shows into the
/// app's log. `ENGENTY_WIZARDS_PROBE_EVAL` adds the value of one more expression.
fn probe(window: &WebviewWindow) {
    let extra = std::env::var("ENGENTY_WIZARDS_PROBE_EVAL").unwrap_or_else(|_| "null".into());
    let _ = window.eval(format!(
        r#"setTimeout(async () => {{
  let extra = null;
  try {{ extra = await (async () => ({extra}))(); }} catch (error) {{ extra = "error: " + error; }}
  window.__TAURI_INTERNALS__.invoke("probe_report", {{ info: JSON.stringify({{
    href: location.href,
    title: document.title,
    secureContext: window.isSecureContext,
    getUserMedia: Boolean(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
    engentyDesktop: typeof window.engentyDesktop,
    text: (document.body.innerText || "").replace(/\s+/g, " ").slice(0, 200),
    extra,
  }}) }});
}}, 1500);"#
    ));
}

/// A page other than the local runtime's ended up in the window: it belongs in the browser.
fn bounce(app: &AppHandle, url: &Url) {
    if !matches!(url.scheme(), "http" | "https") {
        return;
    }
    let shell = app.state::<Shell>();
    let back = {
        let inner = shell.inner.lock().unwrap();
        let home = shell.shell_url.get().map(origin_of);
        match (&inner.sidecar, &inner.origin) {
            (Some(sidecar), Some(origin))
                if inner.phase == Phase::Running
                    && *origin == sidecar.origin
                    && origin_of(url) != *origin
                    && Some(origin_of(url)) != home =>
            {
                Some(format!("{origin}/studio/"))
            }
            _ => None,
        }
    };
    if let Some(back) = back {
        let _ = open_external(app, url.as_str());
        navigate(app, &back);
    }
}

fn loaded(app: &AppHandle, window: &WebviewWindow, url: &Url) {
    let shell = app.state::<Shell>();
    let pending = {
        let mut inner = shell.inner.lock().unwrap();
        if inner.phase != Phase::Running || inner.origin.as_deref() != Some(&origin_of(url)) {
            drop(inner);
            let home = shell.shell_url.get().map(origin_of);
            if probing() && Some(origin_of(url)) == home {
                probe(window);
            }
            return;
        }
        inner
            .pending_path
            .take()
            .map(|path| format!("{}{path}", origin_of(url)))
    };
    if !FIRST_LOAD.swap(true, Ordering::SeqCst) {
        let ms = LAUNCHED
            .get()
            .map(|at| at.elapsed().as_millis())
            .unwrap_or(0);
        log::line(app, format!("studio loaded: {url} {ms} ms after launch"));
    }
    if let Some(pending) = pending {
        return navigate(app, &pending);
    }
    if probing() {
        probe(window);
    }
}

fn download_dir() -> Option<PathBuf> {
    if !cfg!(debug_assertions) {
        return None;
    }
    std::env::var("ENGENTY_WIZARDS_DOWNLOAD_DIR")
        .ok()
        .map(PathBuf::from)
}

/// The one window; `visible` false for a start at login, which only puts the app in the menu bar.
pub fn create(app: &AppHandle, visible: bool) -> tauri::Result<WebviewWindow> {
    let handle = app.clone();
    let popups = app.clone();
    let builder = WebviewWindowBuilder::new(app, MAIN, WebviewUrl::App("index.html".into()))
        .title("engenty wizards")
        .visible(visible)
        .inner_size(1440.0, 900.0)
        .min_inner_size(900.0, 600.0)
        .background_color(PAPER)
        // File drops go to the page (upload fields), not to the app.
        .disable_drag_drop_handler()
        .initialization_script(BRIDGE)
        .on_navigation(move |url| match url.scheme() {
            "http" | "https" | "tauri" | "about" | "blob" | "data" => true,
            "mailto" | "tel" => {
                let _ = handle.opener().open_url(url.as_str(), None::<&str>);
                false
            }
            _ => false,
        })
        // target=_blank and window.open, also from inside frames: the person's browser.
        .on_new_window(move |url, _features| {
            let _ = open_external(&popups, url.as_str());
            NewWindowResponse::Deny
        })
        // Files are saved to the Downloads folder and shown there.
        .on_download(|webview, event| {
            let app = webview.app_handle();
            match event {
                DownloadEvent::Requested { url, destination } => {
                    if let (Some(dir), Some(name)) = (download_dir(), destination.file_name()) {
                        *destination = dir.join(name);
                    }
                    log::line(app, format!("download: {url} -> {}", destination.display()));
                    DOWNLOADS
                        .lock()
                        .unwrap()
                        .get_or_insert_with(HashMap::new)
                        .insert(url.to_string(), destination.clone());
                }
                DownloadEvent::Finished { url, success, .. } => {
                    let saved = DOWNLOADS
                        .lock()
                        .unwrap()
                        .as_mut()
                        .and_then(|all| all.remove(url.as_str()));
                    log::line(app, format!("download finished: {url} success={success}"));
                    if let (true, Some(path)) = (success, saved) {
                        if download_dir().is_none() {
                            let _ = app.opener().reveal_item_in_dir(path);
                        }
                    }
                }
                _ => {}
            }
            true
        })
        // Camera and microphone (photo fields, voice notes): for pages of the chosen server
        // only. macOS still asks the person once for the app as a whole.
        .on_permission_request(|webview, kind| {
            let media = matches!(kind, PermissionKind::Camera | PermissionKind::Microphone);
            if !media {
                return PermissionResponse::Default;
            }
            let shell = webview.state::<Shell>();
            let server = shell.inner.lock().unwrap().origin.clone();
            let here = webview.url().ok().map(|url| origin_of(&url));
            if server.is_some() && here == server {
                PermissionResponse::Allow
            } else {
                PermissionResponse::Deny
            }
        })
        .on_page_load(|window, payload| {
            let app = window.app_handle().clone();
            match payload.event() {
                PageLoadEvent::Started => bounce(&app, payload.url()),
                PageLoadEvent::Finished => loaded(&app, &window, payload.url()),
            }
        });
    #[cfg(target_os = "macos")]
    let builder = builder.title_bar_style(tauri::TitleBarStyle::Transparent);
    let window = builder.build()?;
    if let Ok(url) = window.url() {
        let _ = app.state::<Shell>().shell_url.set(url);
    }
    if probing() {
        let report = CapabilityBuilder::new("probe")
            .window(MAIN)
            .permission("allow-probe-report");
        let _ = app.add_capability(report);
    }
    Ok(window)
}

/// The title bar takes the colour of the page behind it.
pub fn set_chrome(window: &WebviewWindow, r: u8, g: u8, b: u8) {
    let _ = window.set_background_color(Some(Color(r, g, b, 255)));
}

pub fn zoom(app: &AppHandle, step: Option<f64>) {
    let factor = {
        let shell = app.state::<Shell>();
        let mut inner = shell.inner.lock().unwrap();
        inner.zoom = match step {
            Some(step) => (inner.zoom + step).clamp(0.5, 3.0),
            None => 1.0,
        };
        inner.zoom
    };
    if let Some(window) = main(app) {
        let _ = window.set_zoom(factor);
    }
}
