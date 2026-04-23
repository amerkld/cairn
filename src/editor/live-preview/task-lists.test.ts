/**
 * Tests for GFM task-list decorations.
 *
 * Decoration-level assertions use the pure `buildDecorations` pattern
 * shared across this folder; the click-toggle behaviour gets an
 * integration test that mounts a real `EditorView` in jsdom and simulates
 * a mousedown on the checkbox widget.
 */
import { describe, it, expect } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView, type DecorationSet } from "@codemirror/view";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";

import { livePreview } from "./index";
import { buildDecorations } from "./walker";
import { classesAt, summarize } from "./summarize";

function decorate(doc: string, cursorPos: number): DecorationSet {
  const state = EditorState.create({
    doc,
    selection: { anchor: cursorPos },
    extensions: [markdown({ base: markdownLanguage })],
  });
  return buildDecorations(state, [{ from: 0, to: doc.length }]).decorations;
}

describe("task-list decorations", () => {
  it("replaces `[ ]` with a checkbox widget off-cursor", () => {
    const doc = "- [ ] todo\nafter";
    const markerStart = doc.indexOf("[");
    const markerEnd = markerStart + 3;
    // Cursor on line 2 (the "after" line).
    const summary = summarize(decorate(doc, doc.length), doc.length);

    const widget = summary.find(
      (d) => d.replace && d.from === markerStart && d.to === markerEnd,
    );
    expect(widget).toBeDefined();
  });

  it("replaces `[x]` with a checkbox widget off-cursor without changing line styling", () => {
    const doc = "- [x] done\nafter";
    const lineStart = 0;
    const summary = summarize(decorate(doc, doc.length), doc.length);

    // No strikethrough/muted line class — the task text should read the
    // same whether checked or not.
    expect(classesAt(summary, lineStart)).not.toContain("cm-rendered-task-done");

    const markerStart = doc.indexOf("[");
    const widget = summary.find(
      (d) => d.replace && d.from === markerStart && d.to === markerStart + 3,
    );
    expect(widget).toBeDefined();
  });

  it("shows the raw `[ ]` when the cursor is on the task line", () => {
    const doc = "- [ ] todo";
    // Cursor inside "todo".
    const summary = summarize(decorate(doc, doc.length - 1), doc.length);

    const markerStart = doc.indexOf("[");
    const widget = summary.find(
      (d) => d.replace && d.from === markerStart && d.to === markerStart + 3,
    );
    expect(widget).toBeUndefined();
  });
});

describe("task-list click integration", () => {
  it("toggles `[ ]` to `[x]` when the checkbox is mousedown'd", () => {
    const doc = "- [ ] todo\nafter\n";
    const parent = document.createElement("div");
    document.body.appendChild(parent);

    const view = new EditorView({
      state: EditorState.create({
        // Cursor on the "after" line so the widget is rendered.
        doc,
        selection: { anchor: doc.length },
        extensions: [markdown({ base: markdownLanguage }), livePreview],
      }),
      parent,
    });

    const checkbox = parent.querySelector<HTMLInputElement>(
      ".cm-rendered-task-checkbox input[type='checkbox']",
    );
    expect(checkbox).toBeTruthy();

    checkbox!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));

    expect(view.state.doc.toString()).toContain("[x] todo");

    view.destroy();
    parent.remove();
  });

  it("toggles `[x]` back to `[ ]`", () => {
    const doc = "- [x] done\n\n";
    const parent = document.createElement("div");
    document.body.appendChild(parent);

    const view = new EditorView({
      state: EditorState.create({
        doc,
        selection: { anchor: doc.length },
        extensions: [markdown({ base: markdownLanguage }), livePreview],
      }),
      parent,
    });

    const checkbox = parent.querySelector<HTMLInputElement>(
      ".cm-rendered-task-checkbox input[type='checkbox']",
    );
    expect(checkbox).toBeTruthy();

    checkbox!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));

    expect(view.state.doc.toString()).toContain("[ ] done");

    view.destroy();
    parent.remove();
  });
});
