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
use tauri::Manager;
use watcher::WatcherHandle;

/// Shared app state held by the Tauri runtime.
///
/// - `registry` holds the list of known vaults + which one is active, loaded
///   from disk at startup.
/// - `watcher` is the file watcher for the currently active vault (if any).
///   It is torn down and rebuilt on every vault switch so we never watch
///   multiple vault trees at once.
/// - `reminders` is the per-vault scheduler — polls for due reminders, fires
///   OS notifications, and emits `reminder_due` events.
pub struct AppState {
    pub registry: RwLock<registry::Registry>,
    pub watcher: Mutex<Option<WatcherHandle>>,
    pub reminders: Mutex<Option<SchedulerHandle>>,
}

/// Build and run the Tauri application.
///
/// Kept as a library entry so integration tests can construct a builder
/// against a mock runtime without going through `main`.
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            let data_dir = app
                .path()
                .app_data_dir()
                .map_err(|e| format!("resolving app_data_dir: {e}"))?;
            let reg = registry::Registry::load(&data_dir)
                .map_err(|e| format!("loading registry: {e}"))?;
            app.manage(AppState {
                registry: RwLock::new(reg),
                watcher: Mutex::new(None),
                reminders: Mutex::new(None),
            });

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
        ])
        .run(tauri::generate_context!())
        .expect("failed to start Cairn");
}
