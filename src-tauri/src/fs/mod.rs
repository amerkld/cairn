//! Filesystem operations: atomic writes, vault tree listing, note creation
//! and moves. All user-facing IO happens here — commands and higher-level
//! modules must not call `std::fs` directly for paths inside a vault.
//!
//! Design rules enforced here:
//! - Writes to `.md` files go through `atomic_write` (tmp-file + rename) so
//!   a crash mid-write never leaves a half-written user file.
//! - `list_tree` is the only vault scanner. It skips `.cairn/` and any dot
//!   directories the user may have created.
//! - Move operations validate both source and destination stay within the
//!   vault root.

use crate::error::{AppError, AppResult};
use crate::md::{self, ParsedNote};
use crate::vault::{CAIRN_DIR, CAPTURES_DIR, PROJECTS_DIR, SOMEDAY_DIR, TRASH_DIR};
use chrono::{DateTime, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use ulid::Ulid;
use walkdir::WalkDir;

const MAX_PREVIEW_CHARS: usize = 140;
pub const ACTIONS_DIR: &str = "Actions";
pub const ARCHIVE_DIR: &str = "Archive";
const ASSETS_DIR: &str = "assets";

/// Supported image extensions for paste. Anything else is rejected with a
/// dedicated error so the frontend doesn't silently save arbitrary mime
/// types disguised as `.bin`.
pub const SUPPORTED_IMAGE_EXTS: &[&str] = &["png", "jpg", "jpeg", "gif", "webp"];

/// A lightweight reference to a note — enough to render a card or list row
/// without opening the file.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct NoteRef {
    pub path: PathBuf,
    pub title: String,
    pub preview: String,
    #[serde(rename = "createdAt", skip_serializing_if = "Option::is_none")]
    pub created_at: Option<DateTime<Utc>>,
    #[serde(default)]
    pub tags: Vec<String>,
    /// When set, the note is on the user's radar for reminder/review at this
    /// time. Populated from frontmatter `remind_at`.
    #[serde(rename = "remindAt", skip_serializing_if = "Option::is_none", default)]
    pub remind_at: Option<DateTime<Utc>>,
    /// Action deadline (date only, no time). Populated from frontmatter
    /// `deadline`.
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub deadline: Option<NaiveDate>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Project {
    pub name: String,
    pub path: PathBuf,
    #[serde(default)]
    pub actions: Vec<NoteRef>,
    /// Direct-child subdirectory names inside the project, excluding
    /// `Actions/`, `assets/`, and any hidden dirs. Lets the UI surface
    /// existing folders (research/, archive/, etc.) when moving notes
    /// into the project without walking the whole tree.
    #[serde(default)]
    pub subdirectories: Vec<String>,
}

/// The full vault tree grouped by area. Order within each area: most
/// recently created first (by frontmatter `created_at`, falling back to
/// filesystem modification time).
#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq, Eq)]
pub struct Tree {
    pub captures: Vec<NoteRef>,
    pub someday: Vec<NoteRef>,
    pub projects: Vec<Project>,
    pub trash: Vec<NoteRef>,
}

/// A single folder's contents: markdown files and direct subfolders.
/// Used by the project docs browser (`list_folder` command).
#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq, Eq)]
pub struct FolderContents {
    pub files: Vec<NoteRef>,
    pub folders: Vec<FolderEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct FolderEntry {
    pub name: String,
    pub path: PathBuf,
}

/// Atomic write: write bytes to `<path>.tmp` then rename to `<path>`. Avoids
/// leaving a user file half-written if the process crashes mid-write.
pub fn atomic_write(path: &Path, bytes: &[u8]) -> AppResult<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let tmp = path.with_extension("tmp");
    fs::write(&tmp, bytes)?;
    fs::rename(&tmp, path)?;
    Ok(())
}

/// Read a parsed note from disk.
pub fn read_note(path: &Path) -> AppResult<ParsedNote> {
    let raw = fs::read_to_string(path)?;
    md::parse(&raw)
}

/// Write a parsed note to disk atomically, preserving unknown frontmatter
/// keys through the round-trip.
pub fn write_note(path: &Path, note: &ParsedNote) -> AppResult<()> {
    let serialized = md::serialize(note)?;
    atomic_write(path, serialized.as_bytes())
}

/// Create a new markdown note in `dir` with default frontmatter (id + created_at)
/// and optional body. Filename is `<ulid>.md` so sort order matches creation
/// order and there are no collisions.
///
/// Returns the `NoteRef` that the UI can render immediately.
pub fn create_note(dir: &Path, body: Option<&str>) -> AppResult<NoteRef> {
    fs::create_dir_all(dir)?;
    let id = Ulid::new().to_string();
    let filename = format!("{id}.md");
    let path = dir.join(&filename);
    if path.exists() {
        return Err(AppError::Io(std::io::Error::new(
            std::io::ErrorKind::AlreadyExists,
            format!("note already exists: {}", path.display()),
        )));
    }
    let now = Utc::now();
    let note = ParsedNote {
        frontmatter: md::Frontmatter {
            id: Some(id.clone()),
            created_at: Some(now),
            ..Default::default()
        },
        body: body.unwrap_or("").to_string(),
    };
    write_note(&path, &note)?;

    Ok(NoteRef {
        path,
        title: md::derive_title(&note, "Untitled"),
        preview: md::preview(&note.body, MAX_PREVIEW_CHARS),
        created_at: Some(now),
        tags: Vec::new(),
        remind_at: None,
        deadline: None,
    })
}

/// Create a new project directory under `Projects/<name>/` with an empty
/// `Actions/` subdirectory. Project names are sanitized: path separators
/// and control characters are stripped; leading/trailing whitespace is
/// trimmed. Returns the project's absolute path.
pub fn create_project(vault_root: &Path, name: &str) -> AppResult<PathBuf> {
    let sanitized = sanitize_project_name(name);
    if sanitized.is_empty() {
        return Err(AppError::Io(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "project name cannot be empty",
        )));
    }
    let project_path = vault_root.join(crate::vault::PROJECTS_DIR).join(&sanitized);
    if project_path.exists() {
        return Err(AppError::Io(std::io::Error::new(
            std::io::ErrorKind::AlreadyExists,
            format!("project '{sanitized}' already exists"),
        )));
    }
    fs::create_dir_all(project_path.join(ACTIONS_DIR))?;
    Ok(project_path)
}

