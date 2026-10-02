use std::sync::OnceLock;

/// German when the system speaks German, else English — the same rule the studio uses.
pub fn german() -> bool {
    static GERMAN: OnceLock<bool> = OnceLock::new();
    *GERMAN.get_or_init(|| {
        sys_locale::get_locale()
            .map(|locale| locale.to_lowercase().starts_with("de"))
            .unwrap_or(false)
    })
}

pub fn tr(de: &'static str, en: &'static str) -> &'static str {
    if german() {
        de
    } else {
        en
    }
}
