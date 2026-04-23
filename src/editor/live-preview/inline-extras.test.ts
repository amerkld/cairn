/**
 * Tests for inline CommonMark constructs added alongside the GFM work:
 * links (hide brackets + URL off-cursor, style the visible text; show raw
 * when the cursor is inside the link span) and images (replace the node
 * with a badge widget off-cursor).
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

describe("link decorations", () => {
  it("styles the visible text and hides brackets + URL off-cursor", () => {
    const doc = "see [Cairn](https://example.com) docs";
    const linkStart = doc.indexOf("[");
    const textStart = linkStart + 1; // after `[`
    const textEnd = doc.indexOf("]");
    const linkEnd = doc.indexOf(")") + 1;
    // Cursor at end of doc, outside the link.
    const summary = summarize(decorate(doc, doc.length), doc.length);

    // The text span gets the link class.
    const linkMark = summary.find(
      (d) =>
        d.class === "cm-rendered-link" &&
        d.from === textStart &&
        d.to === textEnd,
    );
    expect(linkMark).toBeDefined();

    // The opening `[` is hidden.
    const openHidden = summary.find(
      (d) => d.replace && d.from === linkStart && d.to === linkStart + 1,
    );
    expect(openHidden).toBeDefined();

    // Everything from `]` through the closing `)` is hidden in one span.
    const tailHidden = summary.find(
      (d) => d.replace && d.from === textEnd && d.to === linkEnd,
    );
    expect(tailHidden).toBeDefined();
  });

  it("shows the raw link syntax when the cursor is inside the link", () => {
    const doc = "[Cairn](https://example.com)";
    // Cursor between `[` and `C`.
    const summary = summarize(decorate(doc, 1), doc.length);

    // No hide decoration over the brackets or URL.
    expect(summary.filter((d) => d.replace)).toHaveLength(0);
    // And no link-text mark either (source renders as raw markdown).
    expect(summary.find((d) => d.class === "cm-rendered-link")).toBeUndefined();
  });

  it("handles a link at the start of the document", () => {
    const doc = "[start](https://x) after";
    // Cursor well past the link.
    const summary = summarize(decorate(doc, doc.length), doc.length);

    const linkMark = summary.find((d) => d.class === "cm-rendered-link");
    expect(linkMark).toBeDefined();
    expect(linkMark?.from).toBe(1); // after `[`
    expect(linkMark?.to).toBe(doc.indexOf("]"));
  });

  it("does not throw on a malformed link with no URL", () => {
    const doc = "[text]()";
    expect(() => decorate(doc, doc.length)).not.toThrow();
  });
});

describe("image decorations", () => {
  it("replaces the image node with a badge widget off-cursor", () => {
    const doc = "before ![alt](./x.png) after";
    const imgStart = doc.indexOf("![");
    const imgEnd = doc.indexOf(")") + 1;
    // Cursor at end of doc.
    const summary = summarize(decorate(doc, doc.length), doc.length);

    const badge = summary.find(
      (d) => d.replace && d.from === imgStart && d.to === imgEnd,
    );
    expect(badge).toBeDefined();
  });

  it("shows the raw image syntax when the cursor is inside the image", () => {
    const doc = "![alt](./x.png)";
    // Cursor between `!` and `[`.
    const summary = summarize(decorate(doc, 1), doc.length);

    expect(summary.filter((d) => d.replace)).toHaveLength(0);
  });

  it("handles an image with empty alt text", () => {
    const doc = "![](./x.png) trailing";
    const imgEnd = doc.indexOf(")") + 1;
    const summary = summarize(decorate(doc, doc.length), doc.length);

    const badge = summary.find(
      (d) => d.replace && d.from === 0 && d.to === imgEnd,
    );
    expect(badge).toBeDefined();
  });
});
