//! System tray icon + right-click menu.
//!
//! The tray keeps Cairn available from the OS tray area while the main
//! window is hidden. Left-click toggles the main window; right-click
//! surfaces a native menu with:
//!
//! - *Open Cairn* — show / focus the main window.
//! - *Captures* — jump to the Captures route.
//! - *Recent Projects* — up to three most-recently-opened projects for
//!   the currently-active vault, driven by `state::project_recency`.
//! - *Quit Cairn* — full process exit.
//!
//! Menu rebuilds are triggered on tray creation, after every vault switch,
//! and after `record_project_visit`. The menu is intentionally native-OS-
//! styled: Windows 11 and macOS tray menus can't be themed, and building
//! a bespoke popup wasn't worth the edge-case weight (focus handling,
//! positioning, multi-monitor, screen-reader) for the small brand win.

use crate::state as vault_state;
use crate::AppState;
use parking_lot::Mutex;
use tauri::menu::{Menu, MenuBuilder, MenuEvent, MenuItemBuilder};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, Runtime};

/// Stable id so `app.tray_by_id` can look the tray icon back up when the
/// menu needs a rebuild (vault switch, new visit recorded).
pub const TRAY_ID: &str = "cairn-tray";

/// Event emitted to frontend webviews when a tray menu item should deep-link
/// into a specific route. Payload is the `TrayNavigate` enum serialized with
/// `target` as the discriminator.
pub const TRAY_NAVIGATE_EVENT: &str = "tray:navigate";

const RECENT_LIMIT: usize = 3;

// ─── menu item ids ────────────────────────────────────────────────────────
const ID_OPEN: &str = "tray:open";
const ID_CAPTURES: &str = "tray:captures";
const ID_QUIT: &str = "tray:quit";
const ID_NO_VAULT: &str = "tray:no-vault";
const ID_RECENT_HEADER: &str = "tray:recent-header";
const ID_PROJECT_PREFIX: &str = "tray:project:";

/// Side table mapping tray menu ids like `"tray:project:2"` back to the
/// project's absolute path. Kept out of menu-item ids because menu id strings
/// are opaque to us once the OS owns them, and absolute Windows paths contain
/// characters (colons, backslashes) we'd rather not encode round-trip.
pub struct TrayMenuState {
    pub recent_projects: Mutex<Vec<String>>,
}

/// Event payload for [`TRAY_NAVIGATE_EVENT`].
///
/// Using `serde(tag = "target")` yields frontend-friendly JSON:
/// - `{ target: "captures" }`
/// - `{ target: "project", path: "…" }`
#[derive(Clone, serde::Serialize)]
#[serde(tag = "target", rename_all = "kebab-case")]
pub enum TrayNavigate {
    Captures,
    Project {
        #[serde(rename = "path")]
        path: String,
    },
}

/// Install the tray icon and its menu. Safe to call during `setup()`.
///
/// Errors are logged and swallowed rather than propagated — a missing tray
/// icon must not prevent the app from starting; the user just loses the
/// tray affordance until next launch.
pub fn build_tray<R: Runtime>(app: &AppHandle<R>) {
    if let Err(err) = try_build_tray(app) {
        eprintln!("failed to build system tray: {err}");
    }
}

fn try_build_tray<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    app.manage(TrayMenuState {
        recent_projects: Mutex::new(Vec::new()),
    });

    let Some(icon) = app.default_window_icon().cloned() else {
        // tauri.conf.json bundles an icon set, so this should not happen in
        // a real build — but skipping the tray is the right fallback.
        eprintln!("tray: no default window icon bundled; skipping tray setup");
        return Ok(());
    };

    let menu = build_menu(app, &[])?;

    let _ = TrayIconBuilder::with_id(TRAY_ID)
        .tooltip("Cairn")
        .icon(icon)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| handle_menu_event(app, event))
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                toggle_main_window(tray.app_handle());
            }
        })
        .build(app)?;

    // Populate with the active vault's recents, if any. Harmless before a
    // vault is opened — the bare menu is already valid.
    let _ = refresh_tray_menu(app);

    Ok(())
}

/// Rebuild the tray menu so it reflects the current active vault's recent
/// project list. Call after a vault switch or after a visit is recorded.
pub fn refresh_tray_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let recents = recent_project_paths(app);

    // Snapshot the ordered path list into TrayMenuState so the menu handler
    // can resolve `tray:project:<idx>` back to a path without re-walking the
    // vault state.
    {
        let state = app.state::<TrayMenuState>();
        let mut slot = state.recent_projects.lock();
        *slot = recents.clone();
    }

    let labeled: Vec<(String, String)> = recents
        .iter()
        .enumerate()
        .map(|(idx, path)| (format!("{ID_PROJECT_PREFIX}{idx}"), project_label(path)))
        .collect();

    let menu = build_menu(app, &labeled)?;
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        tray.set_menu(Some(menu))?;
    }
    Ok(())
}

fn recent_project_paths<R: Runtime>(app: &AppHandle<R>) -> Vec<String> {
    let state = app.state::<AppState>();
    let Some(active) = state.registry.read().active().cloned() else {
        return Vec::new();
    };
    match vault_state::recent_projects(&active.path, RECENT_LIMIT) {
        Ok(items) => items.into_iter().map(|v| v.path).collect(),
        Err(err) => {
            eprintln!("tray: failed to load recent projects: {err}");
            Vec::new()
        }
    }
}

