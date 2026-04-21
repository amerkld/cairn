//! Substring search across the vault's markdown notes.
//!
//! A conscious Phase 1 choice: scan every file on every query. No index,
//! no fuzzy ranking. A 10k-note vault scans in a few hundred milliseconds
//! on a warm page cache, which is fine for a command-palette use case.
//! When vaults outgrow that, the next step is an in-memory Aho-Corasick
//! or a persistent index — neither is needed yet.
//!
//! Ranking:
//!   1. Title match beats body match
//!   2. Earlier match position beats later
//!   3. More distinct match lines break the remaining tie
//! Ties are broken by path to keep ordering deterministic.
//!
//! Skips `.cairn/` always — internal files should never show in search.
//! The trash mirror at `.cairn/trash/` is likewise invisible to search;
//! a dedicated "Search trash" feature can wire up later if desired.

use crate::error::AppResult;
use crate::md;
use crate::vault::CAIRN_DIR;
use serde::{Deserialize, Serialize};
use std::cmp::Ordering;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

const DEFAULT_LIMIT: usize = 50;
const SNIPPET_RADIUS: usize = 60;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SearchHit {
    pub path: PathBuf,
    pub title: String,
    pub snippet: String,
    /// True when the match was in the title (or heading-derived title).
    #[serde(rename = "titleMatch")]
    pub title_match: bool,
}

/// Run a case-insensitive substring search. Empty or whitespace-only queries
/// return `[]` — the command palette calls this even without input and we
/// don't want "every file in the vault" as results.
pub fn search(
    vault_root: &Path,
    query: &str,
    limit: Option<usize>,
) -> AppResult<Vec<SearchHit>> {
    let needle = query.trim().to_lowercase();
    if needle.is_empty() {
        return Ok(Vec::new());
    }
    let limit = limit.unwrap_or(DEFAULT_LIMIT).max(1);
    let cairn = vault_root.join(CAIRN_DIR);

    let mut ranked: Vec<(Ranking, SearchHit)> = Vec::new();

    for entry in WalkDir::new(vault_root)
        .into_iter()
        .filter_entry(|e| e.path() != cairn)
        .filter_map(|e| e.ok())
    {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        if path.extension().and_then(|e| e.to_str()) != Some("md") {
            continue;
        }
        let Ok(raw) = std::fs::read_to_string(path) else {
            continue;
        };
        let Ok(parsed) = md::parse(&raw) else {
            continue;
        };
        let stem = path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("Untitled")
            .to_string();
        let title = md::derive_title(&parsed, &stem);

        if let Some((hit, rank)) = score_note(&title, &parsed.body, &needle, path) {
            ranked.push((rank, hit));
        }
    }

    ranked.sort_by(|a, b| a.0.cmp(&b.0));
    Ok(ranked.into_iter().take(limit).map(|(_, h)| h).collect())
}

#[derive(Debug, PartialEq, Eq)]
struct Ranking {
    /// 0 = title match, 1 = body match. Lower is better.
    class: u8,
    /// Earliest byte offset of a match. Lower is better.
    earliest_offset: usize,
    /// Negative line-match count so higher-density matches sort first.
    /// Stored as i32 for easy subtraction.
    match_lines_neg: i32,
    /// Tie-breaker for determinism.
    path: PathBuf,
}

impl Ord for Ranking {
    fn cmp(&self, other: &Self) -> Ordering {
        self.class
            .cmp(&other.class)
            .then_with(|| self.earliest_offset.cmp(&other.earliest_offset))
            .then_with(|| self.match_lines_neg.cmp(&other.match_lines_neg))
            .then_with(|| self.path.cmp(&other.path))
    }
}

