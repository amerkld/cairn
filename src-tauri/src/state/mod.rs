//! Per-vault state that isn't part of the notes themselves.
//!
//! Lives at `<vault>/.cairn/state.json`. Holds:
//! - `actionOrder`: cross-project action order shown on the Home dashboard.
//! - `projectRecency`: per-project "last opened" timestamps driving the
//!   system-tray menu's "Recent Projects" shortcuts.
//!
//! Keeping this out of note frontmatter is deliberate: drag-sorting actions
//! on Home would otherwise rewrite ten `.md` files per drag — pointless
//! filesystem churn that would also muddy any `git log` a user runs over
//! their vault. The same reasoning applies to recency — recording "user
//! looked at this project" inside the project's own files would dirty
//! working trees for something the user didn't actually change.

use crate::error::AppResult;
use crate::vault::CAIRN_DIR;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

const STATE_FILE: &str = "state.json";

/// Hard cap on remembered project visits. The tray surfaces the top 3 but
/// a small buffer lets us keep something reasonable when a recently-opened
/// project is renamed or deleted before the user opens a fresh one.
pub const PROJECT_RECENCY_CAP: usize = 8;

/// A single project-visit entry. `path` is the absolute path stored as a
/// string (same convention as `action_order`) so the frontend can round-trip
/// it without any path normalization of its own.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProjectVisit {
    pub path: String,
    pub opened_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct VaultState {
    /// Ordered list of action paths (vault-relative) as displayed on Home.
    /// Anything not in this list appears after these in `created_at` order.
    #[serde(rename = "actionOrder", default)]
    pub action_order: Vec<String>,

    /// Most-recently-opened projects, newest first. Bounded by
    /// `PROJECT_RECENCY_CAP`. Used by the system tray menu.
    #[serde(rename = "projectRecency", default)]
    pub project_recency: Vec<ProjectVisit>,
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

/// Record a "user visited this project" event. If the project is already in
/// the list, its entry is moved to the top (not duplicated). The list is
/// trimmed to `PROJECT_RECENCY_CAP` entries.
pub fn record_project_visit(vault_root: &Path, project_path: &str) -> AppResult<Vec<ProjectVisit>> {
    let mut state = load(vault_root)?;
    state.project_recency.retain(|v| v.path != project_path);
    state.project_recency.insert(
        0,
        ProjectVisit {
            path: project_path.to_string(),
            opened_at: Utc::now(),
        },
    );
    if state.project_recency.len() > PROJECT_RECENCY_CAP {
        state.project_recency.truncate(PROJECT_RECENCY_CAP);
    }
    save(vault_root, &state)?;
    Ok(state.project_recency)
}

/// Return the N most-recent project visits, filtered to paths whose on-disk
/// directory still exists. Entries pointing at deleted or renamed projects
/// are skipped so the caller gets a clean list ready to surface in a menu.
pub fn recent_projects(vault_root: &Path, limit: usize) -> AppResult<Vec<ProjectVisit>> {
    if limit == 0 {
        return Ok(Vec::new());
    }
    let state = load(vault_root)?;
    let out: Vec<ProjectVisit> = state
        .project_recency
        .into_iter()
        .filter(|v| Path::new(&v.path).is_dir())
        .take(limit)
        .collect();
    Ok(out)
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
        assert_eq!(state.project_recency.len(), 0);
    }

    #[test]
    fn save_then_load_round_trip() {
        let (_tmp, root) = setup_vault();
        let order = vec!["Projects/A/Actions/a.md".to_string(), "b.md".to_string()];
        save(
            &root,
            &VaultState {
                action_order: order.clone(),
                project_recency: Vec::new(),
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

    #[test]
    fn legacy_state_file_without_project_recency_loads() {
        // Older state files don't have the projectRecency key. They must
        // deserialize to an empty recency list rather than failing the load.
        let (_tmp, root) = setup_vault();
        fs::write(
            state_path(&root),
            br#"{"actionOrder":["a.md","b.md"]}"#,
        )
        .unwrap();
        let state = load(&root).unwrap();
        assert_eq!(state.action_order.len(), 2);
        assert!(state.project_recency.is_empty());
    }

    #[test]
    fn record_project_visit_prepends_new_entry() {
        let (_tmp, root) = setup_vault();
        let p = crate::fs::create_project(&root, "Alpha").unwrap();
        let list = record_project_visit(&root, &p.to_string_lossy()).unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].path, p.to_string_lossy());
    }

    #[test]
    fn record_project_visit_moves_existing_entry_to_top() {
        let (_tmp, root) = setup_vault();
        let a = crate::fs::create_project(&root, "A").unwrap();
        let b = crate::fs::create_project(&root, "B").unwrap();

        record_project_visit(&root, &a.to_string_lossy()).unwrap();
        record_project_visit(&root, &b.to_string_lossy()).unwrap();
        record_project_visit(&root, &a.to_string_lossy()).unwrap();

        let state = load(&root).unwrap();
        assert_eq!(state.project_recency.len(), 2);
        // A was revisited, so it should sit on top now.
        assert_eq!(state.project_recency[0].path, a.to_string_lossy());
        assert_eq!(state.project_recency[1].path, b.to_string_lossy());
    }

    #[test]
    fn record_project_visit_caps_list_length() {
        let (_tmp, root) = setup_vault();
        // Push one more than the cap so we can verify the oldest is dropped.
        let mut paths = Vec::new();
        for i in 0..(PROJECT_RECENCY_CAP + 1) {
            let p = crate::fs::create_project(&root, &format!("P{i}")).unwrap();
            paths.push(p.to_string_lossy().to_string());
            record_project_visit(&root, paths.last().unwrap()).unwrap();
        }
        let state = load(&root).unwrap();
        assert_eq!(state.project_recency.len(), PROJECT_RECENCY_CAP);
        // Most recent (last pushed) is on top; the very first pushed should
        // have been trimmed off the tail.
        assert_eq!(state.project_recency[0].path, *paths.last().unwrap());
        assert!(!state
            .project_recency
            .iter()
            .any(|v| v.path == paths[0]));
    }

    #[test]
    fn recent_projects_filters_deleted_paths() {
        let (_tmp, root) = setup_vault();
        let a = crate::fs::create_project(&root, "A").unwrap();
        let b = crate::fs::create_project(&root, "B").unwrap();
        record_project_visit(&root, &a.to_string_lossy()).unwrap();
        record_project_visit(&root, &b.to_string_lossy()).unwrap();

        // Delete the folder for A on disk (bypassing trash — we just need
        // the path gone for this test).
        fs::remove_dir_all(&a).unwrap();

        let recents = recent_projects(&root, 3).unwrap();
        assert_eq!(recents.len(), 1);
        assert_eq!(recents[0].path, b.to_string_lossy());
    }

    #[test]
    fn recent_projects_respects_limit() {
        let (_tmp, root) = setup_vault();
        for i in 0..5 {
            let p = crate::fs::create_project(&root, &format!("P{i}")).unwrap();
            record_project_visit(&root, &p.to_string_lossy()).unwrap();
        }
        let recents = recent_projects(&root, 3).unwrap();
        assert_eq!(recents.len(), 3);
    }

    #[test]
    fn recent_projects_zero_limit_returns_empty() {
        let (_tmp, root) = setup_vault();
        let p = crate::fs::create_project(&root, "A").unwrap();
        record_project_visit(&root, &p.to_string_lossy()).unwrap();
        assert!(recent_projects(&root, 0).unwrap().is_empty());
    }

    #[test]
    fn project_recency_serializes_camel_case_on_disk() {
        let (_tmp, root) = setup_vault();
        let p = crate::fs::create_project(&root, "A").unwrap();
        record_project_visit(&root, &p.to_string_lossy()).unwrap();

        let raw = fs::read_to_string(state_path(&root)).unwrap();
        assert!(
            raw.contains("\"projectRecency\""),
            "expected camelCase key in on-disk state, got: {raw}",
        );
        assert!(
            raw.contains("\"openedAt\""),
            "expected camelCase openedAt, got: {raw}",
        );
    }
}
