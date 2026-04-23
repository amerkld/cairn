/**
 * Tests for block-level CommonMark constructs added alongside the GFM work:
 * blockquotes (including the `>` hide/show rule and nesting) and lists
 * (marker styling for bullet and ordered lists, line class across items).
 */
import { describe, it, expect } from "vitest";
import { EditorState } from "@codemirror/state";
import type { DecorationSet } from "@codemirror/view";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";

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

describe("blockquote decorations", () => {
  it("applies the blockquote line class to each line of a quote", () => {
    const doc = "> line one\n> line two\nafter";
    const summary = summarize(decorate(doc, doc.length), doc.length);
    const line2Start = doc.indexOf("> line two");

    expect(classesAt(summary, 0)).toContain("cm-rendered-blockquote");
    expect(classesAt(summary, line2Start)).toContain("cm-rendered-blockquote");
  });

  it("hides the `>` marker plus trailing space when the cursor is off the line", () => {
    const doc = "> quote\nafter";
    const summary = summarize(decorate(doc, doc.length), doc.length);

    const hidden = summary.find((d) => d.replace && d.from === 0 && d.to === 2);
    expect(hidden).toBeDefined();
  });

  it("leaves the `>` marker visible when the cursor is on the quote line", () => {
    const doc = "> quote";
    // Cursor inside "quote".
    const summary = summarize(decorate(doc, 4), doc.length);

    const hidden = summary.find((d) => d.replace && d.from === 0);
    expect(hidden).toBeUndefined();
    expect(classesAt(summary, 0)).toContain("cm-rendered-blockquote");
  });

  it("handles nested blockquotes without throwing", () => {
    const doc = "> outer\n> > inner\nafter";
    expect(() => decorate(doc, doc.length)).not.toThrow();

    const summary = summarize(decorate(doc, doc.length), doc.length);
    const innerStart = doc.indexOf("> > inner");
    expect(classesAt(summary, innerStart)).toContain("cm-rendered-blockquote");
  });
});

describe("list decorations", () => {
  it("shows the raw `-` marker when the cursor is on the list line", () => {
    const doc = "- item";
    const summary = summarize(decorate(doc, doc.length), doc.length);

    const marker = summary.find((d) => d.class === "cm-rendered-list-marker");
    expect(marker).toBeDefined();
    expect(marker?.from).toBe(0);
    expect(marker?.to).toBe(1);
    // No bullet widget on the cursor line.
    const widget = summary.find((d) => d.replace && d.from === 0 && d.to === 1);
    expect(widget).toBeUndefined();
  });

  it("replaces the `-` marker with a bullet widget when the cursor is off the list line", () => {
    const doc = "- item\nafter";
    // Cursor at end, on the "after" line.
    const summary = summarize(decorate(doc, doc.length), doc.length);

    const widget = summary.find((d) => d.replace && d.from === 0 && d.to === 1);
    expect(widget).toBeDefined();
  });

  it("replaces `*` and `+` unordered markers too", () => {
    for (const marker of ["*", "+"]) {
      const doc = `${marker} item\nafter`;
      const summary = summarize(decorate(doc, doc.length), doc.length);
      const widget = summary.find(
        (d) => d.replace && d.from === 0 && d.to === 1,
      );
      expect(widget, `expected bullet widget for "${marker}"`).toBeDefined();
    }
  });

  it("keeps ordered list markers raw — never replaces `1.` with a bullet", () => {
    const doc = "1. item\nafter";
    // Cursor off the list line.
    const summary = summarize(decorate(doc, doc.length), doc.length);

    const marker = summary.find((d) => d.class === "cm-rendered-list-marker");
    expect(marker).toBeDefined();
    expect(marker?.from).toBe(0);
    expect(marker?.to).toBe(2); // `1.`
    // No replace widget over the marker.
    const widget = summary.find((d) => d.replace && d.from === 0 && d.to === 2);
    expect(widget).toBeUndefined();
  });

  it("applies the list-item line class across each item's lines", () => {
    const doc = "- first\n- second\n- third";
    const summary = summarize(decorate(doc, 0), doc.length);
    const second = doc.indexOf("- second");
    const third = doc.indexOf("- third");

    expect(classesAt(summary, 0)).toContain("cm-rendered-list-item");
    expect(classesAt(summary, second)).toContain("cm-rendered-list-item");
    expect(classesAt(summary, third)).toContain("cm-rendered-list-item");
  });

  it("does not throw on nested lists", () => {
    const doc = "- outer\n  - nested\n  - also";
    expect(() => decorate(doc, doc.length)).not.toThrow();
  });
});
