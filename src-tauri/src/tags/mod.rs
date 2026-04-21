//! Tag management across a vault.
//!
//! A tag in Cairn has two sources of truth:
//!
//! - **Per-note frontmatter** (`tags: [...]` in YAML) — the authoritative
//!   record of which tags a note carries. Users can type any tag freely.
//! - **Vault config** (`.cairn/config.json`) — optional per-tag metadata
//!   (today just `color`). Tags that appear in frontmatter without a
//!   matching config entry are still real tags; they just render with a
//!   neutral color.
//!
//! This module keeps those two views in sync for rename and delete:
//! mutating a tag walks the vault's markdown files and rewrites every
//! affected note atomically, preserving unknown frontmatter keys.

use crate::error::{AppError, AppResult};
use crate::fs as vault_fs;
use crate::md;
use crate::vault::{self, CAIRN_DIR, TagDef};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::Path;
use walkdir::WalkDir;

/// A tag as surfaced to the UI: label, optional color from config, and how
/// many notes currently carry it.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TagInfo {
    pub label: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    pub count: u32,
    /// True when the tag appears in `.cairn/config.json` (and therefore can
    /// have a color). False for frontmatter-only tags.
    pub declared: bool,
}

/// List every tag in the vault — declared in config plus anything seen in
/// frontmatter — with usage counts. Sorted by `count` descending, then
/// `label` ascending, so the busiest tags surface first in filter UIs.
pub fn list_tags(vault_root: &Path) -> AppResult<Vec<TagInfo>> {
    let config = vault::load_config(vault_root)?;
    let declared: BTreeMap<String, Option<String>> = config
        .tags
        .into_iter()
        .map(|t| (t.label, t.color))
        .collect();

    let mut counts: BTreeMap<String, u32> = BTreeMap::new();
    for tag in walk_tag_usages(vault_root) {
        *counts.entry(tag).or_insert(0) += 1;
    }

    let mut seen: BTreeMap<String, TagInfo> = BTreeMap::new();
    for (label, color) in &declared {
        seen.insert(
            label.clone(),
            TagInfo {
                label: label.clone(),
                color: color.clone(),
                count: *counts.get(label).unwrap_or(&0),
                declared: true,
            },
        );
    }
    for (label, count) in counts {
        seen.entry(label.clone()).or_insert(TagInfo {
            label,
            color: None,
            count,
            declared: false,
        });
    }

    let mut out: Vec<TagInfo> = seen.into_values().collect();
    out.sort_by(|a, b| b.count.cmp(&a.count).then_with(|| a.label.cmp(&b.label)));
    Ok(out)
}

/// Rename `old` → `new` everywhere it appears: in the vault config and
/// across every note's frontmatter. Returns the number of notes rewritten.
///
/// If `new` already exists in config, the caller's color choice wins for it
/// (we drop `old`'s color). If any note already has `new`, duplicates are
/// deduplicated after replacement.
pub fn rename_tag(vault_root: &Path, old: &str, new: &str) -> AppResult<u32> {
    let new = new.trim();
    if new.is_empty() {
        return Err(AppError::Io(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "tag label cannot be empty",
        )));
    }
    if old == new {
        return Ok(0);
    }

    // Update config: if old exists, rename its label; if new also exists,
    // drop old so the two merge into new's entry.
    let mut config = vault::load_config(vault_root)?;
    let has_new = config.tags.iter().any(|t| t.label == new);
    config.tags.retain(|t| !(t.label == old && has_new));
    for t in &mut config.tags {
        if t.label == old {
            t.label = new.to_string();
        }
    }
    vault::save_config(vault_root, &config)?;

    rewrite_vault(vault_root, |tags| replace_tag_in_list(tags, old, new))
}

/// Delete a tag everywhere: remove it from config and strip it from every
/// note's frontmatter. Returns the number of notes rewritten.
pub fn delete_tag(vault_root: &Path, label: &str) -> AppResult<u32> {
    let mut config = vault::load_config(vault_root)?;
    config.tags.retain(|t| t.label != label);
    vault::save_config(vault_root, &config)?;

    rewrite_vault(vault_root, |tags| remove_tag_from_list(tags, label))
}