fn sanitize_project_name(name: &str) -> String {
    name.chars()
        .filter(|c| !matches!(c, '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|'))
        .filter(|c| !c.is_control())
        .collect::<String>()
        .trim()
        .to_string()
}

/// Rename a project folder. Sanitizes `new_name`, errors if another project
/// already claims that name, then atomically moves the directory and rewrites
/// path prefixes anywhere the old path was recorded (reminder index,
/// Home action order in `.cairn/state.json`).
///
/// Does **not** touch the frontmatter of notes inside the project — markdown
/// files don't record their own path, so the rename is purely a directory
/// move plus bookkeeping. Returns the new absolute project path.
pub fn rename_project(
    vault_root: &Path,
    old_path: &Path,
    new_name: &str,
) -> AppResult<PathBuf> {
    assert_inside_vault(vault_root, old_path)?;
    if !old_path.is_dir() {
        return Err(AppError::PathNotFound(old_path.to_path_buf()));
    }

    let sanitized = sanitize_project_name(new_name);
    if sanitized.is_empty() {
        return Err(AppError::Io(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "project name cannot be empty",
        )));
    }

    let projects_root = vault_root.join(crate::vault::PROJECTS_DIR);
    let new_path = projects_root.join(&sanitized);

    // If the new path is the same as the old, nothing to do.
    if new_path == old_path {
        return Ok(new_path);
    }

    if new_path.exists() {
        return Err(AppError::VaultAlreadyExists(new_path));
    }

    fs::rename(old_path, &new_path)?;
    rewrite_project_path_prefix(vault_root, old_path, &new_path)?;

    Ok(new_path)
}

/// Soft-delete a project folder by moving the whole tree into `.cairn/trash/`
/// as a single entry. Also purges any reminder-index or action-order entries
/// that pointed into the project so the scheduler and Home dashboard don't
/// try to surface actions that now live under `.cairn/trash/`.
///
/// On restore (via `trash::restore`), a reminder rebuild re-scans the notes
/// and picks up their `remind_at` frontmatter again automatically.
pub fn soft_delete_project(vault_root: &Path, path: &Path) -> AppResult<()> {
    assert_inside_vault(vault_root, path)?;
    if !path.is_dir() {
        return Err(AppError::PathNotFound(path.to_path_buf()));
    }

    // Drop stale references *before* the move so, if the move fails, we
    // don't leave pruned indices pointing to a live project.
    let mut reminders = crate::reminders::load_index(vault_root)?;
    let before_reminders = reminders.len();
    reminders.retain(|entry| !entry.path.starts_with(path));
    if reminders.len() != before_reminders {
        crate::reminders::save_index(vault_root, &reminders)?;
    }

    let mut state = crate::state::load(vault_root)?;
    let before_state = state.action_order.len();
    state.action_order.retain(|p| !Path::new(p).starts_with(path));
    if state.action_order.len() != before_state {
        crate::state::save(vault_root, &state)?;
    }

    crate::trash::move_to_trash(vault_root, path)?;
    Ok(())
}

/// Rewrite any stored reference to `old_path`'s prefix so it points at
/// `new_path` instead. Touches the reminder index and the cross-project
/// action order; both store paths as absolute paths the UI can round-trip.
fn rewrite_project_path_prefix(
    vault_root: &Path,
    old_path: &Path,
    new_path: &Path,
) -> AppResult<()> {
    let mut reminders = crate::reminders::load_index(vault_root)?;
    let mut reminders_dirty = false;
    for entry in reminders.iter_mut() {
        if let Ok(suffix) = entry.path.strip_prefix(old_path) {
            entry.path = new_path.join(suffix);
            reminders_dirty = true;
        }
    }
    if reminders_dirty {
        crate::reminders::save_index(vault_root, &reminders)?;
    }

    let mut state = crate::state::load(vault_root)?;
    let mut state_dirty = false;
    for stored in state.action_order.iter_mut() {
        let as_path = Path::new(stored);
        if let Ok(suffix) = as_path.strip_prefix(old_path) {
            *stored = new_path.join(suffix).to_string_lossy().to_string();
            state_dirty = true;
        }
    }
    if state_dirty {
        crate::state::save(vault_root, &state)?;
    }

    Ok(())
}

/// Create a new action note under `project/Actions/` with id + created_at
/// frontmatter. Like `create_note` but sets `status: open` since actions
/// carry GTD state from the moment they exist.
pub fn create_action(project: &Path, body: Option<&str>) -> AppResult<NoteRef> {
    let actions_dir = project.join(ACTIONS_DIR);
    fs::create_dir_all(&actions_dir)?;
    let id = Ulid::new().to_string();
    let path = actions_dir.join(format!("{id}.md"));
    if path.exists() {
        return Err(AppError::Io(std::io::Error::new(
            std::io::ErrorKind::AlreadyExists,
            format!("action already exists: {}", path.display()),
        )));
    }
    let now = Utc::now();
    let note = md::ParsedNote {
        frontmatter: md::Frontmatter {
            id: Some(id),
            created_at: Some(now),
            status: Some(md::Status::Open),
            ..Default::default()
        },
        body: body.unwrap_or("").to_string(),
    };
    write_note(&path, &note)?;

    Ok(NoteRef {
        path,
        title: md::derive_title(&note, "Untitled"),
        preview: md::preview(&note.body, MAX_PREVIEW_CHARS),
        created_at: Some(now),
        tags: Vec::new(),
        remind_at: None,
        deadline: None,
    })
}

