//! Tauri command entry points.
//!
//! Every command is a thin translator between IPC arguments and the
//! `vault`/`registry`/`fs` modules. Business logic lives in the modules;
//! commands should not grow conditionals or side effects beyond `invoke`
//! adaptation.

use crate::error::{AppError, AppResult};
use crate::fs::{self, FolderContents, NoteRef, Tree};
use crate::md::ParsedNote;
use crate::reminders::{self, Entry as ReminderEntry};
use crate::search::{self, SearchHit};
use crate::state as vault_state;
use crate::tags::{self, TagInfo};
use crate::trash::{self, Entry as TrashEntry};
use crate::vault::{self, CAPTURES_DIR, SOMEDAY_DIR, VaultSummary};
use crate::watcher;
use crate::AppState;
use chrono::{DateTime, Utc};
use serde::Serialize;
use std::path::PathBuf;
use tauri::{AppHandle, State};

#[tauri::command]
pub fn list_vaults(state: State<'_, AppState>) -> AppResult<Vec<VaultSummary>> {
    Ok(state.registry.read().list())
}

#[tauri::command]
pub fn open_vault(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
) -> AppResult<VaultSummary> {
    let p = PathBuf::from(&path);
    let summary = vault::open(&p)?;
    let saved = {
        let mut reg = state.registry.write();
        let saved = reg.upsert(summary)?;
        reg.set_active(&saved.path)?;
        saved
    };
    replace_watcher(&app, &state, saved.path.clone());
    Ok(saved)
}

#[tauri::command]
pub fn create_vault(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
    name: String,
) -> AppResult<VaultSummary> {
    let p = PathBuf::from(&path);
    let summary = vault::create(&p, &name)?;
    let saved = {
        let mut reg = state.registry.write();
        let saved = reg.upsert(summary)?;
        reg.set_active(&saved.path)?;
        saved
    };
    replace_watcher(&app, &state, saved.path.clone());
    Ok(saved)
}

#[tauri::command]
pub fn get_active_vault(state: State<'_, AppState>) -> AppResult<Option<VaultSummary>> {
    Ok(state.registry.read().active().cloned())
}

#[tauri::command]
pub fn switch_vault(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
) -> AppResult<VaultSummary> {
    let p = PathBuf::from(&path);
    let summary = vault::open(&p)?;
    let saved = {
        let mut reg = state.registry.write();
        let saved = reg.upsert(summary)?;
        reg.set_active(&saved.path)?;
        saved
    };
    replace_watcher(&app, &state, saved.path.clone());
    Ok(saved)
}

#[tauri::command]
pub fn close_active_vault(state: State<'_, AppState>) -> AppResult<()> {
    state.registry.write().clear_active()?;
    *state.watcher.lock() = None;
    *state.reminders.lock() = None;
    Ok(())
}

/// Remove a vault from the recents registry. The on-disk vault itself is
/// untouched — this only forgets that Cairn knew about it.
#[tauri::command]
pub fn forget_vault(state: State<'_, AppState>, path: String) -> AppResult<()> {
    state.registry.write().remove(&PathBuf::from(path))
}

#[tauri::command]
pub fn list_tree(state: State<'_, AppState>) -> AppResult<Tree> {
    let root = active_vault_path(&state)?;
    fs::list_tree(&root)
}

/// Browse a single folder inside the active vault. Returns its markdown
/// files plus its direct subfolders. Used by the project docs browser.
#[tauri::command]
pub fn list_folder(state: State<'_, AppState>, path: String) -> AppResult<FolderContents> {
    let root = active_vault_path(&state)?;
    let p = PathBuf::from(path);
    fs::list_folder(&root, &p)
}

/// Set (or clear, when `remindAt` is `None`) the `remind_at` frontmatter on a
/// note. Triggers a scheduler rebuild so the change takes effect immediately.
#[tauri::command]
pub fn set_remind_at(
    state: State<'_, AppState>,
    path: String,
    remind_at: Option<DateTime<Utc>>,
) -> AppResult<()> {
    let root = active_vault_path(&state)?;
    let p = PathBuf::from(path);
    reminders::set_remind_at(&root, &p, remind_at)?;
    if let Some(scheduler) = state.reminders.lock().as_ref() {
        scheduler.rebuild()?;
    }
    Ok(())
}

/// Return the current list of pending reminders for the active vault.
#[tauri::command]
pub fn list_reminders(state: State<'_, AppState>) -> AppResult<Vec<ReminderEntry>> {
    let root = active_vault_path(&state)?;
    reminders::load_index(&root)
}

