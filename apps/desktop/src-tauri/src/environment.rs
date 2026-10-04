//! What the runtime on this machine gets from it: a small set of variables, the PATH of the
//! person's login shell, and the installed browser for PDF and PNG.

use std::{
    env,
    io::Read,
    path::PathBuf,
    process::{Command, Stdio},
    sync::OnceLock,
    thread,
    time::{Duration, Instant},
};

/// Variables the runtime inherits. Everything else it gets is set by the app; in particular it
/// never sees `MANAGE_URL`, which would make it a cloud runtime.
const INHERITED: &[&str] = &[
    "HOME",
    "USER",
    "LOGNAME",
    "SHELL",
    "TMPDIR",
    "LANG",
    "LC_ALL",
    "LC_CTYPE",
    "__CF_USER_TEXT_ENCODING",
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "NO_PROXY",
    "http_proxy",
    "https_proxy",
    "no_proxy",
    "SSL_CERT_FILE",
    "NODE_EXTRA_CA_CERTS",
    "ACCOUNT_URL",
    "ACCOUNT_GATEWAY_URL",
    "CLOUD_URL",
    "OLLAMA_URL",
    "FFMPEG_PATH",
    // Windows
    "SYSTEMROOT",
    "APPDATA",
    "LOCALAPPDATA",
    "USERPROFILE",
    "TEMP",
    "TMP",
];

pub fn inherited() -> Vec<(String, String)> {
    env::vars()
        .filter(|(key, _)| INHERITED.contains(&key.as_str()) || key.starts_with("MODEL_"))
        .collect()
}

/// A GUI app on macOS starts with a minimal PATH. The Studio chat runs the installed `claude`,
/// widgets use `ffmpeg`: ask the login shell once for the PATH a terminal would have.
fn shell_path() -> Option<String> {
    let shell = env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into());
    let print = if shell.ends_with("fish") {
        "printf '\\n__PATH__%s__PATH__\\n' (string join : $PATH)"
    } else {
        "printf '\\n__PATH__%s__PATH__\\n' \"$PATH\""
    };
    let mut child = Command::new(&shell)
        .args(["-ilc", print])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .ok()?;
    let deadline = Instant::now() + Duration::from_secs(5);
    loop {
        match child.try_wait() {
            Ok(Some(_)) => break,
            Ok(None) if Instant::now() < deadline => thread::sleep(Duration::from_millis(20)),
            _ => {
                let _ = child.kill();
                let _ = child.wait();
                return None;
            }
        }
    }
    let mut output = String::new();
    child.stdout.take()?.read_to_string(&mut output).ok()?;
    let path = output.split("__PATH__").nth(1)?.trim();
    (!path.is_empty()).then(|| path.to_string())
}

pub fn login_path() -> String {
    static PATH: OnceLock<String> = OnceLock::new();
    PATH.get_or_init(|| {
        let home = env::var("HOME").unwrap_or_default();
        let mut entries: Vec<String> = Vec::new();
        let mut add = |list: &str| {
            for entry in env::split_paths(list) {
                let entry = entry.to_string_lossy().into_owned();
                if !entry.is_empty() && !entries.contains(&entry) {
                    entries.push(entry);
                }
            }
        };
        if cfg!(unix) {
            if let Some(path) = shell_path() {
                add(&path);
            }
        }
        add(&env::var("PATH").unwrap_or_default());
        if cfg!(unix) {
            add(&format!(
                "{home}/.local/bin:{home}/.claude/local:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
            ));
        }
        env::join_paths(entries)
            .map(|path| path.to_string_lossy().into_owned())
            .unwrap_or_default()
    })
    .clone()
}

/// The installed Chrome or Edge; the runtime renders PDF and PNG with it.
pub fn chrome_path() -> Option<PathBuf> {
    let home = env::var("HOME").unwrap_or_default();
    let candidates: Vec<String> = if cfg!(target_os = "macos") {
        [
            "Google Chrome.app/Contents/MacOS/Google Chrome",
            "Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
            "Chromium.app/Contents/MacOS/Chromium",
            "Brave Browser.app/Contents/MacOS/Brave Browser",
        ]
        .iter()
        .flat_map(|app| {
            [
                format!("/Applications/{app}"),
                format!("{home}/Applications/{app}"),
            ]
        })
        .collect()
    } else if cfg!(windows) {
        let roots = ["PROGRAMFILES", "PROGRAMFILES(X86)", "LOCALAPPDATA"];
        roots
            .iter()
            .filter_map(|root| env::var(root).ok())
            .flat_map(|root| {
                [
                    format!("{root}\\Google\\Chrome\\Application\\chrome.exe"),
                    format!("{root}\\Microsoft\\Edge\\Application\\msedge.exe"),
                ]
            })
            .collect()
    } else {
        [
            "google-chrome",
            "chromium",
            "chromium-browser",
            "microsoft-edge",
        ]
        .iter()
        .map(|name| format!("/usr/bin/{name}"))
        .collect()
    };
    candidates
        .into_iter()
        .map(PathBuf::from)
        .find(|path| path.exists())
}
