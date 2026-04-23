/**
 * CodeMirror theme that ties into Cairn's design tokens.
 * Colors are read via CSS custom properties so this stays in lockstep with
 * `tokens.css` — no hex values live in this file.
 */
import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";

const cairnTheme = EditorView.theme(
  {
    "&": {
      color: "hsl(var(--fg-primary))",
      backgroundColor: "transparent",
      fontSize: "15px",
      lineHeight: "1.7",
      fontFamily: "Inter, system-ui, sans-serif",
      height: "100%",
    },
    ".cm-scroller": {
      fontFamily: "inherit",
      overflow: "auto",
      padding: "0",
    },
    ".cm-content": {
      padding: "1.25rem 0",
      caretColor: "hsl(var(--accent))",
      // Max width is driven by a CSS custom property so toggling the
      // "Full-width editor" preference re-flows the editor without rebuilding
      // the CodeMirror theme (and losing undo history).
      maxWidth: "var(--editor-max-width)",
      margin: "0 auto",
    },
    ".cm-line": {
      padding: "0 1.5rem",
    },
    ".cm-cursor, .cm-dropCursor": {
      borderLeftColor: "hsl(var(--accent))",
      borderLeftWidth: "2px",
    },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
      backgroundColor: "hsl(var(--accent) / 0.2)",
    },
    ".cm-activeLine": {
      backgroundColor: "transparent",
    },
    ".cm-gutters": {
      display: "none",
    },
    // Heading scale — matches DESIGN.md typographic rules.
    ".cm-heading": {
      fontWeight: "600",
      color: "hsl(var(--fg-primary))",
      letterSpacing: "-0.01em",
    },
    ".cm-heading-1": { fontSize: "1.75rem", lineHeight: "1.25", marginTop: "0.5rem" },
    ".cm-heading-2": { fontSize: "1.35rem", lineHeight: "1.3", marginTop: "0.5rem" },
    ".cm-heading-3": { fontSize: "1.15rem", lineHeight: "1.35" },
    ".cm-heading-4": { fontSize: "1rem", fontWeight: "600" },
    ".cm-heading-5": { fontSize: "0.95rem", fontWeight: "600" },
    ".cm-heading-6": {
      fontSize: "0.85rem",
      fontWeight: "600",
      textTransform: "uppercase",
      letterSpacing: "0.03em",
      color: "hsl(var(--fg-secondary))",
    },
    ".cm-rendered-bold": { fontWeight: "600", color: "hsl(var(--fg-primary))" },
    ".cm-rendered-italic": { fontStyle: "italic" },
    ".cm-rendered-code": {
      fontFamily: "'JetBrains Mono', ui-monospace, monospace",
      fontSize: "0.85em",
      backgroundColor: "hsl(var(--bg-elevated))",
      padding: "0.1em 0.35em",
      borderRadius: "3px",
      color: "hsl(var(--fg-primary))",
    },
    // Fenced and indented code blocks. Each line in the block is tagged
    // with `.cm-rendered-code-block`; the first and last lines also carry
    // a `-first` / `-last` class so the theme can draw rounded top/bottom
    // corners without needing a wrapping element (CM6 renders each line
    // as its own block). Padding and margins are narrower than the
    // default `.cm-line` rule so the block sits visually inset inside the
    // surrounding text column — in full-width mode this keeps the code
    // from reaching the window edges.
    ".cm-rendered-code-block": {
      fontFamily: "'JetBrains Mono', ui-monospace, monospace",
      fontSize: "0.9em",
      backgroundColor: "hsl(var(--bg-elevated))",
      color: "hsl(var(--fg-primary))",
      paddingLeft: "1rem",
      paddingRight: "1rem",
      marginLeft: "1rem",
      marginRight: "1rem",
      borderLeft: "1px solid hsl(var(--border-subtle))",
      borderRight: "1px solid hsl(var(--border-subtle))",
    },
    ".cm-rendered-code-block-first": {
      borderTop: "1px solid hsl(var(--border-subtle))",
      borderTopLeftRadius: "6px",
      borderTopRightRadius: "6px",
      paddingTop: "0.25rem",
      marginTop: "0.25rem",
    },
    ".cm-rendered-code-block-last": {
      borderBottom: "1px solid hsl(var(--border-subtle))",
      borderBottomLeftRadius: "6px",
      borderBottomRightRadius: "6px",
      paddingBottom: "0.25rem",
      marginBottom: "0.25rem",
    },
    // Thematic break (`---`, `***`, `___`). The content is hidden off-cursor;
    // a pseudo-element draws the rule so the line stays visible.
    ".cm-rendered-hr": {
      position: "relative",
    },
    ".cm-rendered-hr::after": {
      content: '""',
      position: "absolute",
      left: "1.5rem",
      right: "1.5rem",
      top: "50%",
      borderTop: "1px solid hsl(var(--border-subtle))",
    },
    // Blockquote — left border + muted italic text. The `>` marker is
    // hidden off-cursor so the content sits flush against the border.
    ".cm-rendered-blockquote": {
      borderLeft: "3px solid hsl(var(--border-strong))",
      paddingLeft: "calc(1.5rem - 3px)",
      color: "hsl(var(--fg-secondary))",
      fontStyle: "italic",
    },
    // List items — no padding yet at the line level; markers are styled
    // below. Indent for nested lists comes from the leading whitespace in
    // the source, which CM renders as-is.
    ".cm-rendered-list-marker": {
      color: "hsl(var(--accent))",
      fontWeight: "500",
    },
    // Off-cursor bullet widget for unordered lists. The source text still
    // contains `-` / `*` / `+` (round-trips to disk unchanged); this
    // decoration visually swaps the character for a real bullet.
    ".cm-rendered-list-bullet": {
      color: "hsl(var(--accent))",
      fontWeight: "500",
    },
    // Inline link — accent-coloured text, subtle underline. Off-cursor the
    // brackets and URL are hidden so only this styled text is visible.
    ".cm-rendered-link": {
      color: "hsl(var(--accent))",
      textDecoration: "underline",
      textDecorationColor: "hsl(var(--accent) / 0.45)",
      textUnderlineOffset: "2px",
      cursor: "pointer",
    },
    // Strikethrough (`~~x~~`). Markers themselves are hidden off-cursor by
    // the shared inline-mark logic; this rule decorates the text span.
    ".cm-rendered-strikethrough": {
      textDecoration: "line-through",
      textDecorationColor: "hsl(var(--fg-muted))",
      color: "hsl(var(--fg-muted))",
    },
    // GFM task-list checkbox widget. Aligns baseline with surrounding text
    // and uses the accent colour when checked.
    ".cm-rendered-task-checkbox": {
      display: "inline-flex",
      alignItems: "center",
      verticalAlign: "baseline",
      marginRight: "0.25em",
    },
    ".cm-rendered-task-checkbox input[type='checkbox']": {
      appearance: "none",
      width: "1em",
      height: "1em",
      borderRadius: "3px",
      border: "1.5px solid hsl(var(--border-strong))",
      backgroundColor: "transparent",
      cursor: "pointer",
      margin: "0",
      position: "relative",
      top: "0.1em",
    },
    ".cm-rendered-task-checkbox input[type='checkbox']:checked": {
      borderColor: "hsl(var(--accent))",
      backgroundColor: "hsl(var(--accent))",
    },
    ".cm-rendered-task-checkbox input[type='checkbox']:checked::after": {
      content: '""',
      position: "absolute",
      left: "0.22em",
      top: "0.02em",
      width: "0.3em",
      height: "0.55em",
      border: "solid hsl(var(--fg-on-accent))",
      borderWidth: "0 0.15em 0.15em 0",
      transform: "rotate(45deg)",
    },
    // GFM table rendered as an HTML `<table>` widget off-cursor. Cursor
    // inside the table shows raw markdown for editing. Horizontal margin
    // mirrors the inset of code blocks so tables don't touch the editor
    // column edge.
    ".cm-rendered-table-widget": {
      display: "block",
      marginLeft: "1.5rem",
      marginRight: "1.5rem",
      marginTop: "0.5em",
      marginBottom: "0.5em",
      maxWidth: "calc(100% - 3rem)",
      borderCollapse: "collapse",
      fontSize: "0.95em",
      overflow: "auto",
    },
    ".cm-rendered-table-widget th, .cm-rendered-table-widget td": {
      border: "1px solid hsl(var(--border-subtle))",
      padding: "0.4em 0.75em",
      textAlign: "left",
      verticalAlign: "top",
    },
    ".cm-rendered-table-widget th": {
      backgroundColor: "hsl(var(--bg-elevated))",
      fontWeight: "600",
      color: "hsl(var(--fg-primary))",
    },
    ".cm-rendered-table-widget td": {
      color: "hsl(var(--fg-primary))",
    },
    ".cm-rendered-table-widget tr:nth-child(even) td": {
      backgroundColor: "hsl(var(--bg-surface))",
    },
    // Rendered image widget. The actual `<img>` loads via the asset
    // protocol for local paths; on load failure the widget swaps in a
    // textual fallback and picks up `.cm-rendered-image-error`.
    ".cm-rendered-image": {
      display: "inline-block",
      verticalAlign: "middle",
      maxWidth: "100%",
    },
    ".cm-rendered-image img": {
      display: "block",
      maxWidth: "100%",
      maxHeight: "420px",
      height: "auto",
      borderRadius: "4px",
      backgroundColor: "hsl(var(--bg-elevated))",
    },
    ".cm-rendered-image-error": {
      display: "inline-flex",
      alignItems: "center",
      gap: "0.35em",
      padding: "0.1em 0.5em",
      borderRadius: "4px",
      backgroundColor: "hsl(var(--bg-elevated))",
      border: "1px solid hsl(var(--border-subtle))",
      fontSize: "0.9em",
      color: "hsl(var(--fg-muted))",
    },
  },
  { dark: true },
);

// Lezer-based syntax highlighting for markdown tokens that CodeMirror already
// classifies (e.g. link URLs, code fences). Kept distinct from `livePreview`
// which is about structural rendering; this is just color.
const cairnHighlight = HighlightStyle.define(
  [
    { tag: t.link, color: "hsl(var(--accent))", textDecoration: "underline" },
    { tag: t.url, color: "hsl(var(--accent))" },
    { tag: t.monospace, color: "hsl(var(--fg-primary))" },
    { tag: t.strong, fontWeight: "600" },
    { tag: t.emphasis, fontStyle: "italic" },
    { tag: t.quote, color: "hsl(var(--fg-secondary))", fontStyle: "italic" },
    { tag: t.strikethrough, textDecoration: "line-through" },
  ],
  { themeType: "dark" },
);

export const cairnEditorTheme = [cairnTheme, syntaxHighlighting(cairnHighlight)];
