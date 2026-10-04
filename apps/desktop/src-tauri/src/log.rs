use std::{
    fs::{self, File, OpenOptions},
    io::{Read, Seek, SeekFrom, Write},
    path::PathBuf,
    time::{SystemTime, UNIX_EPOCH},
};

use tauri::{AppHandle, Manager};

/// The app's own log.
const SHELL_LOG: &str = "shell.log";
/// What the runtime the app started writes to stdout and stderr.
pub const RUNTIME_LOG: &str = "runtime.log";
const MAX_BYTES: u64 = 5 * 1024 * 1024;

pub fn dir(app: &AppHandle) -> PathBuf {
    let dir = app
        .path()
        .app_log_dir()
        .unwrap_or_else(|_| std::env::temp_dir().join("engenty-wizards"));
    let _ = fs::create_dir_all(&dir);
    dir
}

/// Opens a log for appending; one that grew past the limit is kept once as `<name>.1`.
pub fn open(app: &AppHandle, name: &str) -> std::io::Result<File> {
    let path = dir(app).join(name);
    if fs::metadata(&path)
        .map(|m| m.len() > MAX_BYTES)
        .unwrap_or(false)
    {
        let _ = fs::rename(&path, dir(app).join(format!("{name}.1")));
    }
    OpenOptions::new().create(true).append(true).open(path)
}

/// UTC time as `2026-10-02T15:04:05Z`.
fn timestamp() -> String {
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    let (days, rest) = (secs.div_euclid(86_400), secs.rem_euclid(86_400));
    // Days since 1970-01-01 to a calendar date (Howard Hinnant's civil_from_days).
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = yoe + era * 400 + i64::from(month <= 2);
    format!(
        "{year:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}Z",
        rest / 3_600,
        rest % 3_600 / 60,
        rest % 60
    )
}

pub fn line(app: &AppHandle, message: impl AsRef<str>) {
    let text = format!("{} {}\n", timestamp(), message.as_ref());
    eprint!("[desktop] {text}");
    if let Ok(mut file) = open(app, SHELL_LOG) {
        let _ = file.write_all(text.as_bytes());
    }
}

/// The end of the runtime's log, for the error page.
pub fn runtime_tail(app: &AppHandle, max_bytes: u64) -> String {
    let Ok(mut file) = File::open(dir(app).join(RUNTIME_LOG)) else {
        return String::new();
    };
    let len = file.metadata().map(|m| m.len()).unwrap_or(0);
    let _ = file.seek(SeekFrom::Start(len.saturating_sub(max_bytes)));
    let mut bytes = Vec::new();
    let _ = file.read_to_end(&mut bytes);
    String::from_utf8_lossy(&bytes).into_owned()
}
