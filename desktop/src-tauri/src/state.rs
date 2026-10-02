use std::{
    collections::HashSet,
    fs,
    path::PathBuf,
    process::Child,
    sync::{Arc, Mutex, OnceLock},
};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, Url};

/// The engenty Cloud runtime offered in the server choice.
pub const CLOUD_URL: &str = "https://engenty-wizards.com";

/// Which server the window shows. Stored in `server.json` in the app's config folder.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum Choice {
    /// The runtime this app brings along, on this machine.
    Local,
    /// A runtime somebody else runs, by address.
    Custom {
        url: String,
    },
    Cloud,
}

impl Choice {
    pub fn remote_url(&self) -> Option<String> {
        match self {
            Choice::Local => None,
            Choice::Custom { url } => Some(url.clone()),
            Choice::Cloud => Some(CLOUD_URL.to_string()),
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Phase {
    /// The server choice page is shown.
    Choose,
    /// The built-in runtime is starting.
    Starting,
    /// A remote server is being reached.
    Connecting,
    /// The built-in runtime did not start or stopped twice.
    Failed,
    /// The window shows the server.
    Running,
}

/// The built-in runtime while it runs.
pub struct Sidecar {
    pub child: Arc<Mutex<Child>>,
    pub origin: String,
    /// It answers on `/api/health`.
    pub ready: bool,
    /// The one-time link that sets the studio's cookie, until it has been opened.
    pub entry: Option<String>,
}

pub struct Inner {
    pub choice: Option<Choice>,
    pub phase: Phase,
    pub error: Option<String>,
    /// Origin of the server the window shows while `Running`.
    pub origin: Option<String>,
    pub sidecar: Option<Sidecar>,
    /// Counts starts and stops of the built-in runtime; a watcher of an older one stands down.
    pub generation: u64,
    /// The built-in runtime was already restarted once after stopping by itself.
    pub restarted: bool,
    /// A deep link that arrived before the server was shown.
    pub pending_path: Option<String>,
    pub zoom: f64,
    pub quitting: bool,
    /// Origins that already hold the server capability.
    pub granted: HashSet<String>,
}

pub struct Shell {
    pub inner: Mutex<Inner>,
    /// Address of the shell's own page (splash, server choice, error).
    pub shell_url: OnceLock<Url>,
}

impl Shell {
    pub fn new(choice: Option<Choice>) -> Self {
        Self {
            inner: Mutex::new(Inner {
                choice,
                phase: Phase::Choose,
                error: None,
                origin: None,
                sidecar: None,
                generation: 0,
                restarted: false,
                pending_path: None,
                zoom: 1.0,
                quitting: false,
                granted: HashSet::new(),
            }),
            shell_url: OnceLock::new(),
        }
    }
}

fn choice_file(app: &AppHandle) -> Option<PathBuf> {
    app.path()
        .app_config_dir()
        .ok()
        .map(|dir| dir.join("server.json"))
}

/// The stored choice. `ENGENTY_WIZARDS_SERVER` (`local`, `cloud` or an address) wins and is not
/// stored — for development and tests.
pub fn load_choice(app: &AppHandle) -> Option<Choice> {
    if let Ok(given) = std::env::var("ENGENTY_WIZARDS_SERVER") {
        return match given.trim() {
            "" => None,
            "local" => Some(Choice::Local),
            "cloud" => Some(Choice::Cloud),
            url => server_url(url).ok().map(|url| Choice::Custom { url }),
        };
    }
    let text = fs::read_to_string(choice_file(app)?).ok()?;
    serde_json::from_str(&text).ok()
}

pub fn store_choice(app: &AppHandle, choice: &Choice) {
    if std::env::var("ENGENTY_WIZARDS_SERVER").is_ok() {
        return;
    }
    let Some(file) = choice_file(app) else { return };
    if let Some(dir) = file.parent() {
        let _ = fs::create_dir_all(dir);
    }
    if let Ok(text) = serde_json::to_string_pretty(choice) {
        let _ = fs::write(file, text);
    }
}

fn loopback(host: &str) -> bool {
    matches!(host, "localhost" | "127.0.0.1" | "[::1]") || host.ends_with(".localhost")
}

/// An address somebody typed, as the origin of a server: https, or http on this machine only.
pub fn server_url(input: &str) -> Result<String, String> {
    let trimmed = input.trim();
    let with_scheme = if trimmed.contains("://") {
        trimmed.to_string()
    } else {
        format!("https://{trimmed}")
    };
    let url = Url::parse(&with_scheme).map_err(|_| "invalid".to_string())?;
    let host = url.host_str().ok_or("invalid")?;
    match url.scheme() {
        "https" => {}
        "http" if loopback(host) => {}
        _ => return Err("insecure".to_string()),
    }
    Ok(origin_of(&url))
}

/// `scheme://host[:port]` of an address.
pub fn origin_of(url: &Url) -> String {
    url.origin().ascii_serialization()
}