/// Set (or clear with `None`) the color for a tag. If the tag isn't in
/// config yet, it's inserted automatically so its color persists.
pub fn set_tag_color(
    vault_root: &Path,
    label: &str,
    color: Option<&str>,
) -> AppResult<()> {
    let label = label.trim();
    if label.is_empty() {
        return Err(AppError::Io(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "tag label cannot be empty",
        )));
    }
    let mut config = vault::load_config(vault_root)?;
    if let Some(existing) = config.tags.iter_mut().find(|t| t.label == label) {
        existing.color = color.map(str::to_string);
    } else {
        config.tags.push(TagDef {
            label: label.to_string(),
            color: color.map(str::to_string),
        });
    }
    vault::save_config(vault_root, &config)
}

// ─── internals ───────────────────────────────────────────────────────────

fn walk_tag_usages(vault_root: &Path) -> impl Iterator<Item = String> + '_ {
    let cairn = vault_root.join(CAIRN_DIR);
    WalkDir::new(vault_root)
        .into_iter()
        .filter_entry(move |e| e.path() != cairn)
        .filter_map(|e| e.ok())
        .filter(|e| e.path().is_file())
        .filter(|e| e.path().extension().and_then(|x| x.to_str()) == Some("md"))
        .filter_map(|e| std::fs::read_to_string(e.path()).ok())
        .filter_map(|raw| md::parse(&raw).ok())
        .flat_map(|parsed| parsed.frontmatter.tags)
}

/// Apply `mutate` to every note's `tags` array; rewrite files whose tags
/// actually changed. Returns the count of rewritten notes.
fn rewrite_vault(
    vault_root: &Path,
    mutate: impl Fn(&[String]) -> Option<Vec<String>>,
) -> AppResult<u32> {
    let cairn = vault_root.join(CAIRN_DIR);
    let mut rewritten = 0u32;

    for entry in WalkDir::new(vault_root)
        .into_iter()
        .filter_entry(|e| e.path() != cairn)
        .filter_map(|e| e.ok())
    {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        if path.extension().and_then(|x| x.to_str()) != Some("md") {
            continue;
        }

        let Ok(raw) = std::fs::read_to_string(path) else {
            continue;
        };
        let Ok(mut parsed) = md::parse(&raw) else {
            continue;
        };
        let Some(next) = mutate(&parsed.frontmatter.tags) else {
            continue;
        };
        if next == parsed.frontmatter.tags {
            continue;
        }
        parsed.frontmatter.tags = next;
        if vault_fs::write_note(path, &parsed).is_ok() {
            rewritten += 1;
        }
    }

    Ok(rewritten)
}

fn replace_tag_in_list(tags: &[String], old: &str, new: &str) -> Option<Vec<String>> {
    if !tags.iter().any(|t| t == old) {
        return None;
    }
    let mut out: Vec<String> = Vec::with_capacity(tags.len());
    for t in tags {
        let candidate = if t == old { new.to_string() } else { t.clone() };
        if !out.iter().any(|x| x == &candidate) {
            out.push(candidate);
        }
    }
    Some(out)
}

