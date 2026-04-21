//! YAML frontmatter parse + serialize for markdown notes.
//!
//! A note is stored as a single `.md` file. If it begins with a `---` line,
//! the content up to the next `---` line is treated as YAML frontmatter;
//! everything after (stripping at most one leading blank line) is the body.
//!
//! Round-trip fidelity is a hard requirement: **unknown YAML keys must be
//! preserved verbatim on write**. Users can and will hand-edit frontmatter
//! to add keys Cairn doesn't know about, and dropping them would silently
//! destroy their data. We achieve this by flattening unknown keys into a
//! `BTreeMap<String, serde_yaml::Value>` on the frontmatter struct.
//!
//! Known-key order is not preserved (structural YAML re-emission always
//! normalizes order); that is an accepted trade-off for the safety of the
//! typed interface.

use crate::error::{AppError, AppResult};
use chrono::{DateTime, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

/// Structured frontmatter. Known keys are typed; everything else flows into
/// `extra` and is preserved on write.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
pub struct Frontmatter {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,

    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,

    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub tags: Vec<String>,

    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub deadline: Option<NaiveDate>,

    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub remind_at: Option<DateTime<Utc>>,

    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub status: Option<Status>,

    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub order: Option<i64>,

    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub created_at: Option<DateTime<Utc>>,

    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub completed_at: Option<DateTime<Utc>>,

    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub complete_note: Option<String>,

    /// Unknown keys, preserved verbatim through round-trips.
    #[serde(flatten)]
    pub extra: BTreeMap<String, serde_yaml::Value>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Status {
    Open,
    Done,
}

/// A parsed note: frontmatter plus body (body may be empty).
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct ParsedNote {
    pub frontmatter: Frontmatter,
    pub body: String,
}

const DELIMITER: &str = "---";

/// Parse the raw contents of a `.md` file into frontmatter + body.
///
/// Accepts CRLF and LF line endings. Files without frontmatter yield a
/// `Default::default()` `Frontmatter` and the whole file as the body.
pub fn parse(raw: &str) -> AppResult<ParsedNote> {
    // Normalize CRLF → LF for parsing, but only conceptually. We use
    // line-based scanning so mixed endings work too.
    let stripped = raw.strip_prefix('\u{FEFF}').unwrap_or(raw);

    // Check if file starts with delimiter on its own line.
    let first_line_end = match stripped.find('\n') {
        Some(i) => i,
        None => {
            // No newlines at all — no frontmatter possible.
            return Ok(ParsedNote {
                frontmatter: Frontmatter::default(),
                body: stripped.to_string(),
            });
        }
    };
    let first_line = stripped[..first_line_end].trim_end_matches('\r');
    if first_line != DELIMITER {
        return Ok(ParsedNote {
            frontmatter: Frontmatter::default(),
            body: stripped.to_string(),
        });
    }

    // Find the closing delimiter line.
    let after_open = &stripped[first_line_end + 1..];
    let mut cursor = 0usize;
    let mut found: Option<(usize, usize)> = None; // (line_start, line_end)
    while cursor < after_open.len() {
        let line_end = after_open[cursor..]
            .find('\n')
            .map(|i| cursor + i)
            .unwrap_or(after_open.len());
        let line = after_open[cursor..line_end].trim_end_matches('\r');
        if line == DELIMITER {
            found = Some((cursor, line_end));
            break;
        }
        cursor = line_end + 1;
    }

    let Some((yaml_end, close_line_end)) = found else {
        // Unterminated frontmatter — treat as no frontmatter rather than err,
        // so a file with a literal "---" heading doesn't blow up.
        return Ok(ParsedNote {
            frontmatter: Frontmatter::default(),
            body: stripped.to_string(),
        });
    };

    let yaml = &after_open[..yaml_end];
    let frontmatter: Frontmatter = if yaml.trim().is_empty() {
        Frontmatter::default()
    } else {
        serde_yaml::from_str(yaml).map_err(|e| AppError::Serde(e.to_string()))?
    };

    // Body = everything after the close delimiter's line.
    let body_start = close_line_end.min(after_open.len());
    let mut body = &after_open[body_start..];
    if let Some(rest) = body.strip_prefix('\n') {
        body = rest;
    }
    // Trim at most one leading blank line (very common after frontmatter).
    if let Some(rest) = body.strip_prefix('\n') {
        body = rest;
    }

    Ok(ParsedNote {
        frontmatter,
        body: body.to_string(),
    })
}

/// Serialize a parsed note back to its on-disk form. Empty frontmatter
/// produces a body-only file (no `---` delimiters).
pub fn serialize(note: &ParsedNote) -> AppResult<String> {
    if is_empty_frontmatter(&note.frontmatter) {
        return Ok(note.body.clone());
    }
    let yaml =
        serde_yaml::to_string(&note.frontmatter).map_err(|e| AppError::Serde(e.to_string()))?;
    // serde_yaml adds a trailing newline; that's what we want between close
    // delimiter and body.
    let mut out = String::with_capacity(yaml.len() + note.body.len() + 8);
    out.push_str(DELIMITER);
    out.push('\n');
    out.push_str(&yaml);
    out.push_str(DELIMITER);
    out.push('\n');
    if !note.body.is_empty() {
        out.push('\n');
        out.push_str(&note.body);
    }
    Ok(out)
}

fn is_empty_frontmatter(fm: &Frontmatter) -> bool {
    fm == &Frontmatter::default()
}

/// Extract a short preview line for card display: returns up to `max_chars`
/// from the body, skipping blank lines and trimming markdown heading markers.
pub fn preview(body: &str, max_chars: usize) -> String {
    let mut first = body
        .lines()
        .map(|l| l.trim())
        .find(|l| !l.is_empty())
        .unwrap_or("")
        .to_string();
    // Drop up to 6 leading `#` + space (markdown heading).
    if first.starts_with('#') {
        let stripped = first.trim_start_matches('#').trim_start();
        first = stripped.to_string();
    }
    if first.chars().count() <= max_chars {
        first
    } else {
        let mut taken = String::new();
        for (i, ch) in first.chars().enumerate() {
            if i >= max_chars {
                break;
            }
            taken.push(ch);
        }
        taken.push('…');
        taken
    }
}

/// Derive a display title from a note. Preference order: frontmatter `title`,
/// first non-empty body line stripped of heading markers, then `fallback`.
pub fn derive_title(note: &ParsedNote, fallback: &str) -> String {
    if let Some(t) = note.frontmatter.title.as_ref() {
        let trimmed = t.trim();
        if !trimmed.is_empty() {
            return trimmed.to_string();
        }
    }
    let line = note
        .body
        .lines()
        .map(|l| l.trim())
        .find(|l| !l.is_empty())
        .unwrap_or("");
    if line.is_empty() {
        return fallback.to_string();
    }
    if line.starts_with('#') {
        let stripped = line.trim_start_matches('#').trim_start();
        if !stripped.is_empty() {
            return stripped.to_string();
        }
    }
    line.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_no_frontmatter_returns_whole_body() {
        let note = parse("just some body\nwith two lines\n").unwrap();
        assert_eq!(note.frontmatter, Frontmatter::default());
        assert_eq!(note.body, "just some body\nwith two lines\n");
    }

    #[test]
    fn parse_basic_frontmatter() {
        let raw = "---\ntitle: Hello\ntags:\n  - work\n  - urgent\n---\n\nBody here\n";
        let note = parse(raw).unwrap();
        assert_eq!(note.frontmatter.title.as_deref(), Some("Hello"));
        assert_eq!(note.frontmatter.tags, vec!["work", "urgent"]);
        assert_eq!(note.body, "Body here\n");
    }

    #[test]
    fn parse_handles_crlf_line_endings() {
        let raw = "---\r\ntitle: CRLF\r\n---\r\n\r\nBody\r\n";
        let note = parse(raw).unwrap();
        assert_eq!(note.frontmatter.title.as_deref(), Some("CRLF"));
        assert!(note.body.contains("Body"));
    }

    #[test]
    fn parse_preserves_unknown_frontmatter_keys() {
        let raw = "---\ntitle: Known\nweird_custom_key: 42\nnested:\n  a: 1\n  b: two\n---\n\nbody\n";
        let note = parse(raw).unwrap();
        assert_eq!(note.frontmatter.title.as_deref(), Some("Known"));
        assert!(note.frontmatter.extra.contains_key("weird_custom_key"));
        assert!(note.frontmatter.extra.contains_key("nested"));
    }

    #[test]
    fn round_trip_preserves_unknown_keys() {
        let raw = "---\ntitle: Keep\ncustom: value\nmap:\n  k1: 1\n  k2: 2\n---\n\nBody text\n";
        let note = parse(raw).unwrap();
        let serialized = serialize(&note).unwrap();
        let reparsed = parse(&serialized).unwrap();

        assert_eq!(reparsed.frontmatter.title, note.frontmatter.title);
        assert_eq!(reparsed.frontmatter.extra, note.frontmatter.extra);
        assert_eq!(reparsed.body, "Body text\n");
    }

    #[test]
    fn serialize_empty_frontmatter_is_body_only() {
        let note = ParsedNote {
            frontmatter: Frontmatter::default(),
            body: "just a body".to_string(),
        };
        assert_eq!(serialize(&note).unwrap(), "just a body");
    }

    #[test]
    fn unterminated_frontmatter_treated_as_body() {
        let raw = "---\nno closing delim\nstill no close\n";
        let note = parse(raw).unwrap();
        assert_eq!(note.frontmatter, Frontmatter::default());
        assert_eq!(note.body, raw);
    }

    #[test]
    fn parse_handles_bom_prefix() {
        let raw = "\u{FEFF}---\ntitle: BOM\n---\n\nHi";
        let note = parse(raw).unwrap();
        assert_eq!(note.frontmatter.title.as_deref(), Some("BOM"));
    }

    #[test]
    fn preview_truncates_long_lines_with_ellipsis() {
        let body = "A".repeat(200);
        let out = preview(&body, 50);
        let char_count = out.chars().count();
        assert_eq!(char_count, 51); // 50 chars + ellipsis
        assert!(out.ends_with('…'));
    }

    #[test]
    fn preview_strips_heading_markers() {
        let body = "# Important\nrest\n";
        assert_eq!(preview(body, 80), "Important");
    }

    #[test]
    fn preview_skips_blank_first_lines() {
        let body = "\n\n   \nActual content\n";
        assert_eq!(preview(body, 80), "Actual content");
    }

    #[test]
    fn derive_title_uses_frontmatter_first() {
        let note = ParsedNote {
            frontmatter: Frontmatter {
                title: Some("Top".into()),
                ..Default::default()
            },
            body: "# Body heading\nmore".into(),
        };
        assert_eq!(derive_title(&note, "fallback"), "Top");
    }

    #[test]
    fn derive_title_falls_back_to_body_heading() {
        let note = ParsedNote {
            frontmatter: Frontmatter::default(),
            body: "# Body heading\nmore".into(),
        };
        assert_eq!(derive_title(&note, "fallback"), "Body heading");
    }

    #[test]
    fn derive_title_uses_fallback_when_empty() {
        let note = ParsedNote {
            frontmatter: Frontmatter::default(),
            body: "".into(),
        };
        assert_eq!(derive_title(&note, "Untitled"), "Untitled");
    }

    #[test]
    fn status_round_trips() {
        let raw = "---\nstatus: done\n---\n";
        let note = parse(raw).unwrap();
        assert_eq!(note.frontmatter.status, Some(Status::Done));
        let back = serialize(&note).unwrap();
        assert!(back.contains("status: done"));
    }
}
