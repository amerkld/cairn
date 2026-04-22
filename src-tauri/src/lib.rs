//! Cairn core library.
//!
//! The frontend talks to this crate through Tauri `#[command]` entry points
//! registered here. All filesystem access, vault lifecycle, reminder
//! scheduling, and search live in submodules — the frontend never touches
//! `std::fs` directly.
//!
//! See `docs/ARCHITECTURE.md` for the module responsibilities and IPC contract.

pub mod error;
pub mod fs;
pub mod md;
pub mod preferences;
pub mod registry;
pub mod reminders;
pub mod search;
pub mod state;
pub mod tags;
pub mod trash;
pub mod vault;
pub mod watcher;

mod commands;

use parking_lot::{Mutex, RwLock};
use reminders::SchedulerHandle;
use tauri::{Emitter, Manager, Monitor, PhysicalPosition, WindowEvent};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
use watcher::WatcherHandle;

/// Label of the floating Quick Capture window declared in `tauri.conf.json`.
pub const QUICK_CAPTURE_WINDOW: &str = "quick-capture";
/// Event emitted to the Quick Capture window when the global shortcut fires
/// or a caller requests it via `show_quick_capture`. The React side listens
/// for this to reset the form state.
pub const QUICK_CAPTURE_OPEN_EVENT: &str = "quick-capture:open";

/// Shared app state held by the Tauri runtime.
///
/// - `registry` holds the list of known vaults + which one is active, loaded
///   from disk at startup.
/// - `watcher` is the file watcher for the currently active vault (if any).
///   It is torn down and rebuilt on every vault switch so we never watch
///   multiple vault trees at once.
/// - `reminders` is the per-vault scheduler — polls for due reminders, fires
///   OS notifications, and emits `reminder_due` events.
/// - `preferences` is app-wide (not per-vault) user preferences — currently
///   just the configurable Quick Capture shortcut.
pub struct AppState {
    pub registry: RwLock<registry::Registry>,
    pub watcher: Mutex<Option<WatcherHandle>>,
    pub reminders: Mutex<Option<SchedulerHandle>>,
    pub preferences: RwLock<preferences::Preferences>,
}

/// Show, focus, and signal the Quick Capture window. Used by both the
/// global-shortcut handler and the `show_quick_capture` command. Failures
/// are logged but not bubbled — the user's global keypress should never
/// error out because of a transient window state.
///
/// Before showing, re-centers the window on the monitor currently containing
/// the mouse cursor. Without this, a user on a multi-monitor setup would
/// see the window appear on whichever display happened to "own" it last
/// (typically the primary), regardless of where they're actually working.
pub fn show_quick_capture_window(app: &tauri::AppHandle) {
    let Some(window) = app.get_webview_window(QUICK_CAPTURE_WINDOW) else {
        eprintln!("quick-capture window not found");
        return;
    };

    // Position first, so the window doesn't flash on the old monitor.
    if let Some(monitor) = monitor_under_cursor(app) {
        let m_pos = monitor.position();
        let m_size = monitor.size();
        let win_size = match window.outer_size() {
            Ok(s) => s,
            // Fall back to the config defaults; same units as monitor size.
            Err(_) => tauri::PhysicalSize::new(520, 300),
        };
        let x = m_pos.x + ((m_size.width as i32 - win_size.width as i32) / 2).max(0);
        let y = m_pos.y + ((m_size.height as i32 - win_size.height as i32) / 2).max(0);
        if let Err(e) = window.set_position(PhysicalPosition::new(x, y)) {
            eprintln!("failed to position quick-capture window: {e}");
        }
    }

    if let Err(e) = window.show() {
        eprintln!("failed to show quick-capture window: {e}");
    }
    if let Err(e) = window.set_focus() {
        eprintln!("failed to focus quick-capture window: {e}");
    }
    // Emit after show so the React listener is definitely mounted on
    // first-open; subsequent emits still reset the form state.
    if let Err(e) = window.emit(QUICK_CAPTURE_OPEN_EVENT, ()) {
        eprintln!("failed to emit quick-capture open event: {e}");
    }
}

/// Return the monitor currently containing the mouse cursor, falling back
/// to the primary monitor when we can't resolve a match (e.g. cursor is
/// between displays or the platform lies). Returns `None` only when we
/// can't enumerate any monitor at all.
fn monitor_under_cursor(app: &tauri::AppHandle) -> Option<Monitor> {
    let cursor = app.cursor_position().ok()?;
    let monitors = app.available_monitors().ok()?;
    for m in &monitors {
        let pos = m.position();
        let size = m.size();
        let x_start = pos.x as f64;
        let y_start = pos.y as f64;
        let x_end = x_start + size.width as f64;
        let y_end = y_start + size.height as f64;
        if cursor.x >= x_start
            && cursor.x < x_end
            && cursor.y >= y_start
            && cursor.y < y_end
        {
            return Some(m.clone());
        }
    }
    app.primary_monitor().ok().flatten()
}

