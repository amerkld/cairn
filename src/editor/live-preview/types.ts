/**
 * Shared types for the live-preview decoration system.
 *
 * Visitors are pure functions over a Lezer `SyntaxNodeRef` plus a
 * `BuildContext` that carries the editor state, cursor metadata, and the
 * mutable decoration arrays the walker will hand to `Decoration.set`.
 */
import { type EditorState, type Range } from "@codemirror/state";
import { type Decoration, type DecorationSet } from "@codemirror/view";

/**
 * Result of a decoration build. `decorations` is everything rendered;
 * `atomic` is the subset that should cause cursor navigation to skip — only
 * the replace (hide) decorations. Feeding the full set to
 * `EditorView.atomicRanges` would make mark decorations atomic as well,
 * which (for example) prevents the cursor from ever landing inside a
 * styled inline-code range.
 */
export interface LivePreviewDecorations {
  decorations: DecorationSet;
  atomic: DecorationSet;
}

/**
 * Mutable state threaded through the Lezer tree walk. Each visitor reads
 * `state` / `head` / `cursorLine` for cursor-on-line logic and pushes into
 * `ranges` / `atomicRanges` to emit decorations. `pushHide` is the shared
 * helper for replace decorations that must also be atomic.
 */
export interface BuildContext {
  state: EditorState;
  head: number;
  cursorLine: number;
  ranges: Range<Decoration>[];
  atomicRanges: Range<Decoration>[];
  pushHide: (from: number, to: number) => void;
}
