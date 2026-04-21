//! Soft delete for vault notes. Files moved to trash are **not** removed
//! from disk — they're relocated to `.cairn/trash/`, mirroring their
//! vault-relative path so `.cairn/trash/Captures/note.md` obviously came
//! from `Captures/note.md`. An index at `.cairn/trash-index.json` records
//! `{ originalPath, trashedPath, title, deletedAt }` for each entry so
//! the Trash UI doesn't need to re-parse the whole trash tree on every
//! view.
//!
//! Restore moves the file back to its original relative path, collision-
//! renaming if a file with that name already exists. Empty Trash deletes
//! everything inside `.cairn/trash/` plus the index entries.

use crate::error::{AppError, AppResult};
use crate::md;
use crate::vault::CAIRN_DIR;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

const TRASH_DIR_NAME: &str = "trash";
const INDEX_FILE: &str = "trash-index.json";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Entry {
    /// Vault-relative path the note was trashed from.
    #[serde(rename = "originalPath")]
    pub original_path: PathBuf,
    /// Absolute path of the file in `.cairn/trash/`.
    #[serde(rename = "trashedPath")]
    pub trashed_path: PathBuf,
    pub title: String,
    #[serde(rename = "deletedAt")]
    pub deleted_at: DateTime<Utc>,
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct IndexFile {
    #[serde(default)]
    entries: Vec<Entry>,
}

// ─── Public API ──────────────────────────────────────────────────────────

/// Soft-delete a note: move it into `.cairn/trash/` (creating the mirrored
/// directory tree) and append to the index. Returns the final trashed path.
pub fn move_to_trash(vault_root: &Path, path: &Path) -> AppResult<PathBuf> {
    if !path.exists() {
        return Err(AppError::PathNotFound(path.to_path_buf()));
    }
    let relative = relative_to_vault(vault_root, path)?;
    let trash_dir = vault_root.join(CAIRN_DIR).join(TRASH_DIR_NAME);
    let trashed_path = trash_dir.join(&relative);

    if let Some(parent) = trashed_path.parent() {
        fs::create_dir_all(parent)?;
    }
    // If something is already there, pick a unique name — two deletes of
    // the same path shouldn't overwrite each other.
    let final_trashed = unique_destination(&trashed_path);
    fs::rename(path, &final_trashed)?;

    let title = read_title(&final_trashed).unwrap_or_else(|| {
        path.file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("Untitled")
            .to_string()
    });

    let mut index = load_index(vault_root)?;
    index.push(Entry {
        original_path: relative,
        trashed_path: final_trashed.clone(),
        title,
        deleted_at: Utc::now(),
    });
    save_index(vault_root, &index)?;

    Ok(final_trashed)
}

/// Restore a previously-trashed entry to its original vault-relative path.
/// If a file already occupies that path, the restored copy is renamed with
/// a ` (n)` suffix. Returns the final restored path.
pub fn restore(vault_root: &Path, trashed_path: &Path) -> AppResult<PathBuf> {
    let mut index = load_index(vault_root)?;
    let position = index
        .iter()
        .position(|e| e.trashed_path == trashed_path)
        .ok_or_else(|| AppError::PathNotFound(trashed_path.to_path_buf()))?;
    let entry = index.remove(position);

    let target = vault_root.join(&entry.original_path);
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent)?;
    }
    let final_target = unique_destination(&target);
    fs::rename(&entry.trashed_path, &final_target)?;
    save_index(vault_root, &index)?;

    Ok(final_target)
}

/// Permanently delete everything in the trash directory and clear the index.
pub fn empty(vault_root: &Path) -> AppResult<u32> {
    let index = load_index(vault_root)?;
    let count = index.len() as u32;
    let trash_dir = vault_root.join(CAIRN_DIR).join(TRASH_DIR_NAME);
    if trash_dir.exists() {
        // Remove everything inside `.cairn/trash/` but keep the dir itself.
        for entry in fs::read_dir(&trash_dir)? {
            let entry = entry?;
            let path = entry.path();
            if path.is_dir() {
                fs::remove_dir_all(&path)?;
            } else {
                fs::remove_file(&path)?;
            }
        }
    }
    save_index(vault_root, &[])?;
    Ok(count)
}

