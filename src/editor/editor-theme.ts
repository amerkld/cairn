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
