/**
 * GFM table rendering.
 *
 * Tables span multiple lines, so their replacement must be a *block*
 * decoration — and CodeMirror only accepts block decorations from a
 * `StateField`, not from a `ViewPlugin`. This module therefore owns its
 * own state field + decorations provider, separate from the main
 * live-preview `ViewPlugin`.
 *
 * When the cursor is outside the table span the whole `Table` node is
 * replaced by an HTML `<table>` widget. When the cursor is inside, the
 * builder emits nothing so the raw markdown shows for editing.
 *
 * Lezer emits, as children of `Table`:
 *   TableHeader       — the header line (contains TableCell children)
 *   TableDelimiter    — EITHER the separator line (length > 1) OR a
 *                       single `|` pipe inside a row (length 1)
 *   TableRow*         — each data row (contains TableCell children)
 *
 * See @lezer/markdown `src/extension.ts` for the grammar definitions.
 */
import {
  type EditorState,
  type Range,
  StateField,
} from "@codemirror/state";
import {
  type Decoration,
  type DecorationSet,
  Decoration as DecorationNS,
  EditorView,
} from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import { type SyntaxNode } from "@lezer/common";

import { tableWidget, type TableAlignment } from "./widgets";

function collectCells(rowNode: SyntaxNode, state: EditorState): string[] {
  const cells: string[] = [];
  for (let c = rowNode.firstChild; c; c = c.nextSibling) {
    if (c.name === "TableCell") {
      cells.push(state.doc.sliceString(c.from, c.to));
    }
  }
  return cells;
}

/**
 * Parse the separator line text into per-column alignment hints:
 * `:---` → left, `---:` → right, `:---:` → center, `---` → default (null).
 */
function parseAlignments(sepLine: string): TableAlignment[] {
  const trimmed = sepLine.replace(/^\s*\|?\s*/, "").replace(/\s*\|?\s*$/, "");
  return trimmed.split("|").map((segment) => {
    const s = segment.trim();
    const left = s.startsWith(":");
    const right = s.endsWith(":");
    if (left && right) return "center";
    if (right) return "right";
    if (left) return "left";
    return null;
  });
}

function buildTableDecorations(state: EditorState): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  const { head } = state.selection.main;

  syntaxTree(state).iterate({
    enter: (node) => {
      if (node.name !== "Table") return;
      // Cursor inside → emit nothing, show raw markdown.
      if (head >= node.from && head <= node.to) return false;

      let header: string[] = [];
      const rows: string[][] = [];
      let alignments: TableAlignment[] = [];

      for (let c = node.node.firstChild; c; c = c.nextSibling) {
        if (c.name === "TableHeader") {
          header = collectCells(c, state);
        } else if (c.name === "TableDelimiter" && c.to - c.from > 1) {
          alignments = parseAlignments(state.doc.sliceString(c.from, c.to));
        } else if (c.name === "TableRow") {
          rows.push(collectCells(c, state));
        }
      }

      ranges.push(
        tableWidget({ header, rows, alignments }).range(node.from, node.to),
      );
      // Don't descend — the widget replaces every child line.
      return false;
    },
  });

  return DecorationNS.set(ranges, true);
}

/**
 * StateField exposing block-level table widget decorations. Consumers drop
 * this extension into their editor setup; the field recomputes on
 * document or selection change.
 */
export const tableRendering = StateField.define<DecorationSet>({
  create: (state) => buildTableDecorations(state),
  update: (value, tr) => {
    if (tr.docChanged || tr.selection) {
      return buildTableDecorations(tr.state);
    }
    return value;
  },
  provide: (f) => EditorView.decorations.from(f),
});