impl PartialOrd for Ranking {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

fn score_note(
    title: &str,
    body: &str,
    needle: &str,
    path: &Path,
) -> Option<(SearchHit, Ranking)> {
    let title_lower = title.to_lowercase();
    let body_lower = body.to_lowercase();

    let title_idx = title_lower.find(needle);
    let body_idx = body_lower.find(needle);

    let (class, earliest_offset, is_title_match) = match (title_idx, body_idx) {
        (Some(t), _) => (0u8, t, true),
        (None, Some(b)) => (1u8, b, false),
        (None, None) => return None,
    };

    let match_lines = count_match_lines(&body_lower, needle) as i32
        + if is_title_match { 1 } else { 0 };
    let snippet = if is_title_match {
        title.to_string()
    } else {
        build_snippet(body, body_idx.unwrap_or(0), needle.len())
    };

    let hit = SearchHit {
        path: path.to_path_buf(),
        title: title.to_string(),
        snippet,
        title_match: is_title_match,
    };
    let rank = Ranking {
        class,
        earliest_offset,
        match_lines_neg: -match_lines,
        path: path.to_path_buf(),
    };
    Some((hit, rank))
}

fn count_match_lines(body_lower: &str, needle: &str) -> usize {
    body_lower
        .lines()
        .filter(|line| line.contains(needle))
        .count()
}

fn build_snippet(body: &str, byte_offset: usize, needle_len: usize) -> String {
    // Widen around the match to show context. Work in char indices so we
    // don't slice inside a multi-byte UTF-8 sequence.
    let chars: Vec<(usize, char)> = body.char_indices().collect();
    let char_pos = chars
        .iter()
        .position(|(i, _)| *i >= byte_offset)
        .unwrap_or(0);

    let start = char_pos.saturating_sub(SNIPPET_RADIUS);
    let end = (char_pos + needle_len + SNIPPET_RADIUS).min(chars.len());
    if chars.is_empty() {
        return String::new();
    }
    let mut out = String::new();
    if start > 0 {
        out.push('…');
    }
    for (_, ch) in &chars[start..end] {
        // Newlines look noisy in a single-line snippet.
        if *ch == '\n' {
            out.push(' ');
        } else {
            out.push(*ch);
        }
    }
    if end < chars.len() {
        out.push('…');
    }
    out.trim().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::vault;
    use std::fs;
    use tempfile::TempDir;

    fn setup_vault() -> (TempDir, PathBuf) {
        let dir = TempDir::new().unwrap();
        let root = dir.path().to_path_buf();
        vault::open(&root).unwrap();
        (dir, root)
    }

    fn write_note(path: &Path, front: &str, body: &str) {
        let content = if front.is_empty() {
            body.to_string()
        } else {
            format!("---\n{front}---\n\n{body}")
        };
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).unwrap();
        }
        fs::write(path, content).unwrap();
    }

    #[test]
    fn empty_query_returns_no_hits() {
        let (_tmp, root) = setup_vault();
        write_note(&root.join("Captures/a.md"), "title: Hello\n", "world");
        assert!(search(&root, "", None).unwrap().is_empty());
        assert!(search(&root, "   ", None).unwrap().is_empty());
    }

    #[test]
    fn search_matches_titles_and_bodies_case_insensitively() {
        let (_tmp, root) = setup_vault();
        write_note(&root.join("Captures/a.md"), "title: Apples\n", "fresh fruit");
        write_note(&root.join("Captures/b.md"), "title: Other\n", "apples are tasty");

        let hits = search(&root, "APPLES", None).unwrap();
        assert_eq!(hits.len(), 2);
        // Title hit sorts first.
        assert_eq!(hits[0].title, "Apples");
        assert!(hits[0].title_match);
        assert!(!hits[1].title_match);
    }

    #[test]
    fn search_skips_cairn_internal_files() {
        let (_tmp, root) = setup_vault();
        write_note(&root.join(".cairn/stray.md"), "", "secret word marker123");
        write_note(&root.join("Captures/a.md"), "", "nothing here");

        let hits = search(&root, "marker123", None).unwrap();
        assert!(hits.is_empty());
    }

    #[test]
    fn search_ranks_title_matches_before_body_matches() {
        let (_tmp, root) = setup_vault();
        // Body match, created first
        write_note(&root.join("Captures/b.md"), "title: Plain\n", "a buried kiwi");
        // Title match, created second
        write_note(&root.join("Captures/a.md"), "title: Kiwi facts\n", "x");

        let hits = search(&root, "kiwi", None).unwrap();
        assert_eq!(hits[0].title, "Kiwi facts");
    }

    #[test]
    fn snippet_wraps_match_with_ellipses_when_body_is_long() {
        let (_tmp, root) = setup_vault();
        let filler = "x ".repeat(200);
        let body = format!("{filler}the-rare-needle{filler}");
        write_note(&root.join("Captures/a.md"), "title: T\n", &body);

        let hits = search(&root, "the-rare-needle", None).unwrap();
        assert_eq!(hits.len(), 1);
        assert!(hits[0].snippet.starts_with('…'));
        assert!(hits[0].snippet.ends_with('…'));
        assert!(hits[0].snippet.contains("the-rare-needle"));
    }

    #[test]
    fn snippet_handles_utf8_cleanly() {
        let (_tmp, root) = setup_vault();
        // Mix multi-byte chars with the match, then verify we don't panic.
        let body = "héllo — the needle — café";
        write_note(&root.join("Captures/a.md"), "title: T\n", body);
        let hits = search(&root, "needle", None).unwrap();
        assert_eq!(hits.len(), 1);
        assert!(hits[0].snippet.contains("needle"));
    }

    #[test]
    fn limit_caps_result_count() {
        let (_tmp, root) = setup_vault();
        for i in 0..10 {
            write_note(
                &root.join(format!("Captures/n{i}.md")),
                &format!("title: topic-{i}\n"),
                "x",
            );
        }
        let hits = search(&root, "topic", Some(3)).unwrap();
        assert_eq!(hits.len(), 3);
    }
}