/// Mark an action as complete and move it to its project's Archive directory.
///
/// - Adds `completed_at` and (if provided) `complete_note` to frontmatter.
/// - Sets `status: done`.
/// - Moves the file to `<project>/Actions/Archive/<filename>`.
///
/// Returns the final archived path.
pub fn complete_action(
    vault_root: &Path,
    path: &Path,
    note: Option<&str>,
) -> AppResult<PathBuf> {
    assert_inside_vault(vault_root, path)?;

    // Validate this looks like an action: parent is a directory called Actions.
    let parent = path
        .parent()
        .ok_or_else(|| AppError::PathNotFound(path.to_path_buf()))?;
    if parent.file_name().and_then(|s| s.to_str()) != Some(ACTIONS_DIR) {
        return Err(AppError::Io(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            format!("not an action file: {}", path.display()),
        )));
    }

    // Patch frontmatter.
    let mut parsed = read_note(path)?;
    parsed.frontmatter.status = Some(md::Status::Done);
    parsed.frontmatter.completed_at = Some(Utc::now());
    if let Some(text) = note {
        let trimmed = text.trim();
        if !trimmed.is_empty() {
            parsed.frontmatter.complete_note = Some(trimmed.to_string());
        }
    }
    write_note(path, &parsed)?;

    // Move to Archive/.
    let filename = path
        .file_name()
        .ok_or_else(|| AppError::PathNotFound(path.to_path_buf()))?
        .to_owned();
    let archive_path = parent.join(ARCHIVE_DIR).join(&filename);
    move_note(vault_root, path, &archive_path)
}

/// Save a pasted image next to the given note.
///
/// The asset is written to `<note-dir>/assets/<ulid>.<ext>`, where the asset
/// directory is created on first paste. Returns the path *relative to the
/// note's parent directory* so the caller can drop it into a markdown link
/// that stays valid if the note is later moved alongside its assets.
///
/// `ext` must be one of `SUPPORTED_IMAGE_EXTS`, case-insensitive.
pub fn paste_image(vault_root: &Path, note_path: &Path, ext: &str, bytes: &[u8]) -> AppResult<PathBuf> {
    assert_inside_vault(vault_root, note_path)?;
    let ext_lower = ext.trim_start_matches('.').to_ascii_lowercase();
    if !SUPPORTED_IMAGE_EXTS.contains(&ext_lower.as_str()) {
        return Err(AppError::Io(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            format!("unsupported image extension: {ext}"),
        )));
    }

    let note_dir = note_path
        .parent()
        .ok_or_else(|| AppError::PathNotFound(note_path.to_path_buf()))?;
    let assets_dir = note_dir.join(ASSETS_DIR);
    fs::create_dir_all(&assets_dir)?;

    let filename = format!("{}.{}", Ulid::new(), ext_lower);
    let target = assets_dir.join(&filename);
    atomic_write(&target, bytes)?;

    Ok(PathBuf::from(ASSETS_DIR).join(filename))
}

/// Move a note from `src` to `dst`, creating the destination parent if
/// needed. Both paths must live inside `vault_root`. If `dst` already exists,
/// appends ` (n)` to the stem until a free name is found.
pub fn move_note(vault_root: &Path, src: &Path, dst: &Path) -> AppResult<PathBuf> {
    assert_inside_vault(vault_root, src)?;
    assert_inside_vault(vault_root, dst)?;
    if let Some(parent) = dst.parent() {
        fs::create_dir_all(parent)?;
    }
    let final_dst = unique_destination(dst);
    fs::rename(src, &final_dst)?;
    Ok(final_dst)
}

/// List the full vault tree. Scans `Captures/`, `Someday/`, `Projects/*/`,
/// and `.cairn/trash/`. Skips hidden directories (`.`-prefixed) outside of
/// the trash path. Parse failures on individual notes are logged but never
/// propagated — a corrupt note should not break the tree view.
pub fn list_tree(vault_root: &Path) -> AppResult<Tree> {
    let captures = list_flat_notes(&vault_root.join(CAPTURES_DIR))?;
    let someday = list_flat_notes(&vault_root.join(SOMEDAY_DIR))?;
    let projects = list_projects(&vault_root.join(PROJECTS_DIR))?;
    let trash = list_flat_notes_recursive(&vault_root.join(CAIRN_DIR).join(TRASH_DIR))?;
    Ok(Tree {
        captures,
        someday,
        projects,
        trash,
    })
}

/// List a single folder's contents for the project docs browser.
///
/// Excludes `assets/` and any hidden directories so the browser only
/// surfaces user-facing content. Callers are responsible for excluding
/// their own area-specific directories (e.g., the project page hides
/// `Actions/` at the project root because the Actions list is its own
/// section).
pub fn list_folder(vault_root: &Path, path: &Path) -> AppResult<FolderContents> {
    assert_inside_vault(vault_root, path)?;
    if !path.exists() {
        return Ok(FolderContents::default());
    }
    let mut files: Vec<NoteRef> = Vec::new();
    let mut folders: Vec<FolderEntry> = Vec::new();

    for entry in fs::read_dir(path)? {
        let entry = entry?;
        let entry_path = entry.path();
        let name = match entry.file_name().into_string() {
            Ok(n) => n,
            Err(_) => continue,
        };
        if name.starts_with('.') {
            continue;
        }

        if entry_path.is_dir() {
            if name == ASSETS_DIR {
                continue;
            }
            folders.push(FolderEntry {
                name,
                path: entry_path,
            });
            continue;
        }

        if !is_markdown_file(&entry_path) {
            continue;
        }
        if let Some(note_ref) = try_build_note_ref(&entry_path) {
            files.push(note_ref);
        }
    }

    sort_by_created_desc(&mut files);
    folders.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(FolderContents { files, folders })
}

