/**
 * `WidgetType` subclasses used by live-preview decorations. Widgets are
 * separated from plain mark/line decorations because they mount DOM and
 * can participate in events; decorations.ts stays DOM-free.
 */
import { Decoration, EditorView, WidgetType } from "@codemirror/view";
import { convertFileSrc } from "@tauri-apps/api/core";

/**
 * Resolve an image source to something the webview can load. HTTP(S) /
 * data / blob / asset URLs pass through unchanged; anything else is
 * treated as a path relative to the note's directory and rewritten via
 * Tauri's asset protocol so local files can be served. If `noteDir` is
 * empty (facet not wired yet) relative paths fall through unchanged —
 * the `<img>` will 404 and the widget's error handler takes over.
 */
function resolveImageSrc(src: string, noteDir: string): string {
  if (/^(?:https?|data|blob|asset):/i.test(src)) return src;
  if (!noteDir) return src;
  const clean = src.replace(/^\.\//, "");
  const sep = noteDir.includes("\\") ? "\\" : "/";
  const trimmed = noteDir.replace(/[\\/]+$/, "");
  return convertFileSrc(`${trimmed}${sep}${clean}`);
}

class ImageWidget extends WidgetType {
  constructor(
    readonly src: string,
    readonly alt: string,
    readonly noteDir: string,
  ) {
    super();
  }

  override eq(other: ImageWidget): boolean {
    return (
      other.src === this.src &&
      other.alt === this.alt &&
      other.noteDir === this.noteDir
    );
  }

  override toDOM(): HTMLElement {
    const wrap = document.createElement("span");
    wrap.className = "cm-rendered-image";
    const img = document.createElement("img");
    img.alt = this.alt;
    img.setAttribute("aria-label", `Image: ${this.alt || "untitled"}`);
    img.src = resolveImageSrc(this.src, this.noteDir);
    // On load failure, swap in the textual fallback so the note still
    // indicates "something is here" instead of a broken-image glyph.
    img.addEventListener("error", () => {
      wrap.classList.add("cm-rendered-image-error");
      wrap.replaceChildren();
      wrap.textContent = `\u{1F5BC} ${this.alt || this.src || "image"}`;
    });
    wrap.appendChild(img);
    return wrap;
  }

  override ignoreEvent(): boolean {
    return false;
  }
}

/** Replace decoration rendering the off-cursor image. */
export function imageWidget(
  src: string,
  alt: string,
  noteDir: string,
): Decoration {
  return Decoration.replace({ widget: new ImageWidget(src, alt, noteDir) });
}

/**
 * Checkbox widget that replaces a GFM TaskMarker (`[ ]` / `[x]`) when the
 * cursor is off the task line. Clicking dispatches a transaction that
 * flips the marker in the source; the widget re-renders on the next
 * decoration build with the new `checked` state.
 */
class TaskCheckboxWidget extends WidgetType {
  constructor(readonly checked: boolean) {
    super();
  }

  override eq(other: TaskCheckboxWidget): boolean {
    return other.checked === this.checked;
  }

  override toDOM(view: EditorView): HTMLElement {
    const wrap = document.createElement("span");
    wrap.className = "cm-rendered-task-checkbox";
    if (this.checked) wrap.classList.add("cm-rendered-task-checkbox-checked");

    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = this.checked;
    input.setAttribute(
      "aria-label",
      this.checked ? "Mark task not done" : "Mark task done",
    );

    // `mousedown` runs before CodeMirror decides where to place the cursor,
    // which is the event we want to hijack — stopping propagation here
    // keeps the click purely a toggle instead of moving the caret onto the
    // task line. The actual position is resolved via `posAtDOM` at click
    // time so it stays correct if the doc was edited since mount.
    input.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const pos = view.posAtDOM(wrap);
      if (pos < 0) return;
      const current = view.state.doc.sliceString(pos, pos + 3);
      let next: string;
      if (current === "[ ]") next = "[x]";
      else if (current === "[x]" || current === "[X]") next = "[ ]";
      else return;
      view.dispatch({
        changes: { from: pos, to: pos + 3, insert: next },
      });
    });
    // Swallow the subsequent click so it doesn't bubble into CodeMirror.
    input.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });

    wrap.appendChild(input);
    return wrap;
  }

  override ignoreEvent(): boolean {
    return false;
  }
}

