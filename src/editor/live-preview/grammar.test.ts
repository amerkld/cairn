/**
 * Guard tests: `markdownLanguage` from `@codemirror/lang-markdown` ships
 * with GFM extensions loaded. These tests lock that assumption in so a
 * future grammar swap can't silently disable GFM parsing (which would
 * make the GFM decorations in `./inline`, `./tables`, and `./task-lists`
 * all silently degrade to no-ops).
 */
import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";

function collectNodeNames(doc: string): Set<string> {
  const state = EditorState.create({
    doc,
    extensions: [markdown({ base: markdownLanguage })],
  });
  const names = new Set<string>();
  syntaxTree(state).iterate({
    from: 0,
    to: doc.length,
    enter: (node) => {
      names.add(node.name);
    },
  });
  return names;
}

describe("markdown grammar — GFM extensions", () => {
  it("parses GFM tables into Table / TableHeader / TableRow / TableCell nodes", () => {
    const doc = "| h1 | h2 |\n| -- | -- |\n| a  | b  |\n";
    const names = collectNodeNames(doc);

    expect(names.has("Table")).toBe(true);
    expect(names.has("TableHeader")).toBe(true);
    expect(names.has("TableRow")).toBe(true);
    expect(names.has("TableCell")).toBe(true);
  });

  it("parses GFM strikethrough into a Strikethrough node", () => {
    const names = collectNodeNames("~~struck~~");

    expect(names.has("Strikethrough")).toBe(true);
  });

  it("parses GFM task lists into Task nodes", () => {
    const doc = "- [ ] todo\n- [x] done\n";
    const names = collectNodeNames(doc);

    expect(names.has("Task")).toBe(true);
  });

  it("parses GFM autolinks into URL / Autolink nodes", () => {
    // Bare URLs: GFM recognises http(s), www. and email. Lezer emits a URL
    // node for both the bracketed `<…>` autolink and the GFM bare URL.
    const names = collectNodeNames("See https://example.com for details.");

    expect(names.has("URL")).toBe(true);
  });
});
