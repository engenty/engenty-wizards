//! Opening at login: a LaunchAgent that opens the app in the menu bar, without its window, so the
//! runtime on this machine runs from the login on. The app's menus switch it, and so does
//! `engenty-wizards autostart`, which writes the same file (apps/runtime/src/cli/autostart.ts).
//! The file is all there is to it: no other state says whether it is on.

use std::path::{Path, PathBuf};

const LABEL: &str = "com.engenty.wizards.login";
/// What the login item passes: the app starts in the menu bar and leaves its window closed.
const AT_LOGIN: &str = "--at-login";

fn file() -> Option<PathBuf> {
    std::env::var_os("HOME").map(|home| {
        PathBuf::from(home)
            .join("Library/LaunchAgents")
            .join(format!("{LABEL}.plist"))
    })
}

pub fn enabled() -> bool {
    file().is_some_and(|file| file.exists())
}

/// Whether this start came from the login item.
pub fn launched_at_login() -> bool {
    std::env::args().any(|arg| arg == AT_LOGIN)
}

/// The bundle this binary is in (`…/engenty wizards.app`), or the binary outside of one.
fn target() -> Option<PathBuf> {
    let exe = std::env::current_exe().ok()?;
    let bundle = exe
        .ancestors()
        .find(|dir| dir.extension().is_some_and(|ext| ext == "app"))
        .map(Path::to_path_buf);
    Some(bundle.unwrap_or(exe))
}

fn escape(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

/// The LaunchAgent for a bundle or binary. A bundle is opened by `open`, through Launch Services:
/// one app, as if it was opened by hand; an app that already runs only gets the reopen.
fn plist(target: &Path) -> String {
    let path = target.to_string_lossy().into_owned();
    let program: Vec<String> = if target.extension().is_some_and(|ext| ext == "app") {
        vec![
            "/usr/bin/open".into(),
            "-g".into(),
            "-a".into(),
            path,
            "--args".into(),
            AT_LOGIN.into(),
        ]
    } else {
        vec![path, AT_LOGIN.into()]
    };
    let arguments: String = program
        .iter()
        .map(|arg| format!("    <string>{}</string>\n", escape(arg)))
        .collect();
    format!(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>{LABEL}</string>
  <key>ProgramArguments</key>
  <array>
{arguments}  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>ProcessType</key>
  <string>Interactive</string>
</dict>
</plist>
"#
    )
}

/// Switches it on or off. It takes effect at the next login; nothing is started now.
pub fn set(on: bool) -> Result<(), String> {
    let file = file().ok_or("no home folder")?;
    if !on {
        return match std::fs::remove_file(&file) {
            Err(error) if error.kind() != std::io::ErrorKind::NotFound => {
                Err(format!("{}: {error}", file.display()))
            }
            _ => Ok(()),
        };
    }
    let target = target().ok_or("where this app is cannot be told")?;
    if let Some(dir) = file.parent() {
        std::fs::create_dir_all(dir).map_err(|error| format!("{}: {error}", dir.display()))?;
    }
    std::fs::write(&file, plist(&target)).map_err(|error| format!("{}: {error}", file.display()))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The same text as `engenty-wizards autostart on` writes (apps/runtime/test/cli.test.ts).
    #[test]
    fn the_command_line_writes_the_same_file() {
        let expected = r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.engenty.wizards.login</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/open</string>
    <string>-g</string>
    <string>-a</string>
    <string>/Applications/engenty wizards.app</string>
    <string>--args</string>
    <string>--at-login</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>ProcessType</key>
  <string>Interactive</string>
</dict>
</plist>
"#;
        assert_eq!(
            plist(Path::new("/Applications/engenty wizards.app")),
            expected
        );
    }

    #[test]
    fn a_bundle_is_opened_through_launch_services() {
        let text = plist(Path::new("/Applications/engenty wizards.app"));
        assert!(text.contains("<string>/usr/bin/open</string>"));
        assert!(text.contains("<string>/Applications/engenty wizards.app</string>"));
        assert!(text.contains("<string>--at-login</string>"));
        assert!(text.contains("<key>RunAtLoad</key>\n  <true/>"));
    }

    #[test]
    fn a_path_is_escaped() {
        let text = plist(Path::new("/tmp/a&b<c>/engenty-wizards"));
        assert!(text.contains("<string>/tmp/a&amp;b&lt;c&gt;/engenty-wizards</string>"));
        assert!(!text.contains("/usr/bin/open"));
    }
}
