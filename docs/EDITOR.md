# Cairn Editor

Canonical reference for the note editor. Anything touching `src/editor/` — new markdown features, new live-preview constructs, visual tweaks, keyboard bindings — starts here.

## What it is

A CodeMirror 6 wrapper at `src/editor/Editor.tsx`. The markdown language is `@codemirror/lang-markdown` configured with `base: markdownLanguage`, which ships with the GFM extensions loaded (tables, strikethrough, task lists, autolinks). A custom `ViewPlugin` — the *live-preview* system in `src/editor/live-preview/` — decorates the parsed syntax tree so the text renders formatted while the underlying document stays plain markdown.

Guiding rule: **the filesystem is canonical**. Nothing the editor does may produce state that isn't round-tripped to the `.md` file. A rendered checkbox is backed by literal `[ ]` / `[x]` in the source.

## Live-preview philosophy

For every syntax marker (`#`, `**`, `~~`, `>`, `[`, `]`, `|`, …) there are two states:

1. **Off-cursor**: the marker is hidden or styled, and the surrounding text renders as it would in a published view.
2. **On-cursor**: the marker is shown raw, because the user is editing that line or inline construct.

"On-cursor" means different things for different constructs:

- Line-level constructs (headings, blockquotes, thematic breaks, task lines, table rows) check the cursor's line number against the construct's line.
- Inline constructs (bold, italic, inline code, strikethrough, links) check whether the cursor is inside the surrounding node's character range.

Two deliberate exceptions to the hide-off-cursor pattern:

- **List bullets and ordered-list numbers** stay visible always. Hiding them breaks outline scannability and makes ordered lists look like paragraphs.
- **Table pipes** stay visible as subtle dividers so cells remain editable. Tier 3 would replace the whole table with an HTML grid widget.

## Supported markdown features

