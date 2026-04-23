//! User-level preferences, persisted to `app_data_dir/preferences.json`.
//!
//! Distinct from `VaultConfig` (per-vault, lives in `.cairn/config.json`)
//! and from the vault `Registry` (list of known vaults). Preferences here
//! apply across vaults — anything that is about the user's relationship
//! with Cairn itself rather than any single vault.
//!
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

/// Close-to-tray defaults on. Closing the main window hides it and keeps the
/// app alive in the system tray so the Quick Capture global shortcut remains
/// available. Users can switch to the legacy "close exits" behaviour in
/// Settings.
pub const DEFAULT_CLOSE_TO_TRAY: bool = true;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PreferencesFile {
    #[serde(default = "default_shortcut")]
    quick_capture_shortcut: String,
    #[serde(default = "default_close_to_tray")]
    close_to_tray: bool,
    #[serde(default)]
    tray_hint_shown: bool,
}

fn default_shortcut() -> String {
    DEFAULT_QUICK_CAPTURE_SHORTCUT.to_string()
}

fn default_close_to_tray() -> bool {
    DEFAULT_CLOSE_TO_TRAY
}

impl Default for PreferencesFile {
    fn default() -> Self {
        Self {
            quick_capture_shortcut: default_shortcut(),
            close_to_tray: default_close_to_tray(),
            tray_hint_shown: false,
        }
    }
}

/// In-memory user preferences. Bound to `data_dir` at construction so
/// mutations can persist without threading the path through every call.
#[derive(Debug)]
pub struct Preferences {
    data_dir: PathBuf,
    quick_capture_shortcut: String,
    close_to_tray: bool,
    tray_hint_shown: bool,
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
            close_to_tray: file.close_to_tray,
            tray_hint_shown: file.tray_hint_shown,
        })
    }

    pub fn quick_capture_shortcut(&self) -> &str {
        &self.quick_capture_shortcut
    }

    /// Whether closing the main window hides it (tray keeps app alive) or
    /// exits the whole process.
    pub fn close_to_tray(&self) -> bool {
        self.close_to_tray
    }

    /// Whether the first-close "Cairn is still running in the tray" hint has
    /// already been shown to the user.
    pub fn tray_hint_shown(&self) -> bool {
        self.tray_hint_shown
    }

    /// Persist a new Quick Capture shortcut. Caller is responsible for
    /// validating the accelerator string before calling — this module only
    /// stores what it's handed.
    pub fn set_quick_capture_shortcut(&mut self, accelerator: impl Into<String>) -> AppResult<()> {
        self.quick_capture_shortcut = accelerator.into();
        self.save()
    }

    /// Persist a new close-to-tray preference.
    pub fn set_close_to_tray(&mut self, enabled: bool) -> AppResult<()> {
        self.close_to_tray = enabled;
        self.save()
    }

    /// Mark the one-time tray hint as shown so it doesn't fire on every close.
    pub fn set_tray_hint_shown(&mut self) -> AppResult<()> {
        if self.tray_hint_shown {
            return Ok(());
        }
        self.tray_hint_shown = true;
        self.save()
    }

    fn save(&self) -> AppResult<()> {
        let file = PreferencesFile {
            quick_capture_shortcut: self.quick_capture_shortcut.clone(),
            close_to_tray: self.close_to_tray,
            tray_hint_shown: self.tray_hint_shown,
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
    pub close_to_tray: bool,
    pub tray_hint_shown: bool,
}

impl From<&Preferences> for PreferencesSnapshot {
    fn from(p: &Preferences) -> Self {
        Self {
            quick_capture_shortcut: p.quick_capture_shortcut.clone(),
            close_to_tray: p.close_to_tray,
            tray_hint_shown: p.tray_hint_shown,
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
        assert!(prefs.close_to_tray());
        assert!(!prefs.tray_hint_shown());
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
        assert!(prefs.close_to_tray());
    }

    #[test]
    fn legacy_file_without_field_uses_default() {
        let dir = TempDir::new().unwrap();
        fs::write(dir.path().join(PREFERENCES_FILE), b"{}").unwrap();
        let prefs = Preferences::load(dir.path()).unwrap();
        assert_eq!(prefs.quick_capture_shortcut(), DEFAULT_QUICK_CAPTURE_SHORTCUT);
        assert!(prefs.close_to_tray());
        assert!(!prefs.tray_hint_shown());
    }

    #[test]
    fn legacy_file_with_only_shortcut_keeps_new_defaults() {
        // Files written before close-to-tray existed must keep the sensible
        // defaults rather than silently landing in some third state.
        let dir = TempDir::new().unwrap();
        fs::write(
            dir.path().join(PREFERENCES_FILE),
            br#"{"quickCaptureShortcut":"CommandOrControl+Alt+K"}"#,
        )
        .unwrap();
        let prefs = Preferences::load(dir.path()).unwrap();
        assert_eq!(prefs.quick_capture_shortcut(), "CommandOrControl+Alt+K");
        assert!(prefs.close_to_tray());
        assert!(!prefs.tray_hint_shown());
    }

    #[test]
    fn set_close_to_tray_persists_across_reload() {
        let dir = TempDir::new().unwrap();
        {
            let mut prefs = Preferences::load(dir.path()).unwrap();
            prefs.set_close_to_tray(false).unwrap();
        }
        let reloaded = Preferences::load(dir.path()).unwrap();
        assert!(!reloaded.close_to_tray());
    }

    #[test]
    fn set_tray_hint_shown_is_sticky() {
        let dir = TempDir::new().unwrap();
        {
            let mut prefs = Preferences::load(dir.path()).unwrap();
            assert!(!prefs.tray_hint_shown());
            prefs.set_tray_hint_shown().unwrap();
            // Calling twice must not error or re-save needlessly.
            prefs.set_tray_hint_shown().unwrap();
        }
        let reloaded = Preferences::load(dir.path()).unwrap();
        assert!(reloaded.tray_hint_shown());
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
        assert!(
            json.contains("\"closeToTray\""),
            "expected camelCase serde rename, got: {json}",
        );
        assert!(
            json.contains("\"trayHintShown\""),
            "expected camelCase serde rename, got: {json}",
        );
    }
}
