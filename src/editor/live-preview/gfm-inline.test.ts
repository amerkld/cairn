/**
 * Tests for GFM inline constructs: strikethrough (`~~x~~`) and bare URL
 * autolinks. The link-click handler is covered manually in the running
 * app — wiring a full `EditorView` with jsdom layout primitives is more
 * complexity than the handler's logic justifies.
 */
import { describe, it, expect } from "vitest";
import { EditorState } from "@codemirror/state";
import type { DecorationSet } from "@codemirror/view";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";

import { buildDecorations } from "./walker";
import { summarize } from "./summarize";

function decorate(doc: string, cursorPos: number): DecorationSet {
  const state = EditorState.create({
    doc,
    selection: { anchor: cursorPos },
    extensions: [markdown({ base: markdownLanguage })],
  });
  return buildDecorations(state, [{ from: 0, to: doc.length }]).decorations;
}

describe("strikethrough decorations", () => {
  it("applies the strikethrough mark over the full `~~…~~` span", () => {
    const doc = "~~struck~~";
    const summary = summarize(decorate(doc, doc.length), doc.length);

    const mark = summary.find((d) => d.class === "cm-rendered-strikethrough");
    expect(mark).toBeDefined();
    expect(mark?.from).toBe(0);
    expect(mark?.to).toBe(doc.length);
  });

  it("hides the `~~` markers off-cursor", () => {
    const doc = "x ~~struck~~ y";
    const strikeStart = doc.indexOf("~~");
    const strikeEnd = strikeStart + "~~struck~~".length;
    const summary = summarize(decorate(doc, doc.length), doc.length);

    const openHidden = summary.find(
      (d) => d.replace && d.from === strikeStart && d.to === strikeStart + 2,
    );
    const closeHidden = summary.find(
      (d) => d.replace && d.from === strikeEnd - 2 && d.to === strikeEnd,
    );
    expect(openHidden).toBeDefined();
    expect(closeHidden).toBeDefined();
  });

  it("shows the `~~` markers when the cursor is inside the strikethrough", () => {
    const doc = "x ~~struck~~ y";
    const strikeStart = doc.indexOf("~~");
    // Cursor between the leading `~~` and the text `s`.
    const summary = summarize(decorate(doc, strikeStart + 3), doc.length);

    const hidden = summary.filter(
      (d) => d.replace && d.from >= strikeStart && d.to <= strikeStart + 10,
    );
    expect(hidden).toHaveLength(0);
  });
});

describe("autolink decorations", () => {
  it("styles a bare URL as a link when not inside a Link node", () => {
    const doc = "see https://example.com ok";
    const urlStart = doc.indexOf("https");
    const urlEnd = doc.indexOf(" ok");
    const summary = summarize(decorate(doc, 0), doc.length);

    const mark = summary.find(
      (d) =>
        d.class === "cm-rendered-link" &&
        d.from === urlStart &&
        d.to === urlEnd,
    );
    expect(mark).toBeDefined();
  });

  it("does not style the URL twice inside a regular `[text](url)` link", () => {
    // The inner URL is hidden by visitLink; visitURL must skip it rather
    // than emit another link mark on top of the hidden range.
    const doc = "see [name](https://example.com) ok";
    const summary = summarize(decorate(doc, doc.length), doc.length);

    const innerUrlStart = doc.indexOf("https");
    const innerUrlEnd = doc.indexOf(")");
    const doubleDecorated = summary.filter(
      (d) =>
        d.class === "cm-rendered-link" &&
        d.from >= innerUrlStart &&
        d.to <= innerUrlEnd,
    );
    // The visible link text at `[name]` → `name` gets the class, but the
    // URL portion itself must not.
    expect(doubleDecorated).toHaveLength(0);
  });
});
