//! Per-vault state that isn't part of the notes themselves.
//!
//! Lives at `<vault>/.cairn/state.json`. Today it holds the cross-project
//! action order shown on the Home dashboard; future fields (last-opened
//! note, view preferences) land here too without touching user-visible
//! markdown.
//!
//! Keeping this out of note frontmatter is deliberate: drag-sorting actions
//! on Home would otherwise rewrite ten `.md` files per drag — pointless
//! filesystem churn that would also muddy any `git log` a user runs over
//! their vault.

use crate::error::AppResult;
use crate::vault::CAIRN_DIR;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

const STATE_FILE: &str = "state.json";

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
pub struct VaultState {
    /// Ordered list of action paths (vault-relative) as displayed on Home.
    /// Anything not in this list appears after these in `created_at` order.
    #[serde(rename = "actionOrder", default)]
    pub action_order: Vec<String>,
}

pub fn load(vault_root: &Path) -> AppResult<VaultState> {
    let path = state_path(vault_root);
    if !path.exists() {
        return Ok(VaultState::default());
    }
    let bytes = fs::read(&path)?;
    // Be tolerant of manually-edited / corrupted state — treat bad JSON as
    // a fresh state. We never crash the app over a state file.
    Ok(serde_json::from_slice(&bytes).unwrap_or_default())
}

pub fn save(vault_root: &Path, state: &VaultState) -> AppResult<()> {
    let path = state_path(vault_root);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let bytes = serde_json::to_vec_pretty(state)?;
    atomic_write(&path, &bytes)
}

/// Merge `new_order` into the stored list, preserving unseen entries at the
/// end so a concurrent delete doesn't drop history. Returns the saved order.
pub fn set_action_order(vault_root: &Path, new_order: Vec<String>) -> AppResult<Vec<String>> {
    let mut state = load(vault_root)?;
    state.action_order = new_order;
    save(vault_root, &state)?;
    Ok(state.action_order)
}

fn state_path(vault_root: &Path) -> PathBuf {
    vault_root.join(CAIRN_DIR).join(STATE_FILE)
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
    use crate::vault;
    use tempfile::TempDir;

    fn setup_vault() -> (TempDir, PathBuf) {
        let dir = TempDir::new().unwrap();
        let root = dir.path().to_path_buf();
        vault::open(&root).unwrap();
        (dir, root)
    }

    #[test]
    fn load_missing_state_returns_default() {
        let dir = TempDir::new().unwrap();
        let state = load(dir.path()).unwrap();
        assert_eq!(state.action_order.len(), 0);
    }

    #[test]
    fn save_then_load_round_trip() {
        let (_tmp, root) = setup_vault();
        let order = vec!["Projects/A/Actions/a.md".to_string(), "b.md".to_string()];
        save(
            &root,
            &VaultState {
                action_order: order.clone(),
            },
        )
        .unwrap();
        let loaded = load(&root).unwrap();
        assert_eq!(loaded.action_order, order);
    }

    #[test]
    fn set_action_order_persists() {
        let (_tmp, root) = setup_vault();
        let out = set_action_order(
            &root,
            vec!["a.md".to_string(), "b.md".to_string(), "c.md".to_string()],
        )
        .unwrap();
        assert_eq!(out, vec!["a.md", "b.md", "c.md"]);

        let reloaded = load(&root).unwrap();
        assert_eq!(reloaded.action_order.len(), 3);
    }

    #[test]
    fn corrupt_state_file_treated_as_default() {
        let (_tmp, root) = setup_vault();
        fs::write(state_path(&root), b"this is not json").unwrap();
        let state = load(&root).unwrap();
        assert_eq!(state, VaultState::default());
    }
}
