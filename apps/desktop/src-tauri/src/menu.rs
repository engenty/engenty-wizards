//! Menu bar and menu-bar icon.

use tauri::{
    menu::{Menu, MenuItem, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder},
    tray::TrayIconBuilder,
    AppHandle,
};
use tauri_plugin_opener::OpenerExt;

use crate::{commands, i18n::tr, quit, state::CLOUD_URL, window};

const NAME: &str = "engenty wizards";

pub fn handle(app: &AppHandle, id: &str) {
    match id {
        "open" => window::show(app),
        "reload" => {
            window::show(app);
            if let Some(main) = window::main(app) {
                let _ = main.eval("location.reload()");
            }
        }
        "change-server" => commands::open_server_choice(app.clone()),
        "zoom-in" => window::zoom(app, Some(0.1)),
        "zoom-out" => window::zoom(app, Some(-0.1)),
        "zoom-reset" => window::zoom(app, None),
        "logs" => commands::open_logs(app.clone()),
        "website" => {
            let _ = app.opener().open_url(CLOUD_URL, None::<&str>);
        }
        "quit" => quit(app),
        _ => {}
    }
}

pub fn install(app: &AppHandle) -> tauri::Result<()> {
    let item = |id: &str, text: &str, accelerator: Option<&str>| {
        let mut builder = MenuItemBuilder::with_id(id, text);
        if let Some(accelerator) = accelerator {
            builder = builder.accelerator(accelerator);
        }
        builder.build(app)
    };
    let app_menu = SubmenuBuilder::new(app, NAME)
        .item(&PredefinedMenuItem::about(
            app,
            Some(tr("Über engenty wizards", "About engenty wizards")),
            None,
        )?)
        .separator()
        .item(&item(
            "change-server",
            tr("Server wechseln…", "Change Server…"),
            None,
        )?)
        .separator()
        .item(&PredefinedMenuItem::hide(
            app,
            Some(tr("engenty wizards ausblenden", "Hide engenty wizards")),
        )?)
        .item(&PredefinedMenuItem::hide_others(
            app,
            Some(tr("Andere ausblenden", "Hide Others")),
        )?)
        .item(&PredefinedMenuItem::show_all(
            app,
            Some(tr("Alle einblenden", "Show All")),
        )?)
        .separator()
        .item(&item(
            "quit",
            tr("engenty wizards beenden", "Quit engenty wizards"),
            Some("CmdOrCtrl+Q"),
        )?)
        .build()?;
    let edit_menu = SubmenuBuilder::new(app, tr("Bearbeiten", "Edit"))
        .item(&PredefinedMenuItem::undo(
            app,
            Some(tr("Widerrufen", "Undo")),
        )?)
        .item(&PredefinedMenuItem::redo(
            app,
            Some(tr("Wiederholen", "Redo")),
        )?)
        .separator()
        .item(&PredefinedMenuItem::cut(
            app,
            Some(tr("Ausschneiden", "Cut")),
        )?)
        .item(&PredefinedMenuItem::copy(
            app,
            Some(tr("Kopieren", "Copy")),
        )?)
        .item(&PredefinedMenuItem::paste(
            app,
            Some(tr("Einsetzen", "Paste")),
        )?)
        .item(&PredefinedMenuItem::select_all(
            app,
            Some(tr("Alles auswählen", "Select All")),
        )?)
        .build()?;
    let view_menu = SubmenuBuilder::new(app, tr("Darstellung", "View"))
        .item(&item(
            "reload",
            tr("Neu laden", "Reload"),
            Some("CmdOrCtrl+R"),
        )?)
        .separator()
        .item(&item(
            "zoom-reset",
            tr("Originalgröße", "Actual Size"),
            Some("CmdOrCtrl+0"),
        )?)
        .item(&item(
            "zoom-in",
            tr("Vergrößern", "Zoom In"),
            Some("CmdOrCtrl+="),
        )?)
        .item(&item(
            "zoom-out",
            tr("Verkleinern", "Zoom Out"),
            Some("CmdOrCtrl+-"),
        )?)
        .separator()
        .item(&PredefinedMenuItem::fullscreen(
            app,
            Some(tr("Vollbild", "Enter Full Screen")),
        )?)
        .build()?;
    let window_menu = SubmenuBuilder::new(app, tr("Fenster", "Window"))
        .item(&PredefinedMenuItem::minimize(
            app,
            Some(tr("Im Dock ablegen", "Minimize")),
        )?)
        .item(&PredefinedMenuItem::maximize(
            app,
            Some(tr("Zoomen", "Zoom")),
        )?)
        .separator()
        .item(&PredefinedMenuItem::close_window(
            app,
            Some(tr("Fenster schließen", "Close Window")),
        )?)
        .build()?;
    let help_menu = SubmenuBuilder::new(app, tr("Hilfe", "Help"))
        .item(&item(
            "website",
            tr("engenty wizards im Web", "engenty wizards on the Web"),
            None,
        )?)
        .item(&item("logs", tr("Protokolle anzeigen", "Show Logs"), None)?)
        .build()?;
    let menu = Menu::with_items(
        app,
        &[&app_menu, &edit_menu, &view_menu, &window_menu, &help_menu],
    )?;
    app.set_menu(menu)?;
    Ok(())
}

/// The menu-bar icon: the app keeps running there while its window is closed.
pub fn install_tray(app: &AppHandle) -> tauri::Result<()> {
    let Some(icon) = app.default_window_icon().cloned() else {
        return Ok(());
    };
    let open = MenuItem::with_id(
        app,
        "open",
        tr("engenty wizards öffnen", "Open engenty wizards"),
        true,
        None::<&str>,
    )?;
    let reload = MenuItem::with_id(app, "reload", tr("Neu laden", "Reload"), true, None::<&str>)?;
    let change = MenuItem::with_id(
        app,
        "change-server",
        tr("Server wechseln…", "Change Server…"),
        true,
        None::<&str>,
    )?;
    let separator = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(
        app,
        "quit",
        tr("engenty wizards beenden", "Quit engenty wizards"),
        true,
        None::<&str>,
    )?;
    let menu = Menu::with_items(app, &[&open, &reload, &change, &separator, &quit])?;
    TrayIconBuilder::with_id("engenty-wizards-tray")
        .icon(icon)
        .tooltip(NAME)
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| handle(app, event.id.as_ref()))
        .build(app)?;
    Ok(())
}
