/**
 * Live-preview decorations for CodeMirror 6.
 *
 * Philosophy: render markdown as it will look, while keeping the actual text
 * exactly what the user typed. The effect:
 *   - Headings are scaled and their `#` prefix is hidden when the cursor is
 *     on a different line.
 *   - Bold / italic / inline-code render styled; their markers (`**`, `*`,
 *     `` ` ``) are hidden when the cursor is on a different line.
 * Cursor on the same line → markers are visible so editing feels like raw
 * markdown, not a WYSIWYG black box.
 *
 * Built on the markdown syntax tree from `@codemirror/lang-markdown`.
 */
import { RangeSetBuilder } from "@codemirror/state";
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
const codeMark = Decoration.mark({ class: "cm-rendered-code" });

function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const cursorPos = view.state.selection.main.head;
  const cursorLine = view.state.doc.lineAt(cursorPos).number;

  // We need to collect line decorations in ascending order for RangeSetBuilder.
  // The syntax tree iteration is document-order, which is what we want.
  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter: (node) => {
        const name = node.name;

        if (name.startsWith("ATXHeading")) {
          // ATXHeading1 … ATXHeading6
          const level = Number(name.slice("ATXHeading".length));
          const line = view.state.doc.lineAt(node.from);
          const deco = headingLine[level];
          if (deco) {
            builder.add(line.from, line.from, deco);
          }
          return; // children (HeaderMark, content) handled below
        }

        if (name === "HeaderMark") {
          const line = view.state.doc.lineAt(node.from);
          if (line.number !== cursorLine) {
            // Hide the `#+` prefix and the space after it.
            // `node.to` points at the last `#`; consume one trailing space
            // so the visible line starts with the heading text.
            let end = node.to;
            const text = view.state.doc.sliceString(end, end + 1);
            if (text === " ") end += 1;
            builder.add(node.from, end, hideMark);
          }
          return;
        }

        if (name === "StrongEmphasis") {
          builder.add(node.from, node.to, boldMark);
          return;
        }
        if (name === "Emphasis") {
          builder.add(node.from, node.to, italicMark);
          return;
        }
        if (name === "InlineCode") {
          builder.add(node.from, node.to, codeMark);
          return;
        }

        if (name === "EmphasisMark" || name === "CodeMark") {
          const line = view.state.doc.lineAt(node.from);
          if (line.number !== cursorLine) {
            builder.add(node.from, node.to, hideMark);
          }
        }
      },
    });
  }

  return builder.finish();
}

export const livePreview = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  {
    decorations: (v) => v.decorations,
    provide: (plugin) =>
      EditorView.atomicRanges.of((view) => {
        return view.plugin(plugin)?.decorations ?? Decoration.none;
      }),
  },
);