/// Trailing segment of a project path, used as the menu-item label. Falls
/// back to `"Untitled project"` if the path has no usable file name.
fn project_label(path: &str) -> String {
    std::path::Path::new(path)
        .file_name()
        .and_then(|s| s.to_str())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
        .unwrap_or_else(|| "Untitled project".to_string())
}

/// Index-from-id parser. `"tray:project:2"` → `Some(2)`. Other ids → `None`.
fn parse_project_index(id: &str) -> Option<usize> {
    id.strip_prefix(ID_PROJECT_PREFIX)
        .and_then(|rest| rest.parse().ok())
}

fn build_menu<R: Runtime>(
    app: &AppHandle<R>,
    recents: &[(String, String)],
) -> tauri::Result<Menu<R>> {
    let open = MenuItemBuilder::with_id(ID_OPEN, "Open Cairn").build(app)?;
    let captures = MenuItemBuilder::with_id(ID_CAPTURES, "Captures").build(app)?;
    let quit = MenuItemBuilder::with_id(ID_QUIT, "Quit Cairn").build(app)?;

    let mut builder = MenuBuilder::new(app)
        .item(&open)
        .separator()
        .item(&captures)
        .separator();

    if recents.is_empty() {
        let placeholder =
            MenuItemBuilder::with_id(ID_NO_VAULT, "No recent projects")
                .enabled(false)
                .build(app)?;
        builder = builder.item(&placeholder);
    } else {
        let header = MenuItemBuilder::with_id(ID_RECENT_HEADER, "Recent Projects")
            .enabled(false)
            .build(app)?;
        builder = builder.item(&header);
        for (id, label) in recents {
            let item = MenuItemBuilder::with_id(id, label).build(app)?;
            builder = builder.item(&item);
        }
    }

    builder = builder.separator().item(&quit);
    builder.build()
}

fn handle_menu_event<R: Runtime>(app: &AppHandle<R>, event: MenuEvent) {
    let id = event.id().as_ref();
    match id {
        ID_OPEN => show_main_window(app),
        ID_CAPTURES => {
            show_main_window(app);
            let _ = app.emit(TRAY_NAVIGATE_EVENT, TrayNavigate::Captures);
        }
        ID_QUIT => app.exit(0),
        other => {
            let Some(idx) = parse_project_index(other) else {
                return;
            };
            let path = {
                let state = app.state::<TrayMenuState>();
                let guard = state.recent_projects.lock();
                match guard.get(idx) {
                    Some(p) => p.clone(),
                    None => return,
                }
            };
            show_main_window(app);
            let _ = app.emit(TRAY_NAVIGATE_EVENT, TrayNavigate::Project { path });
        }
    }
}

fn show_main_window<R: Runtime>(app: &AppHandle<R>) {
    let Some(w) = app.get_webview_window("main") else {
        return;
    };
    let _ = w.show();
    let _ = w.unminimize();
    let _ = w.set_focus();
}

fn toggle_main_window<R: Runtime>(app: &AppHandle<R>) {
    let Some(w) = app.get_webview_window("main") else {
        return;
    };
    // "Visible + focused" is the only state where a click should hide; if
    // the window is visible-but-behind-another-window, left-click should
    // bring it forward instead of hiding it.
    let visible = w.is_visible().unwrap_or(false);
    let focused = w.is_focused().unwrap_or(false);
    if visible && focused {
        let _ = w.hide();
    } else {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_project_index_accepts_valid_ids() {
        assert_eq!(parse_project_index("tray:project:0"), Some(0));
        assert_eq!(parse_project_index("tray:project:42"), Some(42));
    }

    #[test]
    fn parse_project_index_rejects_other_ids() {
        assert_eq!(parse_project_index("tray:open"), None);
        assert_eq!(parse_project_index("tray:captures"), None);
        assert_eq!(parse_project_index("tray:project:"), None);
        assert_eq!(parse_project_index("tray:project:abc"), None);
        assert_eq!(parse_project_index(""), None);
    }

    #[test]
    fn project_label_uses_trailing_path_segment() {
        assert_eq!(project_label("/home/amer/brain/Projects/Alpha"), "Alpha");
        assert_eq!(
            project_label("C:\\Users\\amer\\brain\\Projects\\Beta"),
            "Beta",
        );
    }

    #[test]
    fn project_label_falls_back_when_path_has_no_name() {
        assert_eq!(project_label(""), "Untitled project");
        assert_eq!(project_label("/"), "Untitled project");
    }

    #[test]
    fn tray_navigate_captures_serializes_as_tagged_object() {
        let json = serde_json::to_value(TrayNavigate::Captures).unwrap();
        assert_eq!(json, serde_json::json!({ "target": "captures" }));
    }

    #[test]
    fn tray_navigate_project_serializes_with_path() {
        let json = serde_json::to_value(TrayNavigate::Project {
            path: "/x/y".into(),
        })
        .unwrap();
        assert_eq!(
            json,
            serde_json::json!({ "target": "project", "path": "/x/y" }),
        );
    }
}
