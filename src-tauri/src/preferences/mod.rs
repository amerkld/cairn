//! User-level preferences, persisted to `app_data_dir/preferences.json`.
//!
//! Distinct from `VaultConfig` (per-vault, lives in `.cairn/config.json`)
//! and from the vault `Registry` (list of known vaults). Preferences here
//! apply across vaults — anything that is about the user's relationship
//! with Cairn itself rather than any single vault.
//!
//! Currently just the configurable global shortcut for Quick Capture.
//! Writes are atomic (tmp-file + rename) so a crash mid-write can't leave
//! the file half-updated.

use crate::error::AppResult;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

const PREFERENCES_FILE: &str = "preferences.json";

/// Default accelerator. `CommandOrControl` lets Tauri pick Cmd on macOS and
/// Ctrl elsewhere. `Shift+N` keeps `Ctrl/Cmd+N` free for the in-app "new
/// capture" shortcut which only fires when Cairn has focus.
pub const DEFAULT_QUICK_CAPTURE_SHORTCUT: &str = "CommandOrControl+Shift+N";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PreferencesFile {
    #[serde(default = "default_shortcut")]
    quick_capture_shortcut: String,
}

fn default_shortcut() -> String {
    DEFAULT_QUICK_CAPTURE_SHORTCUT.to_string()
}

impl Default for PreferencesFile {
    fn default() -> Self {
        Self {
            quick_capture_shortcut: default_shortcut(),
        }
    }
}

/// In-memory user preferences. Bound to `data_dir` at construction so
/// mutations can persist without threading the path through every call.
#[derive(Debug)]
pub struct Preferences {
    data_dir: PathBuf,
    quick_capture_shortcut: String,
}

impl Preferences {
    /// Load preferences from disk. A missing or unparseable file is treated
    /// as first-run and falls back to defaults — a corrupt prefs file must
    /// never prevent the app from starting.
    pub fn load(data_dir: &Path) -> AppResult<Self> {
        fs::create_dir_all(data_dir)?;
        let file_path = data_dir.join(PREFERENCES_FILE);
        let file: PreferencesFile = if file_path.exists() {
            let bytes = fs::read(&file_path)?;
            serde_json::from_slice(&bytes).unwrap_or_default()
        } else {
            PreferencesFile::default()
        };
        Ok(Self {
            data_dir: data_dir.to_path_buf(),
            quick_capture_shortcut: file.quick_capture_shortcut,
        })
    }

    pub fn quick_capture_shortcut(&self) -> &str {
        &self.quick_capture_shortcut
    }

    /// Persist a new Quick Capture shortcut. Caller is responsible for
    /// validating the accelerator string before calling — this module only
    /// stores what it's handed.
    pub fn set_quick_capture_shortcut(&mut self, accelerator: impl Into<String>) -> AppResult<()> {
        self.quick_capture_shortcut = accelerator.into();
        self.save()
    }

    fn save(&self) -> AppResult<()> {
        let file = PreferencesFile {
            quick_capture_shortcut: self.quick_capture_shortcut.clone(),
        };
        let bytes = serde_json::to_vec_pretty(&file)?;
        let target = self.data_dir.join(PREFERENCES_FILE);
        atomic_write(&target, &bytes)
    }
}

/// Frontend-facing snapshot. Kept separate from the stateful `Preferences`
/// so commands can serialize without borrowing the live struct.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PreferencesSnapshot {
    pub quick_capture_shortcut: String,
}

impl From<&Preferences> for PreferencesSnapshot {
    fn from(p: &Preferences) -> Self {
        Self {
            quick_capture_shortcut: p.quick_capture_shortcut.clone(),
        }
    }
}

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
    fn load_from_empty_dir_uses_defaults() {
        let dir = TempDir::new().unwrap();
        let prefs = Preferences::load(dir.path()).unwrap();
        assert_eq!(prefs.quick_capture_shortcut(), DEFAULT_QUICK_CAPTURE_SHORTCUT);
    }

    #[test]
    fn set_persists_across_reload() {
        let dir = TempDir::new().unwrap();
        {
            let mut prefs = Preferences::load(dir.path()).unwrap();
            prefs
                .set_quick_capture_shortcut("CommandOrControl+Alt+J")
                .unwrap();
        }
        let reloaded = Preferences::load(dir.path()).unwrap();
        assert_eq!(reloaded.quick_capture_shortcut(), "CommandOrControl+Alt+J");
    }

    #[test]
    fn corrupt_file_falls_back_to_defaults() {
        let dir = TempDir::new().unwrap();
        fs::write(dir.path().join(PREFERENCES_FILE), b"not json at all").unwrap();
        let prefs = Preferences::load(dir.path()).unwrap();
        assert_eq!(prefs.quick_capture_shortcut(), DEFAULT_QUICK_CAPTURE_SHORTCUT);
    }

    #[test]
    fn legacy_file_without_field_uses_default() {
        let dir = TempDir::new().unwrap();
        fs::write(dir.path().join(PREFERENCES_FILE), b"{}").unwrap();
        let prefs = Preferences::load(dir.path()).unwrap();
        assert_eq!(prefs.quick_capture_shortcut(), DEFAULT_QUICK_CAPTURE_SHORTCUT);
    }

    #[test]
    fn save_leaves_no_tmp_behind() {
        let dir = TempDir::new().unwrap();
        let mut prefs = Preferences::load(dir.path()).unwrap();
        prefs
            .set_quick_capture_shortcut("CommandOrControl+Shift+K")
            .unwrap();
        let tmp = dir.path().join("preferences.tmp");
        assert!(!tmp.exists());
        assert!(dir.path().join(PREFERENCES_FILE).exists());
    }

    #[test]
    fn snapshot_serializes_camel_case() {
        let dir = TempDir::new().unwrap();
        let prefs = Preferences::load(dir.path()).unwrap();
        let snap = PreferencesSnapshot::from(&prefs);
        let json = serde_json::to_string(&snap).unwrap();
        assert!(
            json.contains("\"quickCaptureShortcut\""),
            "expected camelCase serde rename, got: {json}",
        );
    }
}
