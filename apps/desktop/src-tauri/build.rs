fn main() {
    // Naming the app's commands makes every one of them subject to the capability files:
    // a page gets a command only where a capability grants `allow-<command>`.
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "shell_state",
            "choose_server",
            "enter_server",
            "retry_start",
            "open_logs",
            "open_external",
            "open_server_choice",
            "set_chrome",
            "probe_report",
        ]),
    ))
    .expect("failed to run the Tauri build script");
}
