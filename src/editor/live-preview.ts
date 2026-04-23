/**
 * Live-preview decorations for CodeMirror 6.
 *
 * Philosophy: render markdown as it will look while keeping the document text
 * exactly what the user typed. On lines without the cursor, syntax markers
 * (`#`, `**`, `` ` ``, `---`, fenced-code fences) are hidden and the content
 * renders formatted; on the line that holds the cursor, markers are shown so
 * editing feels like raw markdown rather than a WYSIWYG black box.
 *
 * Supported constructs:
 *   - ATX headings (# … ######)
 *   - Bold (**…**), italic (*…*, _…_)
 *   - Inline code (`…`)
 *   - Fenced code blocks (``` … ```) and indented code blocks
 *   - Thematic breaks (---, ***, ___)
 *
 * Decorations are collected into an unsorted array and handed to
 * `Decoration.set(ranges, true)`, which sorts and validates them. A
 * hand-ordered `RangeSetBuilder` is fragile here: certain tree shapes (e.g.
 * a heading with inline emphasis, or nested emphasis) produce additions
 * that violate the builder's ordering rules and throw mid-update, leaving
 * the view with stale decorations until the document is reshaped into a
 * pattern the builder accepts. Collect-and-sort avoids that class of bugs;
 * the `try/catch` around the walk is a second belt.
 *
 * Built on the markdown syntax tree from `@codemirror/lang-markdown`.
 */
import { type EditorState, type Range } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";

const hideMark = Decoration.replace({});

const headingLine: Record<number, Decoration> = {
  1: Decoration.line({ class: "cm-heading cm-heading-1" }),
  2: Decoration.line({ class: "cm-heading cm-heading-2" }),
  3: Decoration.line({ class: "cm-heading cm-heading-3" }),
  4: Decoration.line({ class: "cm-heading cm-heading-4" }),
  5: Decoration.line({ class: "cm-heading cm-heading-5" }),
  6: Decoration.line({ class: "cm-heading cm-heading-6" }),
};

const boldMark = Decoration.mark({ class: "cm-rendered-bold" });
const italicMark = Decoration.mark({ class: "cm-rendered-italic" });
const inlineCodeMark = Decoration.mark({ class: "cm-rendered-code" });
const codeBlockLine = Decoration.line({ class: "cm-rendered-code-block" });
const codeBlockFirstLine = Decoration.line({
  class: "cm-rendered-code-block-first",
});
const codeBlockLastLine = Decoration.line({
  class: "cm-rendered-code-block-last",
});
const hrLine = Decoration.line({ class: "cm-rendered-hr" });

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