fn remove_tag_from_list(tags: &[String], label: &str) -> Option<Vec<String>> {
    if !tags.iter().any(|t| t == label) {
        return None;
    }
    Some(tags.iter().filter(|t| *t != label).cloned().collect())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::vault as vault_api;
    use std::fs;
    use std::path::PathBuf;
    use tempfile::TempDir;

    fn setup_vault() -> (TempDir, PathBuf) {
        let dir = TempDir::new().unwrap();
        let root = dir.path().to_path_buf();
        vault_api::open(&root).unwrap();
        (dir, root)
    }

    fn write_note(path: &Path, tags: &[&str]) {
        let tag_lines = tags
            .iter()
            .map(|t| format!("  - {t}"))
            .collect::<Vec<_>>()
            .join("\n");
        let body = format!(
            "---\ntitle: t\ntags:\n{tag_lines}\n---\n\nbody\n",
            tag_lines = tag_lines
        );
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).unwrap();
        }
        fs::write(path, body).unwrap();
    }

    #[test]
    fn list_tags_merges_declared_with_usage_counts() {
        let (_tmp, root) = setup_vault();
        // Declare one tag in config with a color.
        set_tag_color(&root, "work", Some("#fac775")).unwrap();
        // Two notes use "work", one uses "personal" (ad-hoc).
        write_note(&root.join("Captures").join("a.md"), &["work"]);
        write_note(&root.join("Captures").join("b.md"), &["work", "personal"]);

        let tags = list_tags(&root).unwrap();
        let work = tags.iter().find(|t| t.label == "work").unwrap();
        assert_eq!(work.count, 2);
        assert_eq!(work.color.as_deref(), Some("#fac775"));
        assert!(work.declared);

        let personal = tags.iter().find(|t| t.label == "personal").unwrap();
        assert_eq!(personal.count, 1);
        assert!(personal.color.is_none());
        assert!(!personal.declared);

        // Sort: "work" (2 uses) before "personal" (1 use).
        let first = &tags[0];
        assert_eq!(first.label, "work");
    }

    #[test]
    fn list_tags_surfaces_declared_tag_with_zero_usage() {
        let (_tmp, root) = setup_vault();
        set_tag_color(&root, "urgent", Some("#ff0000")).unwrap();
        let tags = list_tags(&root).unwrap();
        let urgent = tags.iter().find(|t| t.label == "urgent").unwrap();
        assert_eq!(urgent.count, 0);
        assert!(urgent.declared);
    }

    #[test]
    fn list_tags_skips_cairn_internal_files() {
        let (_tmp, root) = setup_vault();
        // Write a stray tagged note inside .cairn/ — must NOT be counted.
        write_note(&root.join(".cairn").join("stray.md"), &["skip-me"]);
        let tags = list_tags(&root).unwrap();
        assert!(tags.iter().all(|t| t.label != "skip-me"));
    }

    #[test]
    fn rename_tag_rewrites_frontmatter_across_vault() {
        let (_tmp, root) = setup_vault();
        write_note(&root.join("Captures").join("a.md"), &["draft"]);
        write_note(&root.join("Captures").join("b.md"), &["draft", "blog"]);
        write_note(&root.join("Captures").join("c.md"), &["blog"]);

        let rewritten = rename_tag(&root, "draft", "wip").unwrap();
        assert_eq!(rewritten, 2);

        let tags = list_tags(&root).unwrap();
        assert!(tags.iter().all(|t| t.label != "draft"));
        let wip = tags.iter().find(|t| t.label == "wip").unwrap();
        assert_eq!(wip.count, 2);
    }

    #[test]
    fn rename_tag_merges_into_existing_deduplicating() {
        let (_tmp, root) = setup_vault();
        // A note with both tags — after "old" → "new", should have only "new".
        write_note(&root.join("Captures").join("a.md"), &["old", "new"]);
        write_note(&root.join("Captures").join("b.md"), &["old"]);

        rename_tag(&root, "old", "new").unwrap();

        let a = fs::read_to_string(root.join("Captures").join("a.md")).unwrap();
        // Expect `new` once, no `old`.
        assert!(a.contains("- new"));
        assert!(!a.contains("- old"));
        // Deduplication: only one "new" entry.
        assert_eq!(a.matches("- new").count(), 1);
    }

    #[test]
    fn rename_tag_also_updates_config_colors() {
        let (_tmp, root) = setup_vault();
        set_tag_color(&root, "old", Some("#111111")).unwrap();
        rename_tag(&root, "old", "new").unwrap();

        let config = vault::load_config(&root).unwrap();
        let new_tag = config.tags.iter().find(|t| t.label == "new").unwrap();
        assert_eq!(new_tag.color.as_deref(), Some("#111111"));
        assert!(config.tags.iter().all(|t| t.label != "old"));
    }

    #[test]
    fn rename_tag_merges_when_target_already_declared() {
        let (_tmp, root) = setup_vault();
        // Both declared with different colors; rename should keep `new`'s color.
        set_tag_color(&root, "old", Some("#111111")).unwrap();
        set_tag_color(&root, "new", Some("#222222")).unwrap();
        rename_tag(&root, "old", "new").unwrap();

        let config = vault::load_config(&root).unwrap();
        let tags: Vec<_> = config.tags.iter().filter(|t| t.label == "new").collect();
        assert_eq!(tags.len(), 1);
        assert_eq!(tags[0].color.as_deref(), Some("#222222"));
    }

    #[test]
    fn rename_tag_rejects_empty_new_label() {
        let (_tmp, root) = setup_vault();
        let err = rename_tag(&root, "old", "   ").unwrap_err();
        assert!(matches!(err, AppError::Io(_)));
    }

    #[test]
    fn rename_tag_noop_when_old_equals_new() {
        let (_tmp, root) = setup_vault();
        write_note(&root.join("Captures").join("a.md"), &["x"]);
        assert_eq!(rename_tag(&root, "x", "x").unwrap(), 0);
    }

    #[test]
    fn delete_tag_strips_from_all_notes_and_config() {
        let (_tmp, root) = setup_vault();
        set_tag_color(&root, "gone", Some("#000")).unwrap();
        write_note(&root.join("Captures").join("a.md"), &["gone", "keep"]);
        write_note(&root.join("Captures").join("b.md"), &["gone"]);

        let rewritten = delete_tag(&root, "gone").unwrap();
        assert_eq!(rewritten, 2);

        let tags = list_tags(&root).unwrap();
        assert!(tags.iter().all(|t| t.label != "gone"));
        let keep = tags.iter().find(|t| t.label == "keep").unwrap();
        assert_eq!(keep.count, 1);

        let config = vault::load_config(&root).unwrap();
        assert!(config.tags.iter().all(|t| t.label != "gone"));
    }

    #[test]
    fn set_tag_color_inserts_then_updates() {
        let (_tmp, root) = setup_vault();
        set_tag_color(&root, "urgent", Some("#111111")).unwrap();
        set_tag_color(&root, "urgent", Some("#222222")).unwrap();
        let config = vault::load_config(&root).unwrap();
        let t = config.tags.iter().find(|t| t.label == "urgent").unwrap();
        assert_eq!(t.color.as_deref(), Some("#222222"));
        assert_eq!(config.tags.iter().filter(|t| t.label == "urgent").count(), 1);
    }

    #[test]
    fn set_tag_color_none_clears() {
        let (_tmp, root) = setup_vault();
        set_tag_color(&root, "urgent", Some("#111")).unwrap();
        set_tag_color(&root, "urgent", None).unwrap();
        let config = vault::load_config(&root).unwrap();
        let t = config.tags.iter().find(|t| t.label == "urgent").unwrap();
        assert!(t.color.is_none());
    }

    #[test]
    fn set_tag_color_rejects_empty_label() {
        let (_tmp, root) = setup_vault();
        let err = set_tag_color(&root, "  ", None).unwrap_err();
        assert!(matches!(err, AppError::Io(_)));
    }

    #[test]
    fn rewrite_preserves_unknown_frontmatter_keys() {
        let (_tmp, root) = setup_vault();
        let path = root.join("Captures").join("a.md");
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(
            &path,
            "---\ntitle: T\ncustom_key: preserved\ntags:\n  - old\n---\n\nbody\n",
        )
        .unwrap();

        rename_tag(&root, "old", "new").unwrap();
        let raw = fs::read_to_string(&path).unwrap();
        assert!(raw.contains("custom_key: preserved"));
        assert!(raw.contains("- new"));
    }
}
