//! engenty wizards desktop: one window on a server — the runtime installed on this machine
//! (`~/.engenty/wizards`), which the app starts itself, or a remote one.

mod commands;
mod environment;
mod i18n;
mod log;
mod menu;
mod sidecar;
mod state;
mod window;

use tauri::{AppHandle, Manager, RunEvent, Url, WindowEvent};
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_window_state::StateFlags;

use state::Shell;

/// Ends the app; the runtime it started goes first.
pub(crate) fn quit(app: &AppHandle) {
    if let Some(main) = window::main(app) {
        let _ = main.hide();
    }
    shut_down(app);
    app.exit(0);
}

fn shut_down(app: &AppHandle) {
    app.state::<Shell>().inner.lock().unwrap().quitting = true;
    sidecar::stop(app);
}

/// `engenty-wizards://w/<id>` opens that wizard in the studio (`/studio/…`); `new`, `settings`
/// and the bare scheme work too; `new?starter=<id>` opens that template of the marketplace, as
/// the template's own page links it; `signin?code=…` finishes a sign-in. Nothing else is taken
/// from a link: any page on the web can send one.
fn deep_link_path(url: &Url) -> Option<String> {
    if url.scheme() != "engenty-wizards" {
        return None;
    }
    let path = format!("/{}{}", url.host_str().unwrap_or(""), url.path());
    let parts: Vec<&str> = path.split('/').filter(|part| !part.is_empty()).collect();
    let id = |value: &str| {
        value
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
    };
    // A sign-in that ran in the system browser comes back as a one-time code. The server only
    // accepts it in the window that asked for it, so a link from elsewhere does nothing.
    if parts.as_slice() == ["signin"] {
        let code = url.query_pairs().find(|(key, _)| key == "code")?.1.to_string();
        let sealed = !code.is_empty()
            && code.len() < 2048
            && code
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '_' || c == '-');
        return sealed.then(|| format!("/api/auth/handoff?code={code}"));
    }
    match parts.as_slice() {
        ["w", wizard] if id(wizard) => Some(format!("/studio/edit/{wizard}")),
        ["new"] => {
            let starter = url
                .query_pairs()
                .find(|(key, _)| key == "starter")
                .map(|(_, value)| value.to_string())
                .filter(|value| !value.is_empty() && value.len() <= 64 && id(value));
            Some(match starter {
                Some(starter) => format!("/studio/new?starter={starter}"),
                None => "/studio/new".into(),
            })
        }
        ["settings"] => Some("/studio/settings".into()),
        [] => Some("/studio/".into()),
        _ => None,
    }
}

pub fn run() {
    window::mark_launch();
    // Asking the login shell for its PATH takes a second or two; start before anything else.
    std::thread::spawn(|| {
        environment::login_path();
    });
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            window::show(app);
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(StateFlags::all() & !StateFlags::VISIBLE)
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            commands::shell_state,
            commands::choose_server,
            commands::enter_server,
            commands::retry_start,
            commands::open_logs,
            commands::open_external,
            commands::open_server_choice,
            commands::set_chrome,
            commands::probe_report,
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            let choice = state::load_choice(&handle);
            app.manage(Shell::new(choice.clone()));
            log::line(
                &handle,
                format!(
                    "engenty wizards {} starting, server: {choice:?}",
                    app.package_info().version
                ),
            );
            menu::install(&handle)?;
            menu::install_tray(&handle)?;
            window::create(&handle)?;

            let links = handle.clone();
            app.deep_link().on_open_url(move |event| {
                for url in event.urls() {
                    match deep_link_path(&url) {
                        Some(path) => window::open_path(&links, &path),
                        None => log::line(&links, format!("ignored link: {url}")),
                    }
                }
            });

            // No choice yet: the window shows the server choice.
            if let Some(choice) = choice {
                commands::apply(&handle, choice);
            }
            Ok(())
        })
        .on_menu_event(|app, event| menu::handle(app, event.id().as_ref()))
        .on_window_event(|window, event| {
            // Closing the window keeps the app, and runs in the runtime it started, alive in the
            // Dock and the menu bar. Quit ends both.
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building the engenty wizards desktop app")
        .run(|app, event| match event {
            #[cfg(target_os = "macos")]
            RunEvent::Reopen { .. } => window::show(app),
            RunEvent::Exit => shut_down(app),
            _ => {}
        });
}
