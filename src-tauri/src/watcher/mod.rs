//! Recursive file watcher for the active vault.
//!
//! A watcher fires a `vault.changed` event to the frontend whenever files
//! inside the vault change on disk — whether Cairn wrote them or an external
//! editor did. Events are debounced (150ms) to collapse the flurry of
//! notifications that a single save produces on most filesystems, and
//! paths inside `.cairn/` are filtered out so internal writes (registry
//! saves, trash index updates) don't trigger unnecessary UI refetches.
//!
//! The watcher is owned by `AppState::watcher` as a `Mutex<Option<…>>`: one
//! lives at a time, is replaced when the active vault changes, and is
//! cleanly torn down on drop.

use crate::error::AppResult;
use crate::vault::CAIRN_DIR;
use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::time::Duration;
use tauri::async_runtime::{self, JoinHandle};
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::mpsc;
use tokio::time::{timeout, Instant};

const DEBOUNCE: Duration = Duration::from_millis(150);

#[derive(Debug, Serialize, Clone)]
struct VaultChangedPayload {
    paths: Vec<String>,
}

/// Active watcher owning the notify backend + the tokio task that dispatches
/// debounced events. Dropping stops the backend and aborts the task.
pub struct WatcherHandle {
    // Held to keep the OS-level watcher alive.
    _watcher: RecommendedWatcher,
    // `tauri::async_runtime::JoinHandle` so we spawn onto Tauri's own Tokio
    // runtime and don't depend on a runtime context at call time (open_vault
    // is a sync command, which otherwise has no runtime in scope).
    task: JoinHandle<()>,
    root: PathBuf,
}

impl WatcherHandle {
    pub fn root(&self) -> &Path {
        &self.root
    }
}

impl Drop for WatcherHandle {
    fn drop(&mut self) {
        self.task.abort();
    }
}

/// Spawn a watcher on `vault_root`. Events inside `.cairn/` are filtered out.
pub fn start(app: AppHandle, vault_root: PathBuf) -> AppResult<WatcherHandle> {
    let (tx, rx) = mpsc::unbounded_channel::<PathBuf>();

    let tx_for_callback = tx;
    let mut watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        if let Ok(event) = res {
            for p in event.paths {
                // Best effort; receiver may be gone during shutdown.
                let _ = tx_for_callback.send(p);
            }
        }
    })
    .map_err(watcher_error)?;

    watcher
        .watch(&vault_root, RecursiveMode::Recursive)
        .map_err(watcher_error)?;

    let task_root = vault_root.clone();
    let task = async_runtime::spawn(dispatch_loop(app, task_root, rx));

    Ok(WatcherHandle {
        _watcher: watcher,
        task,
        root: vault_root,
    })
}

async fn dispatch_loop(
    app: AppHandle,
    vault_root: PathBuf,
    mut rx: mpsc::UnboundedReceiver<PathBuf>,
) {
    loop {
        // Block until at least one event arrives. Channel close ends the loop.
        let Some(first) = rx.recv().await else {
            return;
        };
        let mut pending: HashSet<PathBuf> = HashSet::new();
        accept(&mut pending, &vault_root, first);

        // Drain everything arriving within the debounce window.
        let deadline = Instant::now() + DEBOUNCE;
        loop {
            let now = Instant::now();
            if now >= deadline {
                break;
            }
            match timeout(deadline - now, rx.recv()).await {
                Ok(Some(p)) => accept(&mut pending, &vault_root, p),
                Ok(None) => {
                    flush(&app, &pending);
                    return;
                }
                Err(_) => break, // timeout hit
            }
        }

        flush(&app, &pending);
    }
}

fn accept(bucket: &mut HashSet<PathBuf>, vault_root: &Path, path: PathBuf) {
    if is_inside_dot_cairn(vault_root, &path) {
        return;
    }
    bucket.insert(path);
}

fn flush(app: &AppHandle, paths: &HashSet<PathBuf>) {
    if paths.is_empty() {
        return;
    }
    let payload = VaultChangedPayload {
        paths: paths
            .iter()
            .map(|p| p.to_string_lossy().to_string())
            .collect(),
    };
    let _ = app.emit("vault.changed", payload);

    // Also nudge the reminder scheduler so a newly-added or edited remind_at
    // takes effect immediately rather than waiting for the next app launch.
    if let Some(state) = app.try_state::<crate::AppState>() {
        if let Some(scheduler) = state.reminders.lock().as_ref() {
            let _ = scheduler.rebuild();
        }
    }
}

fn is_inside_dot_cairn(vault_root: &Path, path: &Path) -> bool {
    let cairn_root = vault_root.join(CAIRN_DIR);
    path.starts_with(&cairn_root)
}

fn watcher_error(e: notify::Error) -> crate::error::AppError {
    crate::error::AppError::Io(std::io::Error::other(e.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dot_cairn_paths_are_filtered_out() {
        let root = PathBuf::from("/vault");
        let inside = PathBuf::from("/vault/.cairn/config.json");
        let outside = PathBuf::from("/vault/Captures/note.md");
        assert!(is_inside_dot_cairn(&root, &inside));
        assert!(!is_inside_dot_cairn(&root, &outside));
    }

    #[test]
    fn accept_skips_dot_cairn_entries() {
        let vault = PathBuf::from("/v");
        let mut bucket = HashSet::new();
        accept(&mut bucket, &vault, PathBuf::from("/v/.cairn/state.json"));
        accept(&mut bucket, &vault, PathBuf::from("/v/Captures/a.md"));
        assert_eq!(bucket.len(), 1);
        assert!(bucket.contains(&PathBuf::from("/v/Captures/a.md")));
    }

    /// Regression: the watcher spawns its dispatch task on Tauri's managed
    /// async runtime so it can be started from a sync command handler. A
    /// plain `tokio::spawn` requires the caller to already be inside a
    /// Tokio runtime, which sync commands are not — using it panicked with
    /// "there is no reactor running" the moment a user opened their first
    /// vault. Spawning via `tauri::async_runtime::spawn` must work from a
    /// thread with no Tokio runtime in scope.
    #[test]
    fn tauri_runtime_spawn_works_from_sync_context() {
        // This test runs on the plain test thread — no #[tokio::test] wrapper,
        // no runtime guard. If we regress to plain `tokio::spawn`, this
        // panics the same way production did.
        let handle = async_runtime::spawn(async { 42_u32 });
        let result = async_runtime::block_on(handle).expect("join must not fail");
        assert_eq!(result, 42);
    }
}
