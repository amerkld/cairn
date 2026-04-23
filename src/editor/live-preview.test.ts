/**
 * Unit tests for the live-preview decoration builder.
 *
 * These drive `buildDecorations` directly against an EditorState so we don't
 * depend on jsdom's (missing) layout measurement — the production plugin
 * just wires the same function to the real EditorView.
 */
import { describe, it, expect } from "vitest";
import { EditorState } from "@codemirror/state";
import type { DecorationSet } from "@codemirror/view";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { buildDecorations } from "./live-preview";
import { classesAt, summarize } from "./live-preview/summarize";

function decorate(doc: string, cursorPos: number): DecorationSet {
  const state = EditorState.create({
    doc,
    selection: { anchor: cursorPos },
    extensions: [markdown({ base: markdownLanguage })],
  });
  return buildDecorations(state, [{ from: 0, to: doc.length }]).decorations;
}

function decorateWithAtomic(doc: string, cursorPos: number) {
  const state = EditorState.create({
    doc,
    selection: { anchor: cursorPos },
    extensions: [markdown({ base: markdownLanguage })],
  });
  return buildDecorations(state, [{ from: 0, to: doc.length }]);
}

describe("live-preview buildDecorations", () => {
  it("applies a heading line class to an ATX h1 when cursor is off the line", () => {
    const doc = "# Hello\nbody";
    const summary = summarize(decorate(doc, doc.length), doc.length);

    expect(classesAt(summary, 0)).toContain("cm-heading cm-heading-1");
  });

  it("hides the `#` prefix and trailing space on a heading when cursor is elsewhere", () => {
    const doc = "# Hello\nbody";
    const summary = summarize(decorate(doc, doc.length), doc.length);

    const replace = summary.find((d) => d.replace && d.from === 0);
    expect(replace).toBeDefined();
    expect(replace?.to).toBe(2); // `#` + space
  });

  it("leaves the `#` prefix visible when the cursor is on the heading line", () => {
    const doc = "# Hello";
    const summary = summarize(decorate(doc, 3), doc.length);

    // No replace decoration covering the prefix.
    const hidden = summary.filter((d) => d.replace && d.from === 0);
    expect(hidden).toHaveLength(0);
    // But the heading line class still applies.
    expect(classesAt(summary, 0)).toContain("cm-heading cm-heading-1");
  });

  it("keeps headings rendering after bold + Enter (regression for page-wide breakage)", () => {
    const doc = "**bold**\n# Heading";
    const summary = summarize(decorate(doc, doc.length), doc.length);
    const headingStart = doc.indexOf("# ");

    expect(classesAt(summary, headingStart)).toContain(
      "cm-heading cm-heading-1",
    );
  });

  it("keeps headings rendering after inline code + Enter", () => {
    const doc = "`code`\n# Heading";
    const summary = summarize(decorate(doc, doc.length), doc.length);
    const headingStart = doc.indexOf("# ");

    expect(classesAt(summary, headingStart)).toContain(
      "cm-heading cm-heading-1",
    );
  });

  it("renders bold as a mark decoration over the whole **…** span", () => {
    const doc = "**bold**";
    const summary = summarize(decorate(doc, doc.length), doc.length);

    const bold = summary.find((d) => d.class === "cm-rendered-bold");
    expect(bold).toBeDefined();
    expect(bold?.from).toBe(0);
    expect(bold?.to).toBe(doc.length);
  });

  it("renders inline code only over the inner text, not the backticks", () => {
    const doc = "`x`";
    const summary = summarize(decorate(doc, doc.length), doc.length);

    const code = summary.find((d) => d.class === "cm-rendered-code");
    expect(code).toBeDefined();
    expect(code?.from).toBe(1);
    expect(code?.to).toBe(2);
  });

  it("keeps inline-code backticks visible when the cursor is inside the construct", () => {
    const doc = "abc `hi` def";
    const codeStart = doc.indexOf("`");
    // Cursor between the backticks.
    const summary = summarize(decorate(doc, codeStart + 2), doc.length);

    const hidden = summary.filter(
      (d) => d.replace && d.from >= codeStart && d.to <= codeStart + 4,
    );
    expect(hidden).toHaveLength(0);
  });

  it("hides inline-code backticks when the cursor is on the same line but outside the construct", () => {
    const doc = "abc `hi` def";
    const codeStart = doc.indexOf("`");
    // Cursor at end of line, outside the construct.
    const summary = summarize(decorate(doc, doc.length), doc.length);

    const openingHidden = summary.find(
      (d) => d.replace && d.from === codeStart && d.to === codeStart + 1,
    );
    const closingHidden = summary.find(
      (d) => d.replace && d.from === codeStart + 3 && d.to === codeStart + 4,
    );
    expect(openingHidden).toBeDefined();
    expect(closingHidden).toBeDefined();
  });

  it("keeps bold asterisks visible when the cursor is inside **…**", () => {
    const doc = "x **bold** y";
    const boldStart = doc.indexOf("**");
    // Cursor between the asterisks.
    const summary = summarize(decorate(doc, boldStart + 3), doc.length);

    const hidden = summary.filter(
      (d) => d.replace && d.from >= boldStart && d.to <= boldStart + 8,
    );
    expect(hidden).toHaveLength(0);
  });

  it("hides bold asterisks when the cursor is on the same line but outside **…**", () => {
    const doc = "x **bold** y";
    const boldStart = doc.indexOf("**");
    const summary = summarize(decorate(doc, doc.length), doc.length);

    const openingHidden = summary.find(
      (d) => d.replace && d.from === boldStart && d.to === boldStart + 2,
    );
    expect(openingHidden).toBeDefined();
  });

  it("returns a separate atomic set that excludes mark decorations", () => {
    const doc = "abc `hi` def";
    const { decorations, atomic } = decorateWithAtomic(doc, doc.length);
    const rendered = summarize(decorations, doc.length);
    const atomicSummary = summarize(atomic, doc.length);

    // Rendered set contains the inline-code mark (class defined).
    expect(
      rendered.some((d) => d.class === "cm-rendered-code"),
    ).toBe(true);
    // Atomic set contains only replace decorations (no class).
    expect(atomicSummary.every((d) => d.class === undefined)).toBe(true);
    expect(atomicSummary.length).toBeGreaterThan(0);
  });

  it("applies the code-block line class to every line in a fenced block", () => {
    const doc = "```\nline1\nline2\n```";
    const summary = summarize(decorate(doc, 0), doc.length);
    // Lines at offsets 0 (```), 4 (line1), 10 (line2), 16 (```).
    const codeBlockStarts = summary
      .filter((d) => d.class === "cm-rendered-code-block")
      .map((d) => d.from)
      .sort((a, b) => a - b);

    expect(codeBlockStarts).toEqual([0, 4, 10, 16]);
  });

  it("extends code-block styling to a newly-opened fence with no closing yet", () => {
    // Opening fence + a newline, cursor on the blank second line. The block
    // is unclosed — CommonMark says it runs to EOF, so both lines should
    // pick up the code-block class even though line 2 is empty.
    const doc = "```\n";
    const summary = summarize(decorate(doc, doc.length), doc.length);

    const baseStarts = summary
      .filter((d) => d.class === "cm-rendered-code-block")
      .map((d) => d.from)
      .sort((a, b) => a - b);

    // Line 1 starts at 0, line 2 starts at 4.
    expect(baseStarts).toContain(0);
    expect(baseStarts).toContain(4);
  });

  it("does not extend past the closing fence when the block is properly closed", () => {
    const doc = "```\nx\n```\nafter";
    const summary = summarize(decorate(doc, 0), doc.length);
    const afterStart = doc.indexOf("after");

    // The "after" line is outside the block and must not carry the class.
    const classesAtAfter = summary
      .filter((d) => d.from === afterStart && d.class?.startsWith("cm-rendered-code-block"))
      .map((d) => d.class);
    expect(classesAtAfter).toEqual([]);
  });

  it("marks the first and last lines of a fenced block for rounded corners", () => {
    const doc = "```\nline1\nline2\n```";
    const summary = summarize(decorate(doc, 0), doc.length);

    const firstAt = summary
      .filter((d) => d.class === "cm-rendered-code-block-first")
      .map((d) => d.from);
    const lastAt = summary
      .filter((d) => d.class === "cm-rendered-code-block-last")
      .map((d) => d.from);

    expect(firstAt).toEqual([0]);
    expect(lastAt).toEqual([16]);
  });

  // `before\n---` without a blank line parses as a Setext heading, not a
  // thematic break. Blank lines separate the constructs.
  it("applies the thematic-break line class and hides the dashes off-cursor", () => {
    const doc = "before\n\n---\n\nafter";
    const hrStart = doc.indexOf("---");
    const summary = summarize(decorate(doc, 0), doc.length);

    expect(classesAt(summary, hrStart)).toContain("cm-rendered-hr");
    const hidden = summary.find(
      (d) => d.replace && d.from === hrStart && d.to === hrStart + 3,
    );
    expect(hidden).toBeDefined();
  });

  it("shows the thematic-break raw when the cursor is on that line", () => {
    const doc = "before\n\n---\n\nafter";
    const hrStart = doc.indexOf("---");
    const summary = summarize(decorate(doc, hrStart + 1), doc.length);

    const hidden = summary.find(
      (d) => d.replace && d.from === hrStart && d.to === hrStart + 3,
    );
    expect(hidden).toBeUndefined();
  });

  it("does not throw on nested emphasis like ***x***", () => {
    const doc = "***x***";
    expect(() => decorate(doc, 0)).not.toThrow();
    const summary = summarize(decorate(doc, doc.length), doc.length);
    expect(summary.length).toBeGreaterThan(0);
  });

  it("does not throw on malformed inline code (unclosed backtick at EOF)", () => {
    const doc = "`unclosed";
    expect(() => decorate(doc, doc.length)).not.toThrow();
  });

  it("returns an empty decoration set for an empty document", () => {
    const summary = summarize(decorate("", 0), 0);
    expect(summary).toHaveLength(0);
  });
});