fn list_flat_notes(dir: &Path) -> AppResult<Vec<NoteRef>> {
    if !dir.exists() {
        return Ok(Vec::new());
    }
    let mut out = Vec::new();
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        if !is_markdown_file(&path) {
            continue;
        }
        if let Some(note_ref) = try_build_note_ref(&path) {
            out.push(note_ref);
        }
    }
    sort_by_created_desc(&mut out);
    Ok(out)
}

fn list_flat_notes_recursive(dir: &Path) -> AppResult<Vec<NoteRef>> {
    if !dir.exists() {
        return Ok(Vec::new());
    }
    let mut out = Vec::new();
    for entry in WalkDir::new(dir).into_iter().filter_map(|e| e.ok()) {
        let path = entry.path();
        if !path.is_file() || !is_markdown_file(path) {
            continue;
        }
        if let Some(note_ref) = try_build_note_ref(path) {
            out.push(note_ref);
        }
    }
    sort_by_created_desc(&mut out);
    Ok(out)
}

fn list_projects(projects_dir: &Path) -> AppResult<Vec<Project>> {
    if !projects_dir.exists() {
        return Ok(Vec::new());
    }
    let mut out = Vec::new();
    for entry in fs::read_dir(projects_dir)? {
        let entry = entry?;
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let name = match path.file_name().and_then(|s| s.to_str()) {
            Some(n) if !n.starts_with('.') => n.to_string(),
            _ => continue,
        };
        let actions = list_actions(&path.join(ACTIONS_DIR))?;
        let subdirectories = list_project_subdirectories(&path)?;
        out.push(Project {
            name,
            path,
            actions,
            subdirectories,
        });
    }
    out.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(out)
}

fn list_project_subdirectories(project_dir: &Path) -> AppResult<Vec<String>> {
    let mut out = Vec::new();
    for entry in fs::read_dir(project_dir)? {
        let entry = entry?;
        if !entry.path().is_dir() {
            continue;
        }
        let name = match entry.file_name().into_string() {
            Ok(n) => n,
            Err(_) => continue,
        };
        // Skip app-managed + hidden directories; user-facing folders only.
        if name == ACTIONS_DIR || name == ASSETS_DIR || name.starts_with('.') {
            continue;
        }
        out.push(name);
    }
    out.sort_by(|a, b| a.to_lowercase().cmp(&b.to_lowercase()));
    Ok(out)
}

fn list_actions(actions_dir: &Path) -> AppResult<Vec<NoteRef>> {
    if !actions_dir.exists() {
        return Ok(Vec::new());
    }
    let mut out = Vec::new();
    for entry in fs::read_dir(actions_dir)? {
        let entry = entry?;
        let path = entry.path();
        // Skip the Archive/ subdir — completed actions are out of the default list.
        if path.is_dir() {
            if path.file_name().and_then(|s| s.to_str()) == Some(ARCHIVE_DIR) {
                continue;
            }
            continue;
        }
        if !is_markdown_file(&path) {
            continue;
        }
        if let Some(note_ref) = try_build_note_ref(&path) {
            out.push(note_ref);
        }
    }
    sort_by_created_desc(&mut out);
    Ok(out)
}

fn try_build_note_ref(path: &Path) -> Option<NoteRef> {
    let raw = fs::read_to_string(path).ok()?;
    let parsed = md::parse(&raw).ok()?;
    let stem = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("Untitled")
        .to_string();
    Some(NoteRef {
        path: path.to_path_buf(),
        title: md::derive_title(&parsed, &stem),
        preview: md::preview(&parsed.body, MAX_PREVIEW_CHARS),
        created_at: parsed
            .frontmatter
            .created_at
            .or_else(|| modified_time(path)),
        tags: parsed.frontmatter.tags.clone(),
        remind_at: parsed.frontmatter.remind_at,
        deadline: parsed.frontmatter.deadline,
    })
}

fn modified_time(path: &Path) -> Option<DateTime<Utc>> {
    let meta = fs::metadata(path).ok()?;
    let modified = meta.modified().ok()?;
    Some(modified.into())
}

fn sort_by_created_desc(notes: &mut [NoteRef]) {
    notes.sort_by(|a, b| b.created_at.cmp(&a.created_at));
}

fn is_markdown_file(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|ext| ext.eq_ignore_ascii_case("md"))
        .unwrap_or(false)
}

fn assert_inside_vault(vault_root: &Path, path: &Path) -> AppResult<()> {
    let canon_root = match fs::canonicalize(vault_root) {
        Ok(p) => p,
        Err(_) => return Err(AppError::PathNotFound(vault_root.to_path_buf())),
    };
    // Path may not yet exist (for dst); walk upward until we find an existing ancestor.
    let mut check = path.to_path_buf();
    let canon_check = loop {
        if let Ok(c) = fs::canonicalize(&check) {
            break c;
        }
        if !check.pop() {
            return Err(AppError::PathNotFound(path.to_path_buf()));
        }
    };
    if !canon_check.starts_with(&canon_root) {
        return Err(AppError::NotWritable(path.to_path_buf()));
    }
    Ok(())
}

