//! Reminder scanning, persistence, and scheduling.
//!
//! Cairn tracks reminders via frontmatter: any note with `remind_at` set to
//! a future datetime is a pending reminder. This module:
//!
//! 1. **Scans** the vault on startup and after file changes to derive the
//!    current set of reminders, writing them to `.cairn/reminders.json`
//!    as a cheap cache (the cache also survives process restarts so the
//!    scheduler doesn't need to re-scan before it can fire anything).
//! 2. **Schedules** a single Tokio task that polls the cached list every
//!    10 seconds and fires any reminder whose time has passed. A 10-second
//!    granularity is deliberate: a more precise scheduler would need to
//!    reschedule on every file save, and the UX cost of being up to 10s
//!    late on a reminder is imperceptible.
//! 3. **Fires** by emitting a `reminder_due` event to the frontend and
//!    posting an OS notification. Once fired, the entry is removed from
//!    the cache so we don't re-fire on the next poll.

use crate::error::{AppError, AppResult};
use crate::md;
use crate::vault::CAIRN_DIR;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;
use tauri::async_runtime::{self, JoinHandle};
use tauri::{AppHandle, Emitter};
use tauri_plugin_notification::NotificationExt;
use tokio::sync::Mutex;
use walkdir::WalkDir;

const REMINDERS_FILE: &str = "reminders.json";
const POLL_INTERVAL: Duration = Duration::from_secs(10);

/// A single pending reminder. `path` is the absolute path to the note.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Entry {
    pub path: PathBuf,
    pub title: String,
    #[serde(rename = "remindAt")]
    pub remind_at: DateTime<Utc>,
}

