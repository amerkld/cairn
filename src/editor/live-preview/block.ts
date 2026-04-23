/**
 * Visitors for block-level markdown constructs: ATX headings, thematic
 * breaks, fenced and indented code blocks.
 */
import { type SyntaxNodeRef } from "@lezer/common";

import {
  blockquoteLine,
  codeBlockFirstLine,
  codeBlockLastLine,
  codeBlockLine,
  headingLine,
  hrLine,
  listItemLine,
  listMarker,
} from "./decorations";
import { type BuildContext } from "./types";
import { bulletWidget, taskCheckbox } from "./widgets";

/** Apply the per-level heading line class. Descent continues into children. */
export function visitATXHeading(node: SyntaxNodeRef, ctx: BuildContext): void {
  const level = Number(node.name.slice("ATXHeading".length));
  const deco = headingLine[level];
  if (!deco) return;
  const line = ctx.state.doc.lineAt(node.from);
  ctx.ranges.push(deco.range(line.from));
}

/**
 * Hide the `#+` prefix plus the trailing space when the cursor is on another
 * line. The caller only routes here for HeaderMark nodes nested inside an
 * ATXHeading.
 */
export function visitHeaderMark(node: SyntaxNodeRef, ctx: BuildContext): void {
  const line = ctx.state.doc.lineAt(node.from);
  if (line.number === ctx.cursorLine) return;
  let end = node.to;
  if (ctx.state.doc.sliceString(end, end + 1) === " ") end += 1;
  ctx.pushHide(node.from, end);
}

/** Apply the HR line class + hide the raw dashes off-cursor. */
export function visitHorizontalRule(
  node: SyntaxNodeRef,
  ctx: BuildContext,
): void {
  const line = ctx.state.doc.lineAt(node.from);
  if (line.number === ctx.cursorLine) return;
  ctx.ranges.push(hrLine.range(line.from));
  if (line.to > line.from) {
    ctx.pushHide(line.from, line.to);
  }
}

/**
 * Apply code-block line classes to every line in a fenced or indented block.
 * For unclosed fenced blocks (fewer than two CodeMark children), extend the
 * styled range to EOF per CommonMark so an in-progress block renders
 * immediately as the user types.
 */
export function visitCodeBlock(node: SyntaxNodeRef, ctx: BuildContext): void {
  const { state } = ctx;
  const startLine = state.doc.lineAt(node.from).number;
  // `node.to` is exclusive; step back one char so a block that ends exactly
  // at a line break doesn't claim the next line.
  const endOffset = node.to > node.from ? node.to - 1 : node.from;
  let endLine = state.doc.lineAt(endOffset).number;

  if (node.name === "FencedCode") {
    let markCount = 0;
    for (let c = node.node.firstChild; c; c = c.nextSibling) {
      if (c.name === "CodeMark") {
        markCount += 1;
        if (markCount >= 2) break;
      }
    }
    if (markCount < 2) {
      endLine = state.doc.lines;
    }
  }

  for (let ln = startLine; ln <= endLine; ln++) {
    const line = state.doc.line(ln);
    ctx.ranges.push(codeBlockLine.range(line.from));
    if (ln === startLine) {
      ctx.ranges.push(codeBlockFirstLine.range(line.from));
    }
    if (ln === endLine) {
      ctx.ranges.push(codeBlockLastLine.range(line.from));
    }
  }
}

/**
 * Apply a blockquote line class to every line the quote spans. Nested
 * quotes (`>> quote`) result in the inner `Blockquote` node also being
 * visited; the line class stacks harmlessly and the `>` markers for both
 * levels are hidden by `visitQuoteMark` off-cursor.
 */
export function visitBlockquote(
  node: SyntaxNodeRef,
  ctx: BuildContext,
): void {
  const startLine = ctx.state.doc.lineAt(node.from).number;
  const endOffset = node.to > node.from ? node.to - 1 : node.from;
  const endLine = ctx.state.doc.lineAt(endOffset).number;
  for (let ln = startLine; ln <= endLine; ln++) {
    const line = ctx.state.doc.line(ln);
    ctx.ranges.push(blockquoteLine.range(line.from));
  }
}

/** Hide the `>` prefix (plus trailing space) off-cursor, show on-cursor. */
export function visitQuoteMark(
  node: SyntaxNodeRef,
  ctx: BuildContext,
): void {
  const line = ctx.state.doc.lineAt(node.from);
  if (line.number === ctx.cursorLine) return;
  let end = node.to;
  if (ctx.state.doc.sliceString(end, end + 1) === " ") end += 1;
  ctx.pushHide(node.from, end);
}

/**
 * Apply a per-item line class so the theme can indent the line. Multi-line
 * items (soft-wrapped paragraphs, nested lists) extend the class across
 * every line the item spans.
 */
export function visitListItem(
  node: SyntaxNodeRef,
  ctx: BuildContext,
): void {
  const startLine = ctx.state.doc.lineAt(node.from).number;
  const endOffset = node.to > node.from ? node.to - 1 : node.from;
  const endLine = ctx.state.doc.lineAt(endOffset).number;
  for (let ln = startLine; ln <= endLine; ln++) {
    const line = ctx.state.doc.line(ln);
    ctx.ranges.push(listItemLine.range(line.from));
  }
}

/**
 * Style the list marker. Unordered markers (`-` / `*` / `+`) are visually
 * replaced by a real bullet widget off-cursor; the source text is
 * untouched. On the cursor's line, the raw character stays visible so the
 * user can edit it (including converting to an ordered list).
 *
 * Ordered markers (`1.`, `2.`, …) always stay raw — replacing them would
 * lose the number and make nested numbering unscannable.
 *
 * Task-list items (GFM) also include a ListMark; the task-list widget
 * replaces the entire `- [ ]` range and wins over this decoration.
 */
export function visitListMark(
  node: SyntaxNodeRef,
  ctx: BuildContext,
): void {
  if (node.to <= node.from) return;
  const text = ctx.state.doc.sliceString(node.from, node.to);
  const isUnordered = text === "-" || text === "*" || text === "+";
  const line = ctx.state.doc.lineAt(node.from);
  const onCursorLine = line.number === ctx.cursorLine;

  if (isUnordered && !onCursorLine) {
    const range = bulletWidget.range(node.from, node.to);
    ctx.ranges.push(range);
    ctx.atomicRanges.push(range);
    return;
  }

  ctx.ranges.push(listMarker.range(node.from, node.to));
}

/**
 * Replace the raw `[ ]` / `[x]` with a clickable checkbox widget when the
 * cursor is off the task line. On the task line the marker stays visible
 * so keyboard editing of the brackets works.
 */
export function visitTaskMarker(
  node: SyntaxNodeRef,
  ctx: BuildContext,
): void {
  const line = ctx.state.doc.lineAt(node.from);
  if (line.number === ctx.cursorLine) return;

  const text = ctx.state.doc.sliceString(node.from, node.to);
  const checked = text === "[x]" || text === "[X]";
  const range = taskCheckbox(checked).range(node.from, node.to);
  ctx.ranges.push(range);
  ctx.atomicRanges.push(range);
}