/** Pure function over state + viewport, exposed for unit tests. */
export function buildDecorations(
  state: EditorState,
  visibleRanges: readonly { readonly from: number; readonly to: number }[],
): LivePreviewDecorations {
  const ranges: Range<Decoration>[] = [];
  const atomicRanges: Range<Decoration>[] = [];
  const { head } = state.selection.main;
  const cursorLine = state.doc.lineAt(head).number;

  const pushHide = (from: number, to: number) => {
    const r = hideMark.range(from, to);
    ranges.push(r);
    atomicRanges.push(r);
  };

  for (const { from, to } of visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter: (node) => {
        const name = node.name;

        if (name.startsWith("ATXHeading")) {
          const level = Number(name.slice("ATXHeading".length));
          const deco = headingLine[level];
          if (deco) {
            const line = state.doc.lineAt(node.from);
            ranges.push(deco.range(line.from));
          }
          return; // descend into HeaderMark + inline children below
        }

        if (name === "HeaderMark") {
          // Inside an ATX heading: hide the `#+` prefix plus the trailing
          // space when the cursor is on another line.
          const line = state.doc.lineAt(node.from);
          if (line.number === cursorLine) return;
          let end = node.to;
          if (state.doc.sliceString(end, end + 1) === " ") end += 1;
          pushHide(node.from, end);
          return;
        }

        if (name === "HorizontalRule") {
          const line = state.doc.lineAt(node.from);
          if (line.number === cursorLine) return; // show raw dashes on active line
          ranges.push(hrLine.range(line.from));
          if (line.to > line.from) {
            pushHide(line.from, line.to);
          }
          return;
        }

        if (name === "FencedCode" || name === "CodeBlock") {
          const startLine = state.doc.lineAt(node.from).number;
          // `node.to` is exclusive; step back one char so a block that ends
          // exactly at a line break doesn't claim the next line.
          const endOffset = node.to > node.from ? node.to - 1 : node.from;
          let endLine = state.doc.lineAt(endOffset).number;

          // An unclosed fenced block extends to end-of-document per
          // CommonMark. Lezer may give us a FencedCode that only covers the
          // opening-fence line until more content appears, leaving the new
          // empty line below without styling while the user is about to
          // type code into it. Detect the unclosed state (fewer than two
          // CodeMark children = no closing fence yet) and extend the styled
          // range to EOF so in-progress code blocks render immediately.
          if (name === "FencedCode") {
            let markCount = 0;
            for (let c = node.node.firstChild; c; c = c.nextSibling) {
              if (c.name === "CodeMark") {
                markCount += 1;
                if (markCount >= 2) break;
              }
            }
            if (markCount < 2) {
              endLine = state.doc.lines;
            }
          }

          for (let ln = startLine; ln <= endLine; ln++) {
            const line = state.doc.line(ln);
            ranges.push(codeBlockLine.range(line.from));
            // First and last lines get extra classes so the theme can draw
            // rounded top/bottom borders. Single-line blocks get both.
            if (ln === startLine) {
              ranges.push(codeBlockFirstLine.range(line.from));
            }
            if (ln === endLine) {
              ranges.push(codeBlockLastLine.range(line.from));
            }
          }
          return; // fence CodeMark children are hidden by the generic branch below
        }

        if (name === "StrongEmphasis") {
          ranges.push(boldMark.range(node.from, node.to));
          return;
        }

        if (name === "Emphasis") {
          ranges.push(italicMark.range(node.from, node.to));
          return;
        }

        if (name === "InlineCode") {
          // Style only the inner range between the opening and closing
          // backticks. Covering the whole span would align the style's
          // edges with the replaced (hidden) backticks and cause the
          // visible text to lose its background/monospace treatment.
          const first = node.node.firstChild;
          const last = node.node.lastChild;
          const innerFrom = first?.name === "CodeMark" ? first.to : node.from;
          const innerTo = last?.name === "CodeMark" ? last.from : node.to;
          if (innerTo > innerFrom) {
            ranges.push(inlineCodeMark.range(innerFrom, innerTo));
          }
          return;
        }

        if (name === "EmphasisMark" || name === "CodeMark") {
          const parent = node.node.parent;
          const parentName = parent?.name;
          // Fence markers (` ``` `) stay line-based: show them when the
          // cursor is on the fence line.
          if (parentName === "FencedCode" || parentName === "CodeBlock") {
            const line = state.doc.lineAt(node.from);
            if (line.number === cursorLine) return;
          } else if (parent) {
            // Inline markers (Emphasis / StrongEmphasis / InlineCode): show
            // only when the cursor is inside (or at the edge of) the
            // construct, not just on the same line. Elsewhere on the line
            // the markers stay hidden.
            if (head >= parent.from && head <= parent.to) return;
          }
          if (node.to > node.from) {
            pushHide(node.from, node.to);
          }
        }
      },
    });
  }

  return {
    decorations: Decoration.set(ranges, true),
    atomic: Decoration.set(atomicRanges, true),
  };
}

export const livePreview = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    atomic: DecorationSet;

    constructor(view: EditorView) {
      const built = this.safeBuild(view);
      this.decorations = built.decorations;
      this.atomic = built.atomic;
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        const built = this.safeBuild(update.view);
        this.decorations = built.decorations;
        this.atomic = built.atomic;
      }
    }

    private safeBuild(view: EditorView): LivePreviewDecorations {
      try {
        return buildDecorations(view.state, view.visibleRanges);
      } catch (error) {
        // Keep the previous sets rather than clearing the view; the next
        // successful update refreshes them.
        console.error("[live-preview] decoration build failed", error);
        return {
          decorations: this.decorations ?? Decoration.none,
          atomic: this.atomic ?? Decoration.none,
        };
      }
    }
  },
  {
    decorations: (v) => v.decorations,
    provide: (plugin) =>
      EditorView.atomicRanges.of(
        (view) => view.plugin(plugin)?.atomic ?? Decoration.none,
      ),
  },
);
