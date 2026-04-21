//! Vault lifecycle: open, create, bootstrap, and the app-level registry of
//! known vaults. A vault is any directory containing a `.cairn/` subdirectory;
//! "opening" an arbitrary directory for the first time bootstraps that
//! subdirectory with defaults.
//!
//! This module only knows about disk layout — it does NOT know about the
//! Tauri runtime. That keeps it unit-testable with `tempfile::TempDir`.

use crate::error::{AppError, AppResult};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

pub const CAIRN_DIR: &str = ".cairn";
pub const CAPTURES_DIR: &str = "Captures";
pub const SOMEDAY_DIR: &str = "Someday";
pub const PROJECTS_DIR: &str = "Projects";
pub const TRASH_DIR: &str = "trash";

const CONFIG_FILE: &str = "config.json";
const STATE_FILE: &str = "state.json";
const REMINDERS_FILE: &str = "reminders.json";
const TRASH_INDEX_FILE: &str = "trash-index.json";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct VaultSummary {
    pub path: PathBuf,
    pub name: String,
    #[serde(rename = "lastOpenedAt")]
    pub last_opened_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct VaultConfig {
    pub name: String,
    #[serde(default)]
    pub tags: Vec<TagDef>,
}

/// A tag definition stored in `.cairn/config.json`.
///
/// Only tags with custom metadata (a color) need to live here — ad-hoc tags
/// applied via frontmatter alone are first-class too, they just don't have
/// a color assigned. `label` is the unique key.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct TagDef {
    pub label: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
}

/// Open an existing vault, or bootstrap a new one at `path`.
///
/// Bootstrapping is idempotent: opening a vault that already has a `.cairn/`
/// directory leaves existing files alone and only creates anything missing.
///
/// Returns a summary (path + display name + last-opened timestamp set to now).
pub fn open(path: &Path) -> AppResult<VaultSummary> {
    validate_writable_dir(path)?;
    bootstrap(path)?;

    let config_path = path.join(CAIRN_DIR).join(CONFIG_FILE);
    let config: VaultConfig = read_json(&config_path)?;

    Ok(VaultSummary {
        path: path.to_path_buf(),
        name: config.name,
        last_opened_at: Some(Utc::now()),
    })
}

/// Create a new vault at `path` with the given display name. Fails if a
/// `.cairn/` directory already exists at that location (use `open` instead).
pub fn create(path: &Path, name: &str) -> AppResult<VaultSummary> {
    validate_writable_dir(path)?;
    if path.join(CAIRN_DIR).exists() {
        return Err(AppError::VaultAlreadyExists(path.to_path_buf()));
    }
    bootstrap_with_name(path, name)?;

    Ok(VaultSummary {
        path: path.to_path_buf(),
        name: name.to_string(),
        last_opened_at: Some(Utc::now()),
    })
}

fn bootstrap(path: &Path) -> AppResult<()> {
    let default_name = derive_default_name(path);
    bootstrap_with_name(path, &default_name)
}

fn bootstrap_with_name(path: &Path, name: &str) -> AppResult<()> {
    let cairn = path.join(CAIRN_DIR);
    fs::create_dir_all(&cairn)?;
    fs::create_dir_all(cairn.join(TRASH_DIR))?;
    fs::create_dir_all(path.join(CAPTURES_DIR))?;
    fs::create_dir_all(path.join(SOMEDAY_DIR))?;
    fs::create_dir_all(path.join(PROJECTS_DIR))?;

    let config_path = cairn.join(CONFIG_FILE);
    if !config_path.exists() {
        let config = VaultConfig {
            name: name.to_string(),
            tags: Vec::new(),
        };
        write_json(&config_path, &config)?;
    }

    let state_path = cairn.join(STATE_FILE);
    if !state_path.exists() {
        write_json(&state_path, &serde_json::json!({ "actionOrder": [] }))?;
    }

    let reminders_path = cairn.join(REMINDERS_FILE);
    if !reminders_path.exists() {
        write_json(&reminders_path, &serde_json::json!({ "entries": [] }))?;
    }

    let trash_index_path = cairn.join(TRASH_INDEX_FILE);
    if !trash_index_path.exists() {
        write_json(&trash_index_path, &serde_json::json!({ "entries": [] }))?;
    }

    Ok(())
}

fn validate_writable_dir(path: &Path) -> AppResult<()> {
    if !path.exists() {
        return Err(AppError::PathNotFound(path.to_path_buf()));
    }
    let meta = fs::metadata(path)?;
    if !meta.is_dir() {
        return Err(AppError::NotADirectory(path.to_path_buf()));
    }
    if meta.permissions().readonly() {
        return Err(AppError::NotWritable(path.to_path_buf()));
    }
    Ok(())
}

fn derive_default_name(path: &Path) -> String {
    path.file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("Vault")
        .to_string()
}