/// The event payload emitted to the frontend when a reminder fires.
#[derive(Debug, Clone, Serialize)]
pub struct ReminderDuePayload {
    pub path: PathBuf,
    pub title: String,
    #[serde(rename = "remindAt")]
    pub remind_at: DateTime<Utc>,
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct IndexFile {
    #[serde(default)]
    entries: Vec<Entry>,
}

// ─── Scan + persist ──────────────────────────────────────────────────────

/// Walk the vault and collect a reminder `Entry` for each markdown file that
/// has a `remind_at` frontmatter value. Skips `.cairn/` so internal files
/// never become reminders. Malformed notes are silently ignored — a corrupt
/// file must not prevent unrelated reminders from firing.
pub fn scan_vault(vault_root: &Path) -> AppResult<Vec<Entry>> {
    let cairn_root = vault_root.join(CAIRN_DIR);
    let mut out: Vec<Entry> = Vec::new();

    for entry in WalkDir::new(vault_root)
        .into_iter()
        .filter_entry(|e| e.path() != cairn_root)
        .filter_map(|e| e.ok())
    {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        if path.extension().and_then(|e| e.to_str()) != Some("md") {
            continue;
        }
        let Ok(raw) = fs::read_to_string(path) else {
            continue;
        };
        let Ok(parsed) = md::parse(&raw) else {
            continue;
        };
        if let Some(when) = parsed.frontmatter.remind_at {
            let stem = path
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("Untitled")
                .to_string();
            out.push(Entry {
                path: path.to_path_buf(),
                title: md::derive_title(&parsed, &stem),
                remind_at: when,
            });
        }
    }

    out.sort_by_key(|e| e.remind_at);
    Ok(out)
}

pub fn save_index(vault_root: &Path, entries: &[Entry]) -> AppResult<()> {
    let cairn = vault_root.join(CAIRN_DIR);
    fs::create_dir_all(&cairn)?;
    let path = cairn.join(REMINDERS_FILE);
    let file = IndexFile {
        entries: entries.to_vec(),
    };
    let bytes = serde_json::to_vec_pretty(&file)?;
    atomic_write(&path, &bytes)
}

pub fn load_index(vault_root: &Path) -> AppResult<Vec<Entry>> {
    let path = vault_root.join(CAIRN_DIR).join(REMINDERS_FILE);
    if !path.exists() {
        return Ok(Vec::new());
    }
    let bytes = fs::read(&path)?;
    let file: IndexFile = serde_json::from_slice(&bytes).unwrap_or_default();
    let mut entries = file.entries;
    entries.sort_by_key(|e| e.remind_at);
    Ok(entries)
}

fn atomic_write(path: &Path, bytes: &[u8]) -> AppResult<()> {
    let tmp = path.with_extension("tmp");
    fs::write(&tmp, bytes)?;
    fs::rename(&tmp, path)?;
    Ok(())
}

/// Partition `entries` into (due, pending) by the given `now`. Due entries
/// have `remind_at <= now`. The `pending` list stays sorted ascending by
/// `remind_at`.
pub fn partition_due(entries: Vec<Entry>, now: DateTime<Utc>) -> (Vec<Entry>, Vec<Entry>) {
    let mut due = Vec::new();
    let mut pending = Vec::new();
    for e in entries {
        if e.remind_at <= now {
            due.push(e);
        } else {
            pending.push(e);
        }
    }
    pending.sort_by_key(|e| e.remind_at);
    (due, pending)
}

// ─── Scheduler ───────────────────────────────────────────────────────────

type SharedEntries = Arc<Mutex<Vec<Entry>>>;

pub struct SchedulerHandle {
    entries: SharedEntries,
    vault_root: PathBuf,
    task: JoinHandle<()>,
}

impl SchedulerHandle {
    /// Replace the in-memory entries with a fresh scan of the vault, then
    /// persist. Called on startup and whenever the file watcher reports a
    /// vault change.
    pub fn rebuild(&self) -> AppResult<()> {
        let fresh = scan_vault(&self.vault_root)?;
        save_index(&self.vault_root, &fresh)?;
        let entries = self.entries.clone();
        async_runtime::spawn(async move {
            let mut guard = entries.lock().await;
            *guard = fresh;
        });
        Ok(())
    }
}

impl Drop for SchedulerHandle {
    fn drop(&mut self) {
        self.task.abort();
    }
}

/// Start the reminder scheduler for `vault_root`. Seeds from the on-disk
/// index (or an empty list if none), spawns a poll loop that fires due
/// reminders, and returns a handle the caller keeps alive.
pub fn start(app: AppHandle, vault_root: PathBuf) -> AppResult<SchedulerHandle> {
    let initial = load_index(&vault_root).unwrap_or_default();
    let entries: SharedEntries = Arc::new(Mutex::new(initial));

    let task = async_runtime::spawn(poll_loop(
        app,
        vault_root.clone(),
        entries.clone(),
    ));

    Ok(SchedulerHandle {
        entries,
        vault_root,
        task,
    })
}

async fn poll_loop(app: AppHandle, vault_root: PathBuf, entries: SharedEntries) {
    let mut ticker = tokio::time::interval(POLL_INTERVAL);
    // Skip the immediate tick so we don't fire on a clock exactly equal to
    // remind_at the instant the app starts — give the UI a moment first.
    ticker.tick().await;

    loop {
        ticker.tick().await;

        let now = Utc::now();
        let due = {
            let mut guard = entries.lock().await;
            let taken = std::mem::take(&mut *guard);
            let (due, pending) = partition_due(taken, now);
            *guard = pending;
            due
        };

        if due.is_empty() {
            continue;
        }

        // Persist the reduced list so a restart doesn't re-fire.
        let pending_snapshot = entries.lock().await.clone();
        if let Err(e) = save_index(&vault_root, &pending_snapshot) {
            eprintln!("reminders: failed to save index after firing: {e}");
        }

        for entry in due {
            fire(&app, &entry);
        }
    }
}

fn fire(app: &AppHandle, entry: &Entry) {
    let _ = app.emit(
        "reminder_due",
        ReminderDuePayload {
            path: entry.path.clone(),
            title: entry.title.clone(),
            remind_at: entry.remind_at,
        },
    );

    if let Err(e) = app
        .notification()
        .builder()
        .title("Cairn reminder")
        .body(&entry.title)
        .show()
    {
        eprintln!("reminders: failed to post OS notification: {e}");
    }
}

// ─── Mutation helpers ────────────────────────────────────────────────────

/// Patch a note's `remind_at` frontmatter. Writes atomically; the caller is
/// expected to trigger a scheduler rebuild afterwards so the change takes
/// effect immediately (rather than waiting for the watcher).
pub fn set_remind_at(
    vault_root: &Path,
    path: &Path,
    remind_at: Option<DateTime<Utc>>,
) -> AppResult<()> {
    assert_inside(vault_root, path)?;
    let mut parsed = crate::fs::read_note(path)?;
    parsed.frontmatter.remind_at = remind_at;
    crate::fs::write_note(path, &parsed)
}

fn assert_inside(vault_root: &Path, path: &Path) -> AppResult<()> {
    let root_str = vault_root.to_string_lossy();
    let p_str = path.to_string_lossy();
    if !p_str.starts_with(root_str.as_ref()) {
        return Err(AppError::NotWritable(path.to_path_buf()));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::fs as vault_fs;
    use crate::vault;
    use chrono::TimeZone;
    use tempfile::TempDir;

    fn setup_vault() -> (TempDir, PathBuf) {
        let dir = TempDir::new().unwrap();
        let root = dir.path().to_path_buf();
        vault::open(&root).unwrap();
        (dir, root)
    }

    fn write_note_with_remind_at(
        dir: &Path,
        filename: &str,
        title: &str,
        remind_at: &str,
    ) -> PathBuf {
        let path = dir.join(filename);
        let body = format!(
            "---\ntitle: {title}\nremind_at: {remind_at}\n---\n\n{title} body\n"
        );
        fs::write(&path, body).unwrap();
        path
    }

    #[test]
    fn scan_vault_finds_remind_at_across_directories() {
        let (_tmp, root) = setup_vault();
        // Someday note
        let someday_path = write_note_with_remind_at(
            &root.join("Someday"),
            "revisit-book.md",
            "Revisit book idea",
            "2026-06-01T09:00:00Z",
        );
        // Project note (created via create_project so the Actions dir exists too)
        let project = vault_fs::create_project(&root, "P").unwrap();
        let proj_path = write_note_with_remind_at(
            &project,
            "check-in.md",
            "Check in with Alice",
            "2026-05-20T10:30:00Z",
        );
        // Note without remind_at — should be skipped
        fs::write(root.join("Captures").join("ignore.md"), "---\n---\n\njust a capture\n").unwrap();

        let entries = scan_vault(&root).unwrap();
        let paths: Vec<_> = entries.iter().map(|e| e.path.clone()).collect();
        assert!(paths.contains(&someday_path));
        assert!(paths.contains(&proj_path));
        assert_eq!(entries.len(), 2);

        // Sorted ascending by remind_at.
        assert_eq!(entries[0].title, "Check in with Alice");
        assert_eq!(entries[1].title, "Revisit book idea");
    }

    #[test]
    fn scan_vault_skips_cairn_internal_files() {
        let (_tmp, root) = setup_vault();
        // Stash a file with remind_at inside .cairn/ — must NOT be picked up.
        fs::write(
            root.join(".cairn").join("stray.md"),
            "---\nremind_at: 2026-05-01T00:00:00Z\n---\n",
        )
        .unwrap();

        let entries = scan_vault(&root).unwrap();
        assert!(entries.is_empty());
    }

    #[test]
    fn save_and_load_index_round_trips() {
        let (_tmp, root) = setup_vault();
        let entries = vec![Entry {
            path: root.join("Someday").join("a.md"),
            title: "A".into(),
            remind_at: Utc.with_ymd_and_hms(2026, 6, 1, 9, 0, 0).unwrap(),
        }];
        save_index(&root, &entries).unwrap();
        let loaded = load_index(&root).unwrap();
        assert_eq!(loaded, entries);
    }

    #[test]
    fn load_index_missing_file_returns_empty() {
        let (_tmp, root) = setup_vault();
        // Don't write anything — the default bootstrap writes an empty-entries
        // file; remove it to simulate a first boot on a hand-created vault.
        let path = root.join(CAIRN_DIR).join(REMINDERS_FILE);
        if path.exists() {
            fs::remove_file(&path).unwrap();
        }
        let loaded = load_index(&root).unwrap();
        assert!(loaded.is_empty());
    }

    #[test]
    fn load_index_tolerates_corrupt_file() {
        let (_tmp, root) = setup_vault();
        fs::write(root.join(CAIRN_DIR).join(REMINDERS_FILE), b"not json").unwrap();
        let loaded = load_index(&root).unwrap();
        assert!(loaded.is_empty());
    }

    #[test]
    fn partition_due_splits_past_from_future() {
        let now = Utc.with_ymd_and_hms(2026, 5, 1, 12, 0, 0).unwrap();
        let entries = vec![
            Entry {
                path: "/a".into(),
                title: "past".into(),
                remind_at: Utc.with_ymd_and_hms(2026, 5, 1, 11, 0, 0).unwrap(),
            },
            Entry {
                path: "/b".into(),
                title: "now".into(),
                remind_at: now,
            },
            Entry {
                path: "/c".into(),
                title: "future".into(),
                remind_at: Utc.with_ymd_and_hms(2026, 5, 1, 13, 0, 0).unwrap(),
            },
        ];
        let (due, pending) = partition_due(entries, now);
        assert_eq!(due.len(), 2);
        assert_eq!(pending.len(), 1);
        assert_eq!(pending[0].title, "future");
    }

    #[test]
    fn set_remind_at_writes_frontmatter_preserving_body() {
        let (_tmp, root) = setup_vault();
        let path = root.join("Someday").join("x.md");
        fs::write(&path, "---\ntitle: Hello\n---\n\nBody text\n").unwrap();

        let when = Utc.with_ymd_and_hms(2026, 7, 4, 9, 0, 0).unwrap();
        set_remind_at(&root, &path, Some(when)).unwrap();

        let raw = fs::read_to_string(&path).unwrap();
        assert!(raw.contains("remind_at:"));
        assert!(raw.contains("Body text"));
    }

    #[test]
    fn set_remind_at_none_clears_the_field() {
        let (_tmp, root) = setup_vault();
        let path = write_note_with_remind_at(
            &root.join("Someday"),
            "x.md",
            "X",
            "2026-06-01T09:00:00Z",
        );

        set_remind_at(&root, &path, None).unwrap();

        let raw = fs::read_to_string(&path).unwrap();
        assert!(!raw.contains("remind_at"));
    }

    #[test]
    fn set_remind_at_rejects_path_outside_vault() {
        let (_tmp, root) = setup_vault();
        let escape = TempDir::new().unwrap();
        let path = escape.path().join("x.md");
        fs::write(&path, "---\n---\n").unwrap();
        let err = set_remind_at(&root, &path, None).unwrap_err();
        assert!(matches!(err, AppError::NotWritable(_)));
    }
}