#[tauri::command]
pub fn list_tags(state: State<'_, AppState>) -> AppResult<Vec<TagInfo>> {
    let root = active_vault_path(&state)?;
    tags::list_tags(&root)
}

/// Rename `old` → `new` across config + frontmatter. Returns the number of
/// notes rewritten. Caller can show this in a toast: "Renamed tag (12 notes
/// updated)".
#[tauri::command]
pub fn rename_tag(
    state: State<'_, AppState>,
    old: String,
    new: String,
) -> AppResult<u32> {
    let root = active_vault_path(&state)?;
    tags::rename_tag(&root, &old, &new)
}

#[tauri::command]
pub fn delete_tag(state: State<'_, AppState>, label: String) -> AppResult<u32> {
    let root = active_vault_path(&state)?;
    tags::delete_tag(&root, &label)
}

#[tauri::command]
pub fn set_tag_color(
    state: State<'_, AppState>,
    label: String,
    color: Option<String>,
) -> AppResult<()> {
    let root = active_vault_path(&state)?;
    tags::set_tag_color(&root, &label, color.as_deref())
}

// ─── trash ───────────────────────────────────────────────────────────────

#[tauri::command]
pub fn trash_note(state: State<'_, AppState>, path: String) -> AppResult<PathBuf> {
    let root = active_vault_path(&state)?;
    trash::move_to_trash(&root, &PathBuf::from(path))
}

#[tauri::command]
pub fn restore_trash(
    state: State<'_, AppState>,
    trashed_path: String,
) -> AppResult<PathBuf> {
    let root = active_vault_path(&state)?;
    trash::restore(&root, &PathBuf::from(trashed_path))
}

#[tauri::command]
pub fn empty_trash(state: State<'_, AppState>) -> AppResult<u32> {
    let root = active_vault_path(&state)?;
    trash::empty(&root)
}

#[tauri::command]
pub fn list_trash(state: State<'_, AppState>) -> AppResult<Vec<TrashEntry>> {
    let root = active_vault_path(&state)?;
    trash::list(&root)
}

// ─── search ──────────────────────────────────────────────────────────────

#[tauri::command]
pub fn search_notes(
    state: State<'_, AppState>,
    query: String,
    limit: Option<usize>,
) -> AppResult<Vec<SearchHit>> {
    let root = active_vault_path(&state)?;
    search::search(&root, &query, limit)
}

/// Create a capture — a new note under `Captures/` — with an optional
/// initial body. Returns the ref so the UI can append it to the list
/// before the file watcher round-trips.
#[tauri::command]
pub fn create_capture(state: State<'_, AppState>, body: Option<String>) -> AppResult<NoteRef> {
    let root = active_vault_path(&state)?;
    fs::create_note(&root.join(CAPTURES_DIR), body.as_deref())
}

/// Create a Someday note — a new markdown file under `Someday/`. Identical
/// to `create_capture` in shape, separated so UI intent is unambiguous.
#[tauri::command]
pub fn create_someday(state: State<'_, AppState>, body: Option<String>) -> AppResult<NoteRef> {
    let root = active_vault_path(&state)?;
    fs::create_note(&root.join(SOMEDAY_DIR), body.as_deref())
}

/// Move a note to a different location inside the active vault. `target`
/// is a high-level location keyword (`"someday"`, `"captures"`, or a full
/// relative path under the vault root).
#[tauri::command]
pub fn move_note(
    state: State<'_, AppState>,
    src: String,
    target: String,
) -> AppResult<PathBuf> {
    let root = active_vault_path(&state)?;
    let src_path = PathBuf::from(src);
    let filename = src_path
        .file_name()
        .ok_or_else(|| AppError::PathNotFound(src_path.clone()))?
        .to_owned();

    let dst = match target.as_str() {
        "captures" => root.join(CAPTURES_DIR).join(&filename),
        "someday" => root.join(SOMEDAY_DIR).join(&filename),
        custom => {
            // Treat as a relative path under the vault root.
            root.join(custom).join(&filename)
        }
    };

    fs::move_note(&root, &src_path, &dst)
}

#[tauri::command]
pub fn read_note(state: State<'_, AppState>, path: String) -> AppResult<ParsedNote> {
    let root = active_vault_path(&state)?;
    let p = PathBuf::from(path);
    // Reject reads outside the active vault so a compromised renderer can't
    // use this command to exfiltrate arbitrary files.
    assert_inside(&root, &p)?;
    fs::read_note(&p)
}

