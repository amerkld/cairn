/**
 * Prebuilt `Decoration` instances shared across visitors. Building them once
 * and reusing avoids allocation during the walk and keeps the decoration set
 * deduplication-friendly.
 */
import { Decoration } from "@codemirror/view";

/** Zero-width replace used to hide syntax markers. */
export const hideMark = Decoration.replace({});

export const headingLine: Record<number, Decoration> = {
  1: Decoration.line({ class: "cm-heading cm-heading-1" }),
  2: Decoration.line({ class: "cm-heading cm-heading-2" }),
  3: Decoration.line({ class: "cm-heading cm-heading-3" }),
  4: Decoration.line({ class: "cm-heading cm-heading-4" }),
  5: Decoration.line({ class: "cm-heading cm-heading-5" }),
  6: Decoration.line({ class: "cm-heading cm-heading-6" }),
};

export const boldMark = Decoration.mark({ class: "cm-rendered-bold" });
export const italicMark = Decoration.mark({ class: "cm-rendered-italic" });
export const inlineCodeMark = Decoration.mark({ class: "cm-rendered-code" });

export const codeBlockLine = Decoration.line({ class: "cm-rendered-code-block" });
export const codeBlockFirstLine = Decoration.line({
  class: "cm-rendered-code-block-first",
});
export const codeBlockLastLine = Decoration.line({
  class: "cm-rendered-code-block-last",
});

export const hrLine = Decoration.line({ class: "cm-rendered-hr" });

export const blockquoteLine = Decoration.line({
  class: "cm-rendered-blockquote",
});
export const listItemLine = Decoration.line({ class: "cm-rendered-list-item" });
export const listMarker = Decoration.mark({ class: "cm-rendered-list-marker" });

export const linkText = Decoration.mark({ class: "cm-rendered-link" });

export const strikethroughMark = Decoration.mark({
  class: "cm-rendered-strikethrough",
});