/// List trash entries, newest-first by deletion time.
pub fn list(vault_root: &Path) -> AppResult<Vec<Entry>> {
    let mut entries = load_index(vault_root)?;
    entries.sort_by(|a, b| b.deleted_at.cmp(&a.deleted_at));
    Ok(entries)
}

// ─── internals ───────────────────────────────────────────────────────────

fn relative_to_vault(vault_root: &Path, path: &Path) -> AppResult<PathBuf> {
    // `strip_prefix` needs exact path equality; canonicalize both.
    let canon_root = fs::canonicalize(vault_root)
        .map_err(|_| AppError::PathNotFound(vault_root.to_path_buf()))?;
    let canon_path = fs::canonicalize(path)
        .map_err(|_| AppError::PathNotFound(path.to_path_buf()))?;
    let rel = canon_path
        .strip_prefix(&canon_root)
        .map_err(|_| AppError::NotWritable(path.to_path_buf()))?;
    Ok(rel.to_path_buf())
}

fn read_title(path: &Path) -> Option<String> {
    let raw = fs::read_to_string(path).ok()?;
    let parsed = md::parse(&raw).ok()?;
    let stem = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("Untitled")
        .to_string();
    Some(md::derive_title(&parsed, &stem))
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
    parent.join(format!(
        "{stem} ({}){ext}",
        Utc::now().timestamp_nanos_opt().unwrap_or_default()
    ))
}

fn index_path(vault_root: &Path) -> PathBuf {
    vault_root.join(CAIRN_DIR).join(INDEX_FILE)
}

fn load_index(vault_root: &Path) -> AppResult<Vec<Entry>> {
    let path = index_path(vault_root);
    if !path.exists() {
        return Ok(Vec::new());
    }
    let bytes = fs::read(&path)?;
    let file: IndexFile = serde_json::from_slice(&bytes).unwrap_or_default();
    Ok(file.entries)
}

fn save_index(vault_root: &Path, entries: &[Entry]) -> AppResult<()> {
    let cairn = vault_root.join(CAIRN_DIR);
    fs::create_dir_all(&cairn)?;
    let path = index_path(vault_root);
    let file = IndexFile {
        entries: entries.to_vec(),
    };
    let bytes = serde_json::to_vec_pretty(&file)?;
    atomic_write(&path, &bytes)
}

fn atomic_write(path: &Path, bytes: &[u8]) -> AppResult<()> {
    let tmp = path.with_extension("tmp");
    fs::write(&tmp, bytes)?;
    fs::rename(&tmp, path)?;
    Ok(())
}

