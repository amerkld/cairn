/**
 * Live-preview ViewPlugin for the Cairn editor.
 *
 * Philosophy: render markdown as it will look while keeping the document
 * text exactly what the user typed. On lines without the cursor, syntax
 * markers (`#`, `**`, `` ` ``, `---`, fenced-code fences, …) are hidden
 * and the line renders formatted; on the cursor's line (or inside the
 * surrounding inline construct) markers are shown so editing feels like
 * raw markdown rather than a WYSIWYG black box.
 *
 * See `docs/EDITOR.md` for the full matrix of supported constructs and a
 * description of how visitors, decorations, and atomic ranges compose.
 */
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view";

import { linkClickHandler } from "./events";
import { tableRendering } from "./tables";
import { buildDecorations } from "./walker";
import { type LivePreviewDecorations } from "./types";

export { buildDecorations };
export type { LivePreviewDecorations };

const livePreviewPlugin = ViewPlugin.fromClass(
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

/**
 * Composite extension: the decoration plugin, the table-rendering state
 * field, and the cmd/ctrl-click link handler. CodeMirror flattens arrays
 * of extensions, so consumers just drop `livePreview` into their
 * extension list unchanged.
 */
export const livePreview = [
  livePreviewPlugin,
  tableRendering,
  linkClickHandler,
];
