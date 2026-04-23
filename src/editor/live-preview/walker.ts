/**
 * `buildDecorations` walks the Lezer tree inside the viewport and dispatches
 * each node to a visitor. The returned `decorations` set is what the view
 * renders; `atomic` is the subset (replace decorations only) that drives
 * `EditorView.atomicRanges` so cursor navigation skips hidden syntax.
 *
 * Decorations are collected unsorted and handed to `Decoration.set(ranges,
 * true)`. A hand-ordered `RangeSetBuilder` is fragile: well-formed trees
 * (a heading with inline emphasis, or nested emphasis) naturally produce
 * additions that violate the builder's ordering rules and throw mid-update,
 * leaving the view with stale decorations. Collect-and-sort avoids that;
 * the `safeBuild` try/catch in `./index.ts` is a second belt.
 */
import { type EditorState, type Range } from "@codemirror/state";
import { Decoration } from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";

import {
  visitATXHeading,
  visitBlockquote,
  visitCodeBlock,
  visitHeaderMark,
  visitHorizontalRule,
  visitListItem,
  visitListMark,
  visitQuoteMark,
  visitTaskMarker,
} from "./block";
import { hideMark } from "./decorations";
import {
  visitEmphasis,
  visitImage,
  visitInlineCode,
  visitInlineMark,
  visitLink,
  visitStrikethrough,
  visitStrongEmphasis,
  visitURL,
} from "./inline";
import { type BuildContext, type LivePreviewDecorations } from "./types";

/** Pure function over state + viewport, exposed for unit tests. */
export function buildDecorations(
  state: EditorState,
  visibleRanges: readonly { readonly from: number; readonly to: number }[],
): LivePreviewDecorations {
  const ranges: Range<Decoration>[] = [];
  const atomicRanges: Range<Decoration>[] = [];
  const { head } = state.selection.main;
  const cursorLine = state.doc.lineAt(head).number;

  const ctx: BuildContext = {
    state,
    head,
    cursorLine,
    ranges,
    atomicRanges,
    pushHide(from, to) {
      const r = hideMark.range(from, to);
      ranges.push(r);
      atomicRanges.push(r);
    },
  };

  for (const { from, to } of visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter: (node) => {
        const name = node.name;

        if (name.startsWith("ATXHeading")) {
          visitATXHeading(node, ctx);
          return;
        }
        if (name === "HeaderMark") {
          visitHeaderMark(node, ctx);
          return;
        }
        if (name === "HorizontalRule") {
          visitHorizontalRule(node, ctx);
          return;
        }
        if (name === "FencedCode" || name === "CodeBlock") {
          visitCodeBlock(node, ctx);
          return;
        }
        if (name === "Blockquote") {
          visitBlockquote(node, ctx);
          return;
        }
        if (name === "QuoteMark") {
          visitQuoteMark(node, ctx);
          return;
        }
        if (name === "ListItem") {
          visitListItem(node, ctx);
          return;
        }
        if (name === "ListMark") {
          visitListMark(node, ctx);
          return;
        }
        if (name === "TaskMarker") {
          visitTaskMarker(node, ctx);
          return;
        }
        if (name === "Table") {
          // Tables are rendered by the `tableRendering` StateField (block
          // decorations aren't allowed from a ViewPlugin). Skip descent
          // so inline visitors don't decorate cell content that the
          // block widget will replace anyway.
          return false;
        }
        if (name === "Link") {
          // Cursor inside the link: skip descent so the raw `[text](url)`
          // source stays visible, including any inline markers.
          if (head >= node.from && head <= node.to) return false;
          visitLink(node, ctx);
          return;
        }
        if (name === "Image") {
          if (head >= node.from && head <= node.to) return false;
          visitImage(node, ctx);
          return;
        }
        if (name === "StrongEmphasis") {
          visitStrongEmphasis(node, ctx);
          return;
        }
        if (name === "Emphasis") {
          visitEmphasis(node, ctx);
          return;
        }
        if (name === "Strikethrough") {
          visitStrikethrough(node, ctx);
          return;
        }
        if (name === "InlineCode") {
          visitInlineCode(node, ctx);
          return;
        }
        if (name === "URL") {
          visitURL(node, ctx);
          return;
        }
        if (
          name === "EmphasisMark" ||
          name === "CodeMark" ||
          name === "StrikethroughMark"
        ) {
          visitInlineMark(node, ctx);
          return;
        }
        return;
      },
    });
  }

  return {
    decorations: Decoration.set(ranges, true),
    atomic: Decoration.set(atomicRanges, true),
  };
}