#[tauri::command]
pub fn write_note(
    state: State<'_, AppState>,
    path: String,
    note: ParsedNote,
) -> AppResult<()> {
    let root = active_vault_path(&state)?;
    let p = PathBuf::from(path);
    assert_inside(&root, &p)?;
    fs::write_note(&p, &note)
}

/// Paste an image next to a note. `bytes` is the raw file content; `ext`
/// is the image extension (with or without a leading dot).
///
/// Returns a path relative to the note's parent directory so the caller can
/// drop it straight into a markdown link.
#[tauri::command]
pub fn paste_image(
    state: State<'_, AppState>,
    note_path: String,
    ext: String,
    bytes: Vec<u8>,
) -> AppResult<PathBuf> {
    let root = active_vault_path(&state)?;
    let p = PathBuf::from(note_path);
    fs::paste_image(&root, &p, &ext, &bytes)
}

#[tauri::command]
pub fn create_project(state: State<'_, AppState>, name: String) -> AppResult<PathBuf> {
    let root = active_vault_path(&state)?;
    fs::create_project(&root, &name)
}

#[tauri::command]
pub fn create_action(
    state: State<'_, AppState>,
    project_path: String,
    body: Option<String>,
) -> AppResult<NoteRef> {
    let root = active_vault_path(&state)?;
    let p = PathBuf::from(project_path);
    assert_inside(&root, &p)?;
    fs::create_action(&p, body.as_deref())
}

#[tauri::command]
pub fn complete_action(
    state: State<'_, AppState>,
    path: String,
    note: Option<String>,
) -> AppResult<PathBuf> {
    let root = active_vault_path(&state)?;
    fs::complete_action(&root, &PathBuf::from(path), note.as_deref())
}

/// A flat action entry for the Home dashboard: the action itself plus its
/// owning project so the UI can group and label without re-walking the tree.
#[derive(Serialize)]
pub struct HomeAction {
    #[serde(rename = "projectName")]
    pub project_name: String,
    #[serde(rename = "projectPath")]
    pub project_path: PathBuf,
    pub action: NoteRef,
}

/// List all open actions across the vault, ordered per `.cairn/state.json`.
/// Items not in the stored order follow, sorted by the tree's default
/// (creation time, newest first).
#[tauri::command]
pub fn list_home_actions(state: State<'_, AppState>) -> AppResult<Vec<HomeAction>> {
    let root = active_vault_path(&state)?;
    let tree = fs::list_tree(&root)?;

    let stored_order = vault_state::load(&root)?.action_order;

    let mut entries: Vec<HomeAction> = Vec::new();
    for project in tree.projects {
        for action in project.actions {
            entries.push(HomeAction {
                project_name: project.name.clone(),
                project_path: project.path.clone(),
                action,
            });
        }
    }

    // Apply stored order. `stored_order` holds absolute paths as strings.
    entries.sort_by_key(|e| {
        stored_order
            .iter()
            .position(|p| p == &e.action.path.to_string_lossy())
            .map(|i| i as i64)
            .unwrap_or(i64::MAX)
    });

    Ok(entries)
}

#[tauri::command]
pub fn reorder_actions(
    state: State<'_, AppState>,
    order: Vec<String>,
) -> AppResult<Vec<String>> {
    let root = active_vault_path(&state)?;
    vault_state::set_action_order(&root, order)
}

fn assert_inside(vault_root: &PathBuf, p: &PathBuf) -> AppResult<()> {
    // Cheap string-based containment check. A full canonicalization happens
    // inside fs:: for operations that actually write; this just short-circuits
    // wildly-out-of-vault reads early.
    let root_str = vault_root.to_string_lossy();
    let p_str = p.to_string_lossy();
    if !p_str.starts_with(root_str.as_ref()) {
        return Err(AppError::NotWritable(p.clone()));
    }
    Ok(())
}

fn active_vault_path(state: &State<'_, AppState>) -> AppResult<PathBuf> {
    state
        .registry
        .read()
        .active()
        .map(|v| v.path.clone())
        .ok_or(AppError::NoActiveVault)
}

fn replace_watcher(app: &AppHandle, state: &State<'_, AppState>, root: PathBuf) {
    // Drop the previous watcher + scheduler first so OS resources are
    // released before we claim them again on the same path.
    {
        let mut slot = state.watcher.lock();
        *slot = None;
    }
    {
        let mut slot = state.reminders.lock();
        *slot = None;
    }
    if let Ok(w) = watcher::start(app.clone(), root.clone()) {
        *state.watcher.lock() = Some(w);
    }
    if let Ok(r) = reminders::start(app.clone(), root) {
        let _ = r.rebuild();
        *state.reminders.lock() = Some(r);
    }
}