/// True when any Cairn window currently has OS focus. The global Quick
/// Capture shortcut uses this to stay out of the way while the user is
/// already inside Cairn — popping a floating dialog on top of the main
/// window is surprising and doesn't add anything the in-app flows can't do.
fn any_cairn_window_focused(app: &tauri::AppHandle) -> bool {
    for label in [crate::QUICK_CAPTURE_WINDOW, "main"] {
        if let Some(w) = app.get_webview_window(label) {
            if w.is_focused().unwrap_or(false) {
                return true;
            }
        }
    }
    false
}

/// Build and run the Tauri application.
///
/// Kept as a library entry so integration tests can construct a builder
/// against a mock runtime without going through `main`.
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    // Only fire on key-down; key-up would double-trigger.
                    if event.state() != ShortcutState::Pressed {
                        return;
                    }
                    // Stay out of the way when Cairn already has focus.
                    // The user is inside the app and can create a capture
                    // the normal way — popping a floating dialog on top
                    // of their workspace would be disruptive. The keypress
                    // is already consumed by the OS hotkey registration,
                    // so there's nothing else to do but return.
                    if any_cairn_window_focused(app) {
                        return;
                    }
                    show_quick_capture_window(app);
                })
                .build(),
        )
        .setup(|app| {
            let data_dir = app
                .path()
                .app_data_dir()
                .map_err(|e| format!("resolving app_data_dir: {e}"))?;
            let reg = registry::Registry::load(&data_dir)
                .map_err(|e| format!("loading registry: {e}"))?;
            let prefs = preferences::Preferences::load(&data_dir)
                .map_err(|e| format!("loading preferences: {e}"))?;
            let initial_shortcut = prefs.quick_capture_shortcut().to_string();
            app.manage(AppState {
                registry: RwLock::new(reg),
                watcher: Mutex::new(None),
                reminders: Mutex::new(None),
                preferences: RwLock::new(prefs),
            });

            // Convert window close on the floating Quick Capture window into
            // a hide — we want the user's binding to feel stateless (open,
            // type, dismiss, reopen), not "you closed it, now the shortcut
            // is broken".
            if let Some(qc) = app.get_webview_window(QUICK_CAPTURE_WINDOW) {
                let qc_for_event = qc.clone();
                qc.on_window_event(move |event| {
                    if let WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = qc_for_event.hide();
                    }
                });
            }

            // Register the configured Quick Capture shortcut. A failure here
            // (bad accelerator saved in prefs, OS already claiming the combo)
            // must not block startup — the rest of the app still works, and
            // the user can change the binding from Settings.
            if let Err(err) = app.global_shortcut().register(initial_shortcut.as_str()) {
                eprintln!(
                    "failed to register initial Quick Capture shortcut '{initial_shortcut}': {err}",
                );
            }

            // If we have a previously-active vault, start its watcher +
            // reminder scheduler now.
            if let Some(active) = app
                .state::<AppState>()
                .registry
                .read()
                .active()
                .cloned()
            {
                let handle = app.app_handle().clone();
                if let Ok(w) = watcher::start(handle.clone(), active.path.clone()) {
                    *app.state::<AppState>().watcher.lock() = Some(w);
                }
                if let Ok(r) = reminders::start(handle, active.path.clone()) {
                    // Seed the scheduler with a fresh scan so it doesn't rely
                    // on a stale on-disk index from a prior run.
                    let _ = r.rebuild();
                    *app.state::<AppState>().reminders.lock() = Some(r);
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_vaults,
            commands::open_vault,
            commands::create_vault,
            commands::get_active_vault,
            commands::switch_vault,
            commands::close_active_vault,
            commands::forget_vault,
            commands::list_tree,
            commands::create_capture,
            commands::create_someday,
            commands::move_note,
            commands::read_note,
            commands::write_note,
            commands::paste_image,
            commands::create_project,
            commands::rename_project,
            commands::delete_project,
            commands::create_action,
            commands::complete_action,
            commands::list_home_actions,
            commands::reorder_actions,
            commands::get_editor_full_width,
            commands::set_editor_full_width,
            commands::list_folder,
            commands::set_remind_at,
            commands::list_reminders,
            commands::list_tags,
            commands::rename_tag,
            commands::delete_tag,
            commands::set_tag_color,
            commands::trash_note,
            commands::restore_trash,
            commands::empty_trash,
            commands::list_trash,
            commands::search_notes,
            commands::get_preferences,
            commands::set_quick_capture_shortcut,
            commands::show_quick_capture,
            commands::hide_quick_capture,
            commands::focus_main_window,
        ])
        .run(tauri::generate_context!())
        .expect("failed to start Cairn");
}
