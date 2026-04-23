/**
 * Tests for GFM table widget rendering.
 *
 * Off-cursor: the whole Table node is replaced by a single `<table>`
 * widget. On-cursor (cursor inside the table span): no decorations at
 * all, so raw markdown is shown for editing.
 *
 * Widget DOM is covered by a direct construction test + a real-EditorView
 * integration test that checks the mounted DOM.
 */
import { describe, it, expect } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView, type DecorationSet } from "@codemirror/view";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";

import { livePreview } from "./index";
import { tableRendering } from "./tables";
import { buildDecorations } from "./walker";
import { summarize } from "./summarize";
import { tableWidget, type TableAlignment } from "./widgets";

function decorate(doc: string, cursorPos: number): DecorationSet {
  const state = EditorState.create({
    doc,
    selection: { anchor: cursorPos },
    extensions: [markdown({ base: markdownLanguage })],
  });
  return buildDecorations(state, [{ from: 0, to: doc.length }]).decorations;
}

function tableDecos(doc: string, cursorPos: number): DecorationSet {
  const state = EditorState.create({
    doc,
    selection: { anchor: cursorPos },
    extensions: [markdown({ base: markdownLanguage }), tableRendering],
  });
  return state.field(tableRendering);
}

const TABLE = ["| h1 | h2 |", "| -- | -- |", "| a  | b  |"].join("\n");
const TRAILING = `${TABLE}\n`;

describe("table widget decorations", () => {
  it("replaces the whole Table span with a single widget off-cursor", () => {
    const doc = TRAILING;
    // Cursor at the end of the doc (past the table).
    const summary = summarize(tableDecos(doc, doc.length), doc.length);

    const tableReplaces = summary.filter(
      (d) => d.replace && d.from === 0 && d.to === TABLE.length,
    );
    expect(tableReplaces).toHaveLength(1);
  });

  it("emits no table decorations when the cursor is on a table line", () => {
    // Cursor on the header row.
    const summary = summarize(tableDecos(TRAILING, 3), TRAILING.length);
    expect(summary).toHaveLength(0);
  });

  it("skips descent — no orphan inline decorations from inside the table", () => {
    // `**bold**` inside a cell should NOT generate a bold mark when the
    // widget replaces the whole node.
    const doc = "| **bold** | h |\n| -- | -- |\n| a | b |\nafter";
    const summary = summarize(decorate(doc, doc.length), doc.length);

    const boldRanges = summary.filter(
      (d) => d.class === "cm-rendered-bold",
    );
    expect(boldRanges).toHaveLength(0);
  });
});

describe("table widget rendering", () => {
  it("renders header, rows, and alignment in the DOM", () => {
    const align: TableAlignment[] = ["left", "center", "right"];
    const widget = tableWidget({
      header: ["One", "Two", "Three"],
      rows: [
        ["a", "b", "c"],
        ["d", "e", "f"],
      ],
      alignments: align,
    });
    const spec = widget.spec as { widget: { toDOM: () => HTMLElement } };
    const dom = spec.widget.toDOM();

    expect(dom.tagName).toBe("TABLE");
    const headers = Array.from(dom.querySelectorAll("thead th"));
    expect(headers.map((h) => h.textContent)).toEqual(["One", "Two", "Three"]);
    expect((headers[0] as HTMLElement).style.textAlign).toBe("left");
    expect((headers[1] as HTMLElement).style.textAlign).toBe("center");
    expect((headers[2] as HTMLElement).style.textAlign).toBe("right");

    const rows = dom.querySelectorAll("tbody tr");
    expect(rows).toHaveLength(2);
    const firstRowCells = Array.from(rows[0].querySelectorAll("td"));
    expect(firstRowCells.map((c) => c.textContent)).toEqual(["a", "b", "c"]);
  });

  it("strips basic inline markers so cells read cleanly", () => {
    const widget = tableWidget({
      header: ["**Bold**"],
      rows: [["`code`"]],
      alignments: [null],
    });
    const spec = widget.spec as { widget: { toDOM: () => HTMLElement } };
    const dom = spec.widget.toDOM();
    const th = dom.querySelector("th");
    const td = dom.querySelector("td");
    expect(th?.textContent).toBe("Bold");
    expect(td?.textContent).toBe("code");
  });

  it("mounts inside an EditorView and resolves alignment from the separator row", () => {
    const doc = "| L | C | R |\n| :- | :-: | -: |\n| a | b | c |\nafter\n";
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

    const table = parent.querySelector("table.cm-rendered-table-widget");
    expect(table).toBeTruthy();
    const ths = Array.from(table!.querySelectorAll("th")) as HTMLElement[];
    expect(ths.map((t) => t.textContent)).toEqual(["L", "C", "R"]);
    expect(ths[0].style.textAlign).toBe("left");
    expect(ths[1].style.textAlign).toBe("center");
    expect(ths[2].style.textAlign).toBe("right");

    view.destroy();
    parent.remove();
  });
});