| Construct | Off-cursor | On-cursor |
|---|---|---|
| ATX heading `# … ######` | Heading size + weight line class; `#+` prefix hidden | Prefix visible |
| Bold `**…**` | `font-weight: 600`; asterisks hidden | Asterisks visible |
| Italic `*…*` / `_…_` | Italic; delimiters hidden | Delimiters visible |
| Inline code `` `…` `` | Monospace + `bg-elevated`; backticks hidden | Backticks visible |
| Fenced / indented code block | Each line styled as a continuous block; fence markers hidden | Fence markers on the cursor's fence line are visible |
| Thematic break `---` | `::after` pseudo-element draws the rule; dashes hidden | Dashes visible |
| Blockquote `> x` | Left border + muted italic line; `>` hidden | `>` visible (nested `>>` supported) |
| Unordered list `- x` | Bullet styled in accent, visible always | Same |
| Ordered list `1. x` | Number styled in accent, visible always | Same |
| Link `[text](url)` | Brackets + URL hidden, link text styled | Full `[text](url)` visible |
| Image `![alt](url)` | Replaced by an inline `<img>` (loaded via Tauri's asset protocol for local paths, or the URL directly for http / data) | Full `![alt](url)` visible |
| Strikethrough `~~x~~` | `line-through`; `~~` hidden | `~~` visible |
| Autolink (bare URL, `www.`, email) | URL styled as a link | Same |
| Task list `- [ ] x` | `- [ ]` replaced by a real clickable checkbox. No other styling change on the task text — checked items read the same as unchecked | Raw `- [ ]` / `- [x]` visible |
| GFM table | Whole table replaced by an HTML `<table>` widget rendering header, rows, and per-column alignment | Raw markdown visible for editing |

## Not yet supported

These are deliberately out of scope in the current tier:

- **Inline formatting inside table cells** — cell text is rendered with simple inline-marker stripping (`**bold**` → `bold`). Full rendering (actual bold / italic / code spans inside cells) would require a second inline walker per cell. Fine for most notes; revisit if needed.
- **Footnotes** — Lezer's markdown grammar doesn't parse them as GFM; no decorations today.
- **Callouts / admonitions** — Obsidian / GitHub callouts (`> [!NOTE]`) are not recognised.

## Architecture

```
src/editor/
  Editor.tsx                    ← React wrapper, CM6 EditorView lifecycle, paste-to-asset, notePath → facet
  FrontmatterBar.tsx            ← YAML frontmatter UI (separate surface above the editor body)
  editor-theme.ts               ← CodeMirror theme + HighlightStyle; no hex colors, only tokens
  live-preview/
    index.ts                    ← ViewPlugin + tableRendering field + click handler, exported as `livePreview`
    walker.ts                   ← pure `buildDecorations(state, visibleRanges)` + Lezer dispatch
    block.ts                    ← headings, blockquotes, lists, code blocks, thematic breaks, task markers
    inline.ts                   ← bold, italic, inline code, strikethrough, links, images, URLs
    tables.ts                   ← `tableRendering` StateField — whole-table HTML widget replacement
    widgets.ts                  ← WidgetType subclasses (image, task checkbox, table)
    decorations.ts              ← prebuilt Decoration instances
    types.ts                    ← shared BuildContext + LivePreviewDecorations
    facets.ts                   ← `noteDirectory` facet + compartment (for image path resolution)
    events.ts                   ← cmd/ctrl-click link handler (opens via @tauri-apps/plugin-opener)
    summarize.ts                ← test helper: DecorationSet → flat summary list
```

### Walker + visitors

`buildDecorations(state, visibleRanges)` is a pure function. It:

1. Creates a `BuildContext` with the editor state, cursor position, and mutable `ranges` / `atomicRanges` arrays.
2. Walks the viewport's slice of the Lezer tree via `syntaxTree(state).iterate`.
3. Dispatches each node to a named visitor by `node.name`.
4. For `Link` and `Image`, skips descent when the cursor is inside (so inline children stay raw), otherwise descends so inline formatting inside link text still decorates.
5. Returns two `DecorationSet`s: `decorations` (everything rendered) and `atomic` (replace-decorations only, fed to `EditorView.atomicRanges` so cursor navigation skips hidden syntax).

Decorations are collected unsorted and handed to `Decoration.set(ranges, /* sort */ true)`. A hand-ordered `RangeSetBuilder` is fragile here — well-formed trees (a heading containing inline emphasis; nested emphasis) naturally produce additions that violate the builder's ordering rules. Collect-and-sort avoids that class of bugs. The builder is further wrapped in `safeBuild`'s `try/catch` so a parser edge case never clears the view; the previous decoration set is kept until the next successful update.

### Atomic vs. mark decorations

A replace (hide) decoration is atomic — arrow keys treat the hidden span as a single character. A mark decoration (bold, italic, link text) is not atomic; the cursor can still land inside the styled range for editing. Feeding both to `EditorView.atomicRanges` would trap the cursor outside every styled span, so the walker separates them: all replace decorations also go into `atomicRanges`, mark decorations do not.

Image widget and task-list checkbox are widget decorations emitted via `Decoration.replace({ widget })`. They're added to both `ranges` and `atomicRanges` — atomic because arrow keys should step past them as one unit.

### Block decorations (tables)

CodeMirror accepts *block* decorations (those that span multiple lines) only from `StateField`s, not from `ViewPlugin`s. Tables replace their whole node span with a widget, so they live in `tables.ts` as a dedicated `StateField` named `tableRendering`. The main walker skips descent for `Table` nodes so inline visitors don't generate orphan decorations inside the replaced range. `index.ts`'s `livePreview` composite extension bundles the plugin, the `tableRendering` field, and the click handler together.

### Image URL resolution (facet)

Local image paths need to be rewritten through Tauri's asset protocol before a webview `<img>` can load them. The image widget reads the current note's absolute directory from the `noteDirectory` facet (`facets.ts`) and joins relative paths against it via `convertFileSrc`. The facet is wrapped in a `Compartment` so `Editor.tsx` can reconfigure it without rebuilding the EditorState when the user navigates between notes. HTTP(S) / `data:` / `blob:` / `asset:` URLs pass through unchanged. On load failure the widget swaps in a textual fallback with the alt text.

Asset protocol is enabled in `src-tauri/tauri.conf.json` under `app.security.assetProtocol` with scope `["**"]` — Cairn vaults can live anywhere on disk, so a tighter static scope isn't workable.

### Grammar

`Editor.tsx` constructs the markdown extension as:

```ts
markdown({ base: markdownLanguage, addKeymap: true })
```

`markdownLanguage` from `@codemirror/lang-markdown` includes the GFM extensions — `Strikethrough`, `Table`, `TableHeader`, `TableRow`, `TableCell`, `TableDelimiter`, `Task`, `TaskMarker`, GFM `Autolink`. A `grammar.test.ts` locks in that assumption so a future grammar swap can't silently disable GFM parsing.

## Interactions

### Task-list toggle

The checkbox widget attaches a `mousedown` handler. On click it:

1. Calls `event.preventDefault()` + `stopPropagation()` so CodeMirror doesn't move the caret.
2. Resolves the widget's current document position via `view.posAtDOM(wrap)`.
3. Reads the 3-char span at that position and flips `[ ]` ↔ `[x]` via a transaction.

Position is re-resolved at click time rather than stored at mount time, so the toggle stays correct after any intervening edits.

### Link click

`events.ts` registers a `mousedown` `domEventHandler`. On cmd/ctrl+click (either modifier, for cross-platform) it walks from the clicked document position up through the Lezer tree until it finds a `Link`, `Image`, or `URL` node, extracts the URL string, and fires `openUrl` from `@tauri-apps/plugin-opener`. The open is fire-and-forget; failures are logged but don't block the click.

## Design tokens

The editor uses only existing tokens from `src/tokens.css`:

| Purpose | Token used |
|---|---|
| Body text | `--fg-primary` |
| Muted / strikethrough text | `--fg-muted` |
| Accent (links, list markers, checkbox checked) | `--accent` |
| Checkbox checkmark fill | `--fg-on-accent` |
| Blockquote border, code block border | `--border-strong` / `--border-subtle` |
| Code block + image badge surface | `--bg-elevated` |

No editor-specific color tokens exist yet; if the editor needs to diverge from the global palette (e.g. a dedicated blockquote tint), add semantic tokens to `tokens.css` + `tailwind.config.ts` first and point this table at them.

## Testing

Every live-preview visitor is covered by a pure-function test that drives `buildDecorations(state, visibleRanges)` directly against an `EditorState`, bypassing `EditorView` entirely (jsdom lacks the layout primitives a real view needs). The shared `summarize` helper at `src/editor/live-preview/summarize.ts` flattens a `DecorationSet` into an array of `{from, to, class, replace, line}` records so assertions stay readable.

Test layout:

```
src/editor/
  live-preview.test.ts                  ← original 31 tests (headings, bold/italic/code, HR, fences)
  live-preview/
    grammar.test.ts                     ← guard: GFM node names are present in the parsed tree
    block-extras.test.ts                ← blockquotes, lists
    inline-extras.test.ts               ← links, images
    gfm-inline.test.ts                  ← strikethrough, autolinks
    task-lists.test.ts                  ← task list decorations + click-toggle integration
    tables.test.ts                      ← tables (header, row, separator, pipes)
```

Interaction behaviour (task-list click, link click) gets integration tests that mount a real `EditorView` in jsdom and dispatch synthetic `MouseEvent`s — `posAtDOM` + `view.state.doc` assertions after the event are how we verify the source was actually mutated.

Target coverage for `src/editor/live-preview/**` is ≥ 80% lines and statements. This isn't in the hard CLAUDE.md gate (that lists specific backend modules + `src/lib/frontmatter.ts`), but the editor's correctness is visible to every user on every keystroke — treat a drop below that threshold as a regression.

## Adding a new construct

1. **Confirm Lezer emits the node.** Add a fixture line to `grammar.test.ts` if the node name is GFM-dependent or otherwise not obvious.
2. **Pick the right home**: a block-level node (line-based cursor rule) goes in `block.ts` or `tables.ts`; inline (range-based cursor rule) goes in `inline.ts`.
3. **Write a visitor** as a pure `(node: SyntaxNodeRef, ctx: BuildContext) => void`. Read `ctx.head` / `ctx.cursorLine` for cursor-on-line logic. Push into `ctx.ranges` for regular decorations, `ctx.pushHide(from, to)` for replace decorations that must also be atomic.
4. **Wire the visitor** into `walker.ts`'s `enter` dispatcher by node name. Return `false` from `enter` only if descent must be prevented (like `Link` cursor-inside).
5. **Declare decorations** in `decorations.ts` as module-level constants so the walk doesn't reallocate them on every keystroke.
6. **Add theme styles** in `editor-theme.ts`. Use existing tokens; don't hardcode colors.
7. **Add tests** in a new colocated `*.test.ts` under `src/editor/live-preview/`, following the `buildDecorations` + `summarize` pattern. Cover at minimum: the decoration applies off-cursor, and the construct round-trips (cursor on/off shows raw/rendered).
8. **Update this file** — add a row to the "Supported markdown features" matrix and, if architecture changed, update the relevant section.
