//! App-level registry of known vaults, persisted to `app_data_dir/registry.json`.
//!
//! The registry stores a cache of `VaultSummary` plus the path of the active
//! vault (if any). It is written atomically on every mutation so it can't be
//! left half-updated by a crash. Registry I/O is independent of any specific
//! vault — it lives in the OS application-data directory (e.g.
//! `%APPDATA%/ai.al.cairn/registry.json` on Windows).
//!
//! The registry only caches `{ path, name, last_opened_at }`. The truth of a
//! vault's name lives in its own `.cairn/config.json`; the cache exists so the
//! picker can render recent vaults quickly without scanning every vault
//! directory on launch.

use crate::error::AppResult;
use crate::vault::VaultSummary;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

const REGISTRY_FILE: &str = "registry.json";

#[derive(Debug, Default, Serialize, Deserialize, Clone)]
struct RegistryFile {
    #[serde(default)]
    vaults: Vec<VaultSummary>,
    #[serde(default)]
    active: Option<PathBuf>,
}

/// In-memory registry state. Keyed by canonical vault path so inserts are
/// idempotent regardless of the lookup order.
#[derive(Debug)]
pub struct Registry {
    data_dir: PathBuf,
    vaults: BTreeMap<PathBuf, VaultSummary>,
    active: Option<PathBuf>,
}

impl Registry {
    /// Load the registry from `data_dir/registry.json`. Creates `data_dir` if
    /// missing. An absent registry file is treated as an empty registry —
    /// first-run behavior.
    pub fn load(data_dir: &Path) -> AppResult<Self> {
        fs::create_dir_all(data_dir)?;
        let file_path = data_dir.join(REGISTRY_FILE);

        let file: RegistryFile = if file_path.exists() {
            let bytes = fs::read(&file_path)?;
            serde_json::from_slice(&bytes).unwrap_or_default()
        } else {
            RegistryFile::default()
        };

        let vaults = file
            .vaults
            .into_iter()
            .map(|v| (v.path.clone(), v))
            .collect();

        Ok(Self {
            data_dir: data_dir.to_path_buf(),
            vaults,
            active: file.active,
        })
    }

    /// All registered vaults, ordered by last opened (most recent first).
    pub fn list(&self) -> Vec<VaultSummary> {
        let mut out: Vec<_> = self.vaults.values().cloned().collect();
        out.sort_by(|a, b| b.last_opened_at.cmp(&a.last_opened_at));
        out
    }

    /// Insert or replace the summary for a vault. Stamps `last_opened_at`
    /// with the current time.
    pub fn upsert(&mut self, mut summary: VaultSummary) -> AppResult<VaultSummary> {
        summary.last_opened_at = Some(Utc::now());
        self.vaults.insert(summary.path.clone(), summary.clone());
        self.save()?;
        Ok(summary)
    }

    /// Remove a vault from the registry. No-op if not present. Clears
    /// `active` if the removed vault was the active one.
    pub fn remove(&mut self, path: &Path) -> AppResult<()> {
        let removed = self.vaults.remove(path).is_some();
        if self.active.as_deref() == Some(path) {
            self.active = None;
        }
        if removed {
            self.save()?;
        }
        Ok(())
    }

    pub fn set_active(&mut self, path: &Path) -> AppResult<()> {
        self.active = Some(path.to_path_buf());
        self.save()
    }

    pub fn clear_active(&mut self) -> AppResult<()> {
        self.active = None;
        self.save()
    }

    pub fn active(&self) -> Option<&VaultSummary> {
        self.active.as_ref().and_then(|p| self.vaults.get(p))
    }

    fn save(&self) -> AppResult<()> {
        let file = RegistryFile {
            vaults: self.vaults.values().cloned().collect(),
            active: self.active.clone(),
        };
        let bytes = serde_json::to_vec_pretty(&file)?;
        let target = self.data_dir.join(REGISTRY_FILE);
        atomic_write(&target, &bytes)
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

    fn summary(path: &Path, name: &str) -> VaultSummary {
        VaultSummary {
            path: path.to_path_buf(),
            name: name.to_string(),
            last_opened_at: None,
        }
    }

    #[test]
    fn load_from_empty_dir_yields_empty_registry() {
        let dir = TempDir::new().unwrap();
        let reg = Registry::load(dir.path()).unwrap();
        assert!(reg.list().is_empty());
        assert!(reg.active().is_none());
    }

    #[test]
    fn upsert_persists_across_reload() {
        let dir = TempDir::new().unwrap();
        let vault_path = PathBuf::from("/some/vault");
        {
            let mut reg = Registry::load(dir.path()).unwrap();
            reg.upsert(summary(&vault_path, "Brain")).unwrap();
        }
        let reloaded = Registry::load(dir.path()).unwrap();
        let list = reloaded.list();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].name, "Brain");
        assert!(list[0].last_opened_at.is_some());
    }

    #[test]
    fn upsert_is_idempotent_on_same_path() {
        let dir = TempDir::new().unwrap();
        let mut reg = Registry::load(dir.path()).unwrap();
        let p = PathBuf::from("/v");
        reg.upsert(summary(&p, "first")).unwrap();
        reg.upsert(summary(&p, "second")).unwrap();
        let list = reg.list();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].name, "second");
    }

    #[test]
    fn list_orders_most_recent_first() {
        let dir = TempDir::new().unwrap();
        let mut reg = Registry::load(dir.path()).unwrap();
        reg.upsert(summary(Path::new("/a"), "A")).unwrap();
        std::thread::sleep(std::time::Duration::from_millis(5));
        reg.upsert(summary(Path::new("/b"), "B")).unwrap();
        std::thread::sleep(std::time::Duration::from_millis(5));
        reg.upsert(summary(Path::new("/c"), "C")).unwrap();

        let list = reg.list();
        assert_eq!(list[0].name, "C");
        assert_eq!(list[1].name, "B");
        assert_eq!(list[2].name, "A");
    }

    #[test]
    fn set_and_clear_active() {
        let dir = TempDir::new().unwrap();
        let mut reg = Registry::load(dir.path()).unwrap();
        let p = PathBuf::from("/v");
        reg.upsert(summary(&p, "V")).unwrap();
        reg.set_active(&p).unwrap();
        assert_eq!(reg.active().map(|v| v.name.as_str()), Some("V"));

        reg.clear_active().unwrap();
        assert!(reg.active().is_none());
    }

    #[test]
    fn remove_clears_active_if_matches() {
        let dir = TempDir::new().unwrap();
        let mut reg = Registry::load(dir.path()).unwrap();
        let p = PathBuf::from("/v");
        reg.upsert(summary(&p, "V")).unwrap();
        reg.set_active(&p).unwrap();
        reg.remove(&p).unwrap();
        assert!(reg.active().is_none());
        assert!(reg.list().is_empty());
    }

    #[test]
    fn remove_is_noop_when_path_missing() {
        let dir = TempDir::new().unwrap();
        let mut reg = Registry::load(dir.path()).unwrap();
        reg.remove(Path::new("/nonexistent")).unwrap();
        assert!(reg.list().is_empty());
    }

    #[test]
    fn corrupt_registry_file_is_treated_as_empty() {
        let dir = TempDir::new().unwrap();
        fs::write(dir.path().join(REGISTRY_FILE), b"not json at all").unwrap();
        let reg = Registry::load(dir.path()).unwrap();
        assert!(reg.list().is_empty());
    }
}
