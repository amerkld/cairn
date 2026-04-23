---
title: "OSS idea: footnote support in @lezer/markdown"
tags: [oss, idea, codemirror]
created_at: "2026-04-18T11:00:00Z"
---

Noticed while poking at the editor: `@lezer/markdown` ships GFM but not footnotes. Could be a fun weekend PR — the parser pattern is already there for task lists and tables.

Scope if I do it:

1. Add a `Footnote` extension alongside `Strikethrough` / `Table`.
2. Parse `[^1]` references and `[^1]: …` definitions.
3. Tests against the CommonMark footnote test suite.
4. Docs update.

Not this month. Tagging to come back.