/** Replace decoration rendering the off-cursor task-list checkbox widget. */
export function taskCheckbox(checked: boolean): Decoration {
  return Decoration.replace({ widget: new TaskCheckboxWidget(checked) });
}

/**
 * Renders a real bullet (`•`) in place of `-` / `*` / `+`. The source
 * keeps whatever character the user typed; this is cosmetic only.
 */
class BulletWidget extends WidgetType {
  override eq(_other: BulletWidget): boolean {
    return true;
  }

  override toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = "cm-rendered-list-bullet";
    span.textContent = "•";
    return span;
  }

  override ignoreEvent(): boolean {
    return false;
  }
}

/** Shared instance — the widget carries no state. */
export const bulletWidget = Decoration.replace({ widget: new BulletWidget() });

export type TableAlignment = "left" | "right" | "center" | null;

export interface TableData {
  header: string[];
  rows: string[][];
  alignments: TableAlignment[];
}

/**
 * Strip the common inline-markdown markers from a cell's raw source so the
 * rendered cell text looks clean. This is deliberately shallow — we don't
 * re-parse the cell with a full markdown pipeline, we just remove the
 * most common syntactic noise. Editing the cell (cursor inside the table)
 * shows raw source, so advanced formatting remains visible when it
 * matters.
 */
function stripInlineMarkers(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1$2")
    .replace(/(^|[^_])_([^_\n]+)_(?!\w)/g, "$1$2")
    .replace(/~~([^~]+)~~/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
}

class TableWidget extends WidgetType {
  constructor(readonly data: TableData) {
    super();
  }

  override eq(other: TableWidget): boolean {
    const a = this.data;
    const b = other.data;
    if (a.header.length !== b.header.length) return false;
    if (a.rows.length !== b.rows.length) return false;
    for (let i = 0; i < a.header.length; i++) {
      if (a.header[i] !== b.header[i]) return false;
      if (a.alignments[i] !== b.alignments[i]) return false;
    }
    for (let r = 0; r < a.rows.length; r++) {
      const ar = a.rows[r];
      const br = b.rows[r];
      if (ar.length !== br.length) return false;
      for (let c = 0; c < ar.length; c++) {
        if (ar[c] !== br[c]) return false;
      }
    }
    return true;
  }

  override toDOM(): HTMLElement {
    const table = document.createElement("table");
    table.className = "cm-rendered-table-widget";

    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    this.data.header.forEach((cell, i) => {
      const th = document.createElement("th");
      th.textContent = stripInlineMarkers(cell).trim();
      const align = this.data.alignments[i];
      if (align) th.style.textAlign = align;
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    this.data.rows.forEach((row) => {
      const tr = document.createElement("tr");
      row.forEach((cell, i) => {
        const td = document.createElement("td");
        td.textContent = stripInlineMarkers(cell).trim();
        const align = this.data.alignments[i];
        if (align) td.style.textAlign = align;
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    return table;
  }

  override ignoreEvent(): boolean {
    // Clicks inside the table widget should fall through to CodeMirror so
    // the user can place the cursor by clicking. No event is consumed here.
    return false;
  }
}

/**
 * Replace decoration rendering a GFM table as an HTML `<table>` widget.
 * Spans multiple lines, so `block: true` is required — CodeMirror rejects
 * multi-line replace decorations from plugins unless they're block-level.
 */
export function tableWidget(data: TableData): Decoration {
  return Decoration.replace({
    widget: new TableWidget(data),
    block: true,
  });
}