fn unique_destination(dst: &Path) -> PathBuf {
    if !dst.exists() {
        return dst.to_path_buf();
    }
    let parent = dst.parent().unwrap_or_else(|| Path::new("."));
    let stem = dst
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("file")
        .to_string();
    let ext = dst
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| format!(".{e}"))
        .unwrap_or_default();
    for i in 1..1000 {
        let candidate = parent.join(format!("{stem} ({i}){ext}"));
        if !candidate.exists() {
            return candidate;
        }
    }
    // Fallback — extremely unlikely.
    parent.join(format!(
        "{stem} ({}){ext}",
        Utc::now().timestamp_nanos_opt().unwrap_or_default()
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::vault;
    use tempfile::TempDir;

    fn setup_vault() -> (TempDir, PathBuf) {
        let dir = TempDir::new().unwrap();
        let vault_path = dir.path().to_path_buf();
        vault::open(&vault_path).unwrap();
        (dir, vault_path)
    }

    #[test]
    fn atomic_write_creates_parent_dirs() {
        let dir = TempDir::new().unwrap();
        let nested = dir.path().join("a/b/c/x.txt");
        atomic_write(&nested, b"hello").unwrap();
        assert_eq!(fs::read_to_string(&nested).unwrap(), "hello");
    }

    #[test]
    fn atomic_write_leaves_no_tmp() {
        let dir = TempDir::new().unwrap();
        let target = dir.path().join("x.txt");
        atomic_write(&target, b"ok").unwrap();
        assert!(!target.with_extension("tmp").exists());
    }

    #[test]
    fn create_note_writes_frontmatter_with_id_and_created_at() {
        let (_vault, root) = setup_vault();
        let note_ref = create_note(&root.join(CAPTURES_DIR), Some("hello")).unwrap();

        let raw = fs::read_to_string(&note_ref.path).unwrap();
        assert!(raw.contains("id:"));
        assert!(raw.contains("created_at:"));
        assert!(raw.ends_with("hello"));
        assert!(note_ref.created_at.is_some());
    }

    #[test]
    fn list_tree_reports_captures_newest_first() {
        let (_vault, root) = setup_vault();
        let first = create_note(&root.join(CAPTURES_DIR), Some("# First")).unwrap();
        std::thread::sleep(std::time::Duration::from_millis(5));
        let second = create_note(&root.join(CAPTURES_DIR), Some("# Second")).unwrap();

        let tree = list_tree(&root).unwrap();
        assert_eq!(tree.captures.len(), 2);
        assert_eq!(tree.captures[0].title, "Second");
        assert_eq!(tree.captures[1].title, "First");
        assert_eq!(tree.captures[0].path, second.path);
        assert_eq!(tree.captures[1].path, first.path);
    }

    #[test]
    fn list_tree_excludes_cairn_dir() {
        let (_vault, root) = setup_vault();
        create_note(&root.join(CAPTURES_DIR), Some("real note")).unwrap();
        // A stray .md inside .cairn/ should NOT show up in captures.
        fs::write(root.join(CAIRN_DIR).join("stray.md"), "---\ntitle: stray\n---\n").unwrap();

        let tree = list_tree(&root).unwrap();
        assert_eq!(tree.captures.len(), 1);
        assert!(tree
            .captures
            .iter()
            .all(|n| !n.path.to_string_lossy().contains(CAIRN_DIR)));
    }

    #[test]
    fn list_tree_projects_include_actions_sorted() {
        let (_vault, root) = setup_vault();
        let projects_root = root.join(PROJECTS_DIR);
        fs::create_dir_all(projects_root.join("Alpha").join(ACTIONS_DIR)).unwrap();
        fs::create_dir_all(projects_root.join("Beta").join(ACTIONS_DIR)).unwrap();
        create_note(&projects_root.join("Alpha").join(ACTIONS_DIR), Some("a1")).unwrap();
        create_note(&projects_root.join("Alpha").join(ACTIONS_DIR), Some("a2")).unwrap();
        create_note(&projects_root.join("Beta").join(ACTIONS_DIR), Some("b1")).unwrap();

        let tree = list_tree(&root).unwrap();
        assert_eq!(tree.projects.len(), 2);
        assert_eq!(tree.projects[0].name, "Alpha");
        assert_eq!(tree.projects[1].name, "Beta");
        assert_eq!(tree.projects[0].actions.len(), 2);
        assert_eq!(tree.projects[1].actions.len(), 1);
    }

    #[test]
    fn list_folder_returns_files_and_folders_excluding_assets_and_hidden() {
        let (_vault, root) = setup_vault();
        let project = create_project(&root, "P").unwrap();
        // Top-level docs
        fs::write(project.join("overview.md"), "---\n---\n\nhi").unwrap();
        fs::write(project.join("notes.md"), "---\n---\n\nnotes").unwrap();
        // Subfolders
        fs::create_dir_all(project.join("Research")).unwrap();
        fs::create_dir_all(project.join(ASSETS_DIR)).unwrap(); // excluded
        fs::create_dir_all(project.join(".hidden")).unwrap(); // excluded
        // Non-markdown file — should be skipped
        fs::write(project.join("readme.txt"), "skip").unwrap();

        let contents = list_folder(&root, &project).unwrap();
        assert_eq!(contents.files.len(), 2);
        assert!(contents
            .files
            .iter()
            .any(|f| f.path.file_name().and_then(|s| s.to_str()) == Some("overview.md")));
        // Backend returns all non-hidden, non-assets folders. Callers decide
        // whether to filter context-specific dirs (the project docs browser
        // hides `Actions/` at the project root since it has its own section).
        let folder_names: Vec<_> = contents.folders.iter().map(|f| f.name.as_str()).collect();
        assert_eq!(folder_names, vec!["Actions", "Research"]);
    }

    #[test]
    fn list_folder_on_subfolder_returns_nested_contents() {
        let (_vault, root) = setup_vault();
        let project = create_project(&root, "P").unwrap();
        let research = project.join("Research");
        fs::create_dir_all(&research).unwrap();
        fs::write(research.join("one.md"), "").unwrap();
        fs::create_dir_all(research.join("2026")).unwrap();

        let contents = list_folder(&root, &research).unwrap();
        assert_eq!(contents.files.len(), 1);
        assert_eq!(contents.folders.len(), 1);
        assert_eq!(contents.folders[0].name, "2026");
    }

    #[test]
    fn list_folder_rejects_path_outside_vault() {
        let (_vault, root) = setup_vault();
        let escape = TempDir::new().unwrap();
        let err = list_folder(&root, escape.path()).unwrap_err();
        assert!(matches!(err, AppError::NotWritable(_)));
    }

    #[test]
    fn list_tree_project_subdirectories_excludes_actions_assets_hidden() {
        let (_vault, root) = setup_vault();
        let project = create_project(&root, "P").unwrap();
        fs::create_dir_all(project.join("Research")).unwrap();
        fs::create_dir_all(project.join("Archive 2024")).unwrap();
        fs::create_dir_all(project.join(ASSETS_DIR)).unwrap(); // should be excluded
        fs::create_dir_all(project.join(".hidden")).unwrap(); // should be excluded

        let tree = list_tree(&root).unwrap();
        let p = tree.projects.iter().find(|p| p.name == "P").unwrap();
        assert_eq!(p.subdirectories, vec!["Archive 2024", "Research"]);
    }

    #[test]
    fn list_tree_ignores_actions_archive() {
        let (_vault, root) = setup_vault();
        let project = root.join(PROJECTS_DIR).join("X");
        fs::create_dir_all(project.join(ACTIONS_DIR).join(ARCHIVE_DIR)).unwrap();
        create_note(&project.join(ACTIONS_DIR), Some("open one")).unwrap();
        create_note(&project.join(ACTIONS_DIR).join(ARCHIVE_DIR), Some("done one")).unwrap();

        let tree = list_tree(&root).unwrap();
        assert_eq!(tree.projects[0].actions.len(), 1);
    }

    #[test]
    fn move_note_within_vault_succeeds() {
        let (_vault, root) = setup_vault();
        let note = create_note(&root.join(CAPTURES_DIR), Some("body")).unwrap();
        let filename = note.path.file_name().unwrap().to_owned();
        let dst = root.join(SOMEDAY_DIR).join(&filename);

        let final_dst = move_note(&root, &note.path, &dst).unwrap();
        assert!(!note.path.exists());
        assert!(final_dst.exists());
        assert_eq!(final_dst, dst);
    }

    #[test]
    fn move_note_collides_renames_destination() {
        let (_vault, root) = setup_vault();
        let captures = root.join(CAPTURES_DIR);
        let someday = root.join(SOMEDAY_DIR);
        let existing = someday.join("note.md");
        fs::write(&existing, "first").unwrap();
        let src = captures.join("note.md");
        fs::write(&src, "second").unwrap();

        let final_dst = move_note(&root, &src, &existing).unwrap();
        assert_ne!(final_dst, existing);
        assert!(existing.exists());
        assert!(final_dst.exists());
    }

    #[test]
    fn move_note_rejects_destination_outside_vault() {
        let (_vault, root) = setup_vault();
        let note = create_note(&root.join(CAPTURES_DIR), Some("body")).unwrap();
        let escape = TempDir::new().unwrap();
        let result = move_note(&root, &note.path, &escape.path().join("stolen.md"));
        assert!(matches!(result, Err(AppError::NotWritable(_))));
    }

    #[test]
    fn create_project_makes_actions_subdir() {
        let (_vault, root) = setup_vault();
        let p = create_project(&root, "Writing").unwrap();
        assert!(p.is_dir());
        assert!(p.join(ACTIONS_DIR).is_dir());
    }

    #[test]
    fn create_project_rejects_duplicate() {
        let (_vault, root) = setup_vault();
        create_project(&root, "Thing").unwrap();
        let err = create_project(&root, "Thing").unwrap_err();
        assert!(matches!(err, AppError::Io(_)));
    }

    #[test]
    fn create_project_sanitizes_separator_chars() {
        let (_vault, root) = setup_vault();
        let p = create_project(&root, "Wri/ting").unwrap();
        assert_eq!(p.file_name().and_then(|s| s.to_str()), Some("Writing"));
    }

    #[test]
    fn create_project_trims_whitespace() {
        let (_vault, root) = setup_vault();
        let p = create_project(&root, "  Spaced  ").unwrap();
        assert_eq!(p.file_name().and_then(|s| s.to_str()), Some("Spaced"));
    }

    #[test]
    fn create_project_rejects_empty_name() {
        let (_vault, root) = setup_vault();
        let err = create_project(&root, "   ").unwrap_err();
        assert!(matches!(err, AppError::Io(_)));
    }

    #[test]
    fn create_action_sets_open_status() {
        let (_vault, root) = setup_vault();
        let project = create_project(&root, "P").unwrap();
        let action = create_action(&project, Some("first step")).unwrap();

        let reread = read_note(&action.path).unwrap();
        assert_eq!(reread.frontmatter.status, Some(md::Status::Open));
        assert!(reread.frontmatter.id.is_some());
        assert_eq!(reread.body, "first step");
    }

    #[test]
    fn complete_action_moves_to_archive_and_sets_frontmatter() {
        let (_vault, root) = setup_vault();
        let project = create_project(&root, "P").unwrap();
        let action = create_action(&project, Some("todo item")).unwrap();

        let archived = complete_action(&root, &action.path, Some("felt good to ship")).unwrap();

        assert!(!action.path.exists());
        assert!(archived.exists());
        assert!(archived.to_string_lossy().contains(ARCHIVE_DIR));

        let reread = read_note(&archived).unwrap();
        assert_eq!(reread.frontmatter.status, Some(md::Status::Done));
        assert!(reread.frontmatter.completed_at.is_some());
        assert_eq!(
            reread.frontmatter.complete_note.as_deref(),
            Some("felt good to ship"),
        );
    }

    #[test]
    fn complete_action_without_note_omits_field() {
        let (_vault, root) = setup_vault();
        let project = create_project(&root, "P").unwrap();
        let action = create_action(&project, None).unwrap();

        let archived = complete_action(&root, &action.path, None).unwrap();
        let reread = read_note(&archived).unwrap();
        assert!(reread.frontmatter.complete_note.is_none());
    }

    #[test]
    fn complete_action_rejects_non_action_file() {
        let (_vault, root) = setup_vault();
        let capture = create_note(&root.join(CAPTURES_DIR), Some("x")).unwrap();
        let err = complete_action(&root, &capture.path, None).unwrap_err();
        assert!(matches!(err, AppError::Io(_)));
    }

    #[test]
    fn list_tree_archive_omitted_from_project_actions() {
        // Regression guard: Archive/ must not appear in the default Actions list.
        let (_vault, root) = setup_vault();
        let project = create_project(&root, "P").unwrap();
        let a1 = create_action(&project, Some("open")).unwrap();
        complete_action(&root, &a1.path, None).unwrap();

        let tree = list_tree(&root).unwrap();
        let p = tree.projects.iter().find(|p| p.name == "P").unwrap();
        assert_eq!(p.actions.len(), 0);
    }

    #[test]
    fn paste_image_writes_to_assets_dir_and_returns_relative_path() {
        let (_vault, root) = setup_vault();
        let note_path = root.join(CAPTURES_DIR).join("note.md");
        fs::write(&note_path, "---\n---\n\nbody").unwrap();

        let rel = paste_image(&root, &note_path, "png", b"fake-png-bytes").unwrap();
        assert_eq!(rel.parent().and_then(|p| p.to_str()), Some(ASSETS_DIR));
        assert!(rel.extension().and_then(|e| e.to_str()) == Some("png"));

        let absolute = note_path.parent().unwrap().join(&rel);
        assert_eq!(fs::read(&absolute).unwrap(), b"fake-png-bytes");
    }

    #[test]
    fn paste_image_strips_leading_dot_on_extension() {
        let (_vault, root) = setup_vault();
        let note_path = root.join(CAPTURES_DIR).join("note.md");
        fs::write(&note_path, "---\n---\n\n").unwrap();

        let rel = paste_image(&root, &note_path, ".PNG", b"x").unwrap();
        assert_eq!(rel.extension().and_then(|e| e.to_str()), Some("png"));
    }

    #[test]
    fn paste_image_rejects_unknown_extension() {
        let (_vault, root) = setup_vault();
        let note_path = root.join(CAPTURES_DIR).join("note.md");
        fs::write(&note_path, "---\n---\n\n").unwrap();

        let err = paste_image(&root, &note_path, "exe", b"x").unwrap_err();
        assert!(matches!(err, AppError::Io(_)));
    }

    #[test]
    fn paste_image_rejects_note_outside_vault() {
        let (_vault, root) = setup_vault();
        let escape = TempDir::new().unwrap();
        let note_path = escape.path().join("note.md");
        fs::write(&note_path, "x").unwrap();
        let err = paste_image(&root, &note_path, "png", b"x").unwrap_err();
        assert!(matches!(err, AppError::NotWritable(_)));
    }

    #[test]
    fn read_and_write_note_round_trip_preserves_unknown_keys() {
        let (_vault, root) = setup_vault();
        let path = root.join(CAPTURES_DIR).join("note.md");
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(
            &path,
            "---\ntitle: T\nweird: preserved\n---\n\nbody here",
        )
        .unwrap();

        let note = read_note(&path).unwrap();
        assert_eq!(note.frontmatter.title.as_deref(), Some("T"));
        write_note(&path, &note).unwrap();

        let reread = read_note(&path).unwrap();
        assert_eq!(reread.frontmatter.title.as_deref(), Some("T"));
        assert!(reread.frontmatter.extra.contains_key("weird"));
    }

    // ─── rename_project ──────────────────────────────────────────────────

    #[test]
    fn rename_project_moves_directory_and_preserves_note_contents() {
        let (_vault, root) = setup_vault();
        let project = create_project(&root, "Alpha").unwrap();
        let action = create_action(&project, Some("first step")).unwrap();
        let original = fs::read_to_string(&action.path).unwrap();

        let new_path = rename_project(&root, &project, "Beta").unwrap();

        assert!(!project.exists());
        assert!(new_path.is_dir());
        assert_eq!(new_path.file_name().and_then(|s| s.to_str()), Some("Beta"));
        // The action moved with the folder — same filename, new parent.
        let moved_action = new_path
            .join(ACTIONS_DIR)
            .join(action.path.file_name().unwrap());
        assert!(moved_action.exists());
        // Contents are byte-identical.
        assert_eq!(fs::read_to_string(&moved_action).unwrap(), original);
    }

    #[test]
    fn rename_project_rejects_collision_with_existing_project() {
        let (_vault, root) = setup_vault();
        let a = create_project(&root, "A").unwrap();
        create_project(&root, "B").unwrap();

        let err = rename_project(&root, &a, "B").unwrap_err();
        assert!(matches!(err, AppError::VaultAlreadyExists(_)));
        // Old path still present — we don't leave a half-moved project.
        assert!(a.exists());
    }

    #[test]
    fn rename_project_rejects_missing_source() {
        let (_vault, root) = setup_vault();
        let ghost = root.join(PROJECTS_DIR).join("Ghost");
        let err = rename_project(&root, &ghost, "Anything").unwrap_err();
        assert!(matches!(err, AppError::PathNotFound(_)));
    }

    #[test]
    fn rename_project_rejects_empty_name() {
        let (_vault, root) = setup_vault();
        let p = create_project(&root, "Alpha").unwrap();
        let err = rename_project(&root, &p, "   ").unwrap_err();
        assert!(matches!(err, AppError::Io(_)));
    }

    #[test]
    fn rename_project_sanitizes_name_containing_path_separators() {
        let (_vault, root) = setup_vault();
        let p = create_project(&root, "Alpha").unwrap();
        let new_path = rename_project(&root, &p, "Al/pha/2").unwrap();
        // Separator chars are stripped, so the folder is a single-level name.
        assert_eq!(
            new_path.file_name().and_then(|s| s.to_str()),
            Some("Alpha2"),
        );
        assert_eq!(new_path.parent(), Some(root.join(PROJECTS_DIR).as_path()));
    }

    #[test]
    fn rename_project_rewrites_reminder_index_paths() {
        let (_vault, root) = setup_vault();
        let project = create_project(&root, "Alpha").unwrap();
        let action_path = project.join(ACTIONS_DIR).join("a.md");
        fs::write(
            &action_path,
            "---\ntitle: A\nremind_at: 2026-06-01T09:00:00Z\n---\n",
        )
        .unwrap();
        // Seed the reminders index directly so the test doesn't depend on
        // the scheduler.
        crate::reminders::save_index(
            &root,
            &[crate::reminders::Entry {
                path: action_path.clone(),
                title: "A".into(),
                remind_at: chrono::TimeZone::with_ymd_and_hms(
                    &Utc,
                    2026, 6, 1, 9, 0, 0,
                )
                .unwrap(),
            }],
        )
        .unwrap();

        let new_project = rename_project(&root, &project, "Beta").unwrap();

        let reloaded = crate::reminders::load_index(&root).unwrap();
        assert_eq!(reloaded.len(), 1);
        assert_eq!(
            reloaded[0].path,
            new_project.join(ACTIONS_DIR).join("a.md"),
        );
    }

    #[test]
    fn rename_project_rewrites_action_order_paths() {
        let (_vault, root) = setup_vault();
        let project = create_project(&root, "Alpha").unwrap();
        let action_path = project.join(ACTIONS_DIR).join("a.md");
        fs::write(&action_path, "").unwrap();

        let unrelated = root.join(CAPTURES_DIR).join("c.md");
        let original_order = vec![
            action_path.to_string_lossy().to_string(),
            unrelated.to_string_lossy().to_string(),
        ];
        crate::state::set_action_order(&root, original_order).unwrap();

        let new_project = rename_project(&root, &project, "Beta").unwrap();

        let reloaded = crate::state::load(&root).unwrap();
        assert_eq!(reloaded.action_order.len(), 2);
        // First path was rewritten; unrelated path is untouched.
        assert_eq!(
            reloaded.action_order[0],
            new_project
                .join(ACTIONS_DIR)
                .join("a.md")
                .to_string_lossy()
                .to_string(),
        );
        assert_eq!(
            reloaded.action_order[1],
            unrelated.to_string_lossy().to_string(),
        );
    }

    #[test]
    fn rename_project_preserves_unknown_frontmatter_keys() {
        // Regression guard for the CLAUDE.md invariant: renaming a project
        // must not touch the frontmatter of notes inside it.
        let (_vault, root) = setup_vault();
        let project = create_project(&root, "Alpha").unwrap();
        let note = project.join(ACTIONS_DIR).join("a.md");
        let raw = "---\nid: abc\ntitle: A\nweird_key: preserved\n---\n\nbody\n";
        fs::write(&note, raw).unwrap();

        let new_project = rename_project(&root, &project, "Beta").unwrap();
        let moved = new_project.join(ACTIONS_DIR).join("a.md");
        assert_eq!(fs::read_to_string(&moved).unwrap(), raw);
    }

    // ─── soft_delete_project ─────────────────────────────────────────────

    #[test]
    fn soft_delete_project_moves_entire_folder_to_trash_as_one_entry() {
        let (_vault, root) = setup_vault();
        let project = create_project(&root, "Alpha").unwrap();
        create_action(&project, Some("a1")).unwrap();
        create_action(&project, Some("a2")).unwrap();
        fs::write(project.join("doc.md"), "---\n---\n\ndoc").unwrap();

        soft_delete_project(&root, &project).unwrap();

        assert!(!project.exists());
        let entries = crate::trash::list(&root).unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].kind, crate::trash::EntryKind::Project);
        assert_eq!(entries[0].title, "Alpha");
    }

    #[test]
    fn soft_delete_project_purges_reminder_entries_for_project() {
        let (_vault, root) = setup_vault();
        let project = create_project(&root, "Alpha").unwrap();
        let proj_action = project.join(ACTIONS_DIR).join("a.md");
        fs::write(
            &proj_action,
            "---\nremind_at: 2026-06-01T09:00:00Z\n---\n",
        )
        .unwrap();
        let unrelated = root.join(SOMEDAY_DIR).join("u.md");
        fs::write(
            &unrelated,
            "---\nremind_at: 2026-07-01T09:00:00Z\n---\n",
        )
        .unwrap();

        crate::reminders::save_index(
            &root,
            &[
                crate::reminders::Entry {
                    path: proj_action.clone(),
                    title: "A".into(),
                    remind_at: chrono::TimeZone::with_ymd_and_hms(
                        &Utc,
                        2026, 6, 1, 9, 0, 0,
                    )
                    .unwrap(),
                },
                crate::reminders::Entry {
                    path: unrelated.clone(),
                    title: "U".into(),
                    remind_at: chrono::TimeZone::with_ymd_and_hms(
                        &Utc,
                        2026, 7, 1, 9, 0, 0,
                    )
                    .unwrap(),
                },
            ],
        )
        .unwrap();

        soft_delete_project(&root, &project).unwrap();

        let reloaded = crate::reminders::load_index(&root).unwrap();
        assert_eq!(reloaded.len(), 1);
        assert_eq!(reloaded[0].path, unrelated);
    }

    #[test]
    fn soft_delete_project_purges_action_order_for_project() {
        let (_vault, root) = setup_vault();
        let project = create_project(&root, "Alpha").unwrap();
        let action = project.join(ACTIONS_DIR).join("a.md");
        fs::write(&action, "").unwrap();
        let unrelated = root.join(CAPTURES_DIR).join("c.md");

        crate::state::set_action_order(
            &root,
            vec![
                action.to_string_lossy().to_string(),
                unrelated.to_string_lossy().to_string(),
            ],
        )
        .unwrap();

        soft_delete_project(&root, &project).unwrap();

        let reloaded = crate::state::load(&root).unwrap();
        assert_eq!(reloaded.action_order.len(), 1);
        assert_eq!(
            reloaded.action_order[0],
            unrelated.to_string_lossy().to_string(),
        );
    }

    #[test]
    fn soft_delete_project_rejects_missing_path() {
        let (_vault, root) = setup_vault();
        let ghost = root.join(PROJECTS_DIR).join("Ghost");
        let err = soft_delete_project(&root, &ghost).unwrap_err();
        assert!(matches!(err, AppError::PathNotFound(_)));
    }
}