fn read_json<T: for<'de> Deserialize<'de>>(path: &Path) -> AppResult<T> {
    let bytes = fs::read(path)?;
    Ok(serde_json::from_slice(&bytes)?)
}

fn write_json<T: Serialize>(path: &Path, value: &T) -> AppResult<()> {
    let bytes = serde_json::to_vec_pretty(value)?;
    atomic_write(path, &bytes)
}

/// Load a vault's config file, falling back to defaults if missing.
/// Public for callers like the tags module that need to mutate tag defs.
pub fn load_config(vault_root: &Path) -> AppResult<VaultConfig> {
    let path = vault_root.join(CAIRN_DIR).join(CONFIG_FILE);
    if !path.exists() {
        return Ok(VaultConfig::default());
    }
    read_json(&path)
}

/// Persist a vault's config file atomically.
pub fn save_config(vault_root: &Path, config: &VaultConfig) -> AppResult<()> {
    let path = vault_root.join(CAIRN_DIR).join(CONFIG_FILE);
    write_json(&path, config)
}

/// Write `bytes` to `path` via a temp-file-and-rename so the destination is
/// never left in a half-written state on crash.
fn atomic_write(path: &Path, bytes: &[u8]) -> AppResult<()> {
    let tmp = path.with_extension("tmp");
    fs::write(&tmp, bytes)?;
    fs::rename(&tmp, path)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn open_bootstraps_a_fresh_directory() {
        let dir = TempDir::new().unwrap();
        let summary = open(dir.path()).expect("open should succeed");

        assert_eq!(summary.path, dir.path());
        assert!(dir.path().join(CAIRN_DIR).is_dir());
        assert!(dir.path().join(CAIRN_DIR).join(CONFIG_FILE).is_file());
        assert!(dir.path().join(CAIRN_DIR).join(STATE_FILE).is_file());
        assert!(dir.path().join(CAIRN_DIR).join(REMINDERS_FILE).is_file());
        assert!(dir.path().join(CAIRN_DIR).join(TRASH_INDEX_FILE).is_file());
        assert!(dir.path().join(CAIRN_DIR).join(TRASH_DIR).is_dir());
        assert!(dir.path().join(CAPTURES_DIR).is_dir());
        assert!(dir.path().join(SOMEDAY_DIR).is_dir());
        assert!(dir.path().join(PROJECTS_DIR).is_dir());
    }

    #[test]
    fn open_is_idempotent() {
        let dir = TempDir::new().unwrap();
        open(dir.path()).unwrap();
        // Stamp a user file — second open must not delete or overwrite it.
        let user_note = dir.path().join(CAPTURES_DIR).join("hello.md");
        fs::write(&user_note, "# hello").unwrap();

        open(dir.path()).unwrap();

        assert_eq!(fs::read_to_string(&user_note).unwrap(), "# hello");
    }

    #[test]
    fn open_preserves_existing_config() {
        let dir = TempDir::new().unwrap();
        open(dir.path()).unwrap();

        // Simulate user-edited config
        let config_path = dir.path().join(CAIRN_DIR).join(CONFIG_FILE);
        let edited = VaultConfig {
            name: "My Brain".to_string(),
            tags: vec![TagDef {
                label: "work".into(),
                color: Some("#fac775".into()),
            }],
        };
        write_json(&config_path, &edited).unwrap();

        let summary = open(dir.path()).unwrap();
        assert_eq!(summary.name, "My Brain");
    }

    #[test]
    fn open_rejects_missing_path() {
        let err = open(Path::new("/definitely/not/real/cairn-vault-xyz")).unwrap_err();
        assert!(matches!(err, AppError::PathNotFound(_)));
    }

    #[test]
    fn open_rejects_file_path() {
        let dir = TempDir::new().unwrap();
        let file = dir.path().join("not-a-dir.txt");
        fs::write(&file, "hi").unwrap();

        let err = open(&file).unwrap_err();
        assert!(matches!(err, AppError::NotADirectory(_)));
    }

    #[test]
    fn create_fails_if_cairn_already_exists() {
        let dir = TempDir::new().unwrap();
        open(dir.path()).unwrap();

        let err = create(dir.path(), "anything").unwrap_err();
        assert!(matches!(err, AppError::VaultAlreadyExists(_)));
    }

    #[test]
    fn create_sets_configured_name() {
        let dir = TempDir::new().unwrap();
        let sub = dir.path().join("new-vault");
        fs::create_dir(&sub).unwrap();

        let summary = create(&sub, "My Notes").unwrap();
        assert_eq!(summary.name, "My Notes");

        let reopened = open(&sub).unwrap();
        assert_eq!(reopened.name, "My Notes");
    }

    #[test]
    fn atomic_write_leaves_no_tmp_on_success() {
        let dir = TempDir::new().unwrap();
        let target = dir.path().join("x.json");
        atomic_write(&target, b"{}").unwrap();
        assert!(target.exists());
        assert!(!target.with_extension("tmp").exists());
    }
}