/// Sanity check exposed to the UI: count trash entries currently on disk.
/// Uses the filesystem, not the index, to stay honest about external cleanups.
pub fn count_on_disk(vault_root: &Path) -> u32 {
    let trash_dir = vault_root.join(CAIRN_DIR).join(TRASH_DIR_NAME);
    WalkDir::new(&trash_dir)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.path().is_file())
        .filter(|e| e.path().extension().and_then(|x| x.to_str()) == Some("md"))
        .count() as u32
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::vault;
    use tempfile::TempDir;

    fn setup_vault() -> (TempDir, PathBuf) {
        let dir = TempDir::new().unwrap();
        let root = dir.path().to_path_buf();
        vault::open(&root).unwrap();
        (dir, root)
    }

    fn write_note(path: &Path, body: &str) {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).unwrap();
        }
        fs::write(path, body).unwrap();
    }

    #[test]
    fn move_to_trash_mirrors_vault_relative_path() {
        let (_tmp, root) = setup_vault();
        let note = root.join("Captures").join("foo.md");
        write_note(&note, "---\ntitle: Foo\n---\n\nbody\n");

        let trashed = move_to_trash(&root, &note).unwrap();

        assert!(!note.exists());
        assert!(trashed.exists());
        // Mirrored structure.
        let expected_dir = root.join(CAIRN_DIR).join(TRASH_DIR_NAME).join("Captures");
        assert!(trashed.starts_with(&expected_dir));
    }

    #[test]
    fn move_to_trash_appends_entry_to_index_with_title() {
        let (_tmp, root) = setup_vault();
        let note = root.join("Someday").join("park.md");
        write_note(&note, "---\ntitle: Park idea\n---\n\n");

        move_to_trash(&root, &note).unwrap();

        let entries = list(&root).unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].title, "Park idea");
        assert_eq!(entries[0].original_path, PathBuf::from("Someday").join("park.md"));
    }

    #[test]
    fn move_to_trash_collision_renames_inside_trash() {
        let (_tmp, root) = setup_vault();
        let note1 = root.join("Captures").join("dup.md");
        write_note(&note1, "first");
        move_to_trash(&root, &note1).unwrap();

        let note2 = root.join("Captures").join("dup.md");
        write_note(&note2, "second");
        let second_trashed = move_to_trash(&root, &note2).unwrap();

        // The second file shouldn't overwrite the first.
        assert!(second_trashed
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap()
            .contains("dup (1)"));
        let entries = list(&root).unwrap();
        assert_eq!(entries.len(), 2);
    }

    #[test]
    fn restore_puts_file_back_and_removes_index_entry() {
        let (_tmp, root) = setup_vault();
        let note = root.join("Captures").join("back.md");
        write_note(&note, "---\n---\n\nbody\n");
        let trashed = move_to_trash(&root, &note).unwrap();

        let restored = restore(&root, &trashed).unwrap();

        assert!(!trashed.exists());
        assert!(restored.exists());
        // Back to its original relative path.
        assert_eq!(restored, root.join("Captures").join("back.md"));
        let entries = list(&root).unwrap();
        assert!(entries.is_empty());
    }

    #[test]
    fn restore_collision_renames_the_restored_file() {
        let (_tmp, root) = setup_vault();
        let note = root.join("Captures").join("c.md");
        write_note(&note, "original");
        let trashed = move_to_trash(&root, &note).unwrap();

        // Create a new file at the same path before restoring.
        write_note(&note, "new version");

        let restored = restore(&root, &trashed).unwrap();
        assert_ne!(restored, note);
        assert!(restored
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap()
            .contains("c (1)"));
        // Both live now.
        assert!(note.exists());
        assert!(restored.exists());
    }

    #[test]
    fn empty_deletes_all_files_and_clears_index() {
        let (_tmp, root) = setup_vault();
        let a = root.join("Captures").join("a.md");
        let b = root.join("Captures").join("b.md");
        write_note(&a, "a");
        write_note(&b, "b");
        move_to_trash(&root, &a).unwrap();
        move_to_trash(&root, &b).unwrap();

        let removed = empty(&root).unwrap();
        assert_eq!(removed, 2);

        assert_eq!(count_on_disk(&root), 0);
        assert!(list(&root).unwrap().is_empty());
    }

    #[test]
    fn list_orders_newest_first() {
        let (_tmp, root) = setup_vault();
        let a = root.join("Captures").join("a.md");
        let b = root.join("Captures").join("b.md");
        write_note(&a, "a");
        write_note(&b, "b");
        move_to_trash(&root, &a).unwrap();
        std::thread::sleep(std::time::Duration::from_millis(5));
        move_to_trash(&root, &b).unwrap();

        let entries = list(&root).unwrap();
        assert_eq!(entries[0].original_path.file_name().unwrap(), "b.md");
        assert_eq!(entries[1].original_path.file_name().unwrap(), "a.md");
    }

    #[test]
    fn move_to_trash_rejects_missing_path() {
        let (_tmp, root) = setup_vault();
        let err = move_to_trash(&root, &root.join("Captures/ghost.md")).unwrap_err();
        assert!(matches!(err, AppError::PathNotFound(_)));
    }

    #[test]
    fn move_to_trash_rejects_path_outside_vault() {
        let (_tmp, root) = setup_vault();
        let outside = TempDir::new().unwrap();
        let note = outside.path().join("x.md");
        fs::write(&note, "hi").unwrap();
        let err = move_to_trash(&root, &note).unwrap_err();
        assert!(matches!(err, AppError::NotWritable(_)));
    }

    #[test]
    fn restore_rejects_unknown_trashed_path() {
        let (_tmp, root) = setup_vault();
        let err = restore(&root, &root.join(CAIRN_DIR).join("trash/nope.md")).unwrap_err();
        assert!(matches!(err, AppError::PathNotFound(_)));
    }
}
