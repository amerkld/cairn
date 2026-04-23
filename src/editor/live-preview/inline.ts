/**
 * Visitors for inline markdown constructs: bold, italic, inline code, and
 * the shared marker-hiding rule that covers `EmphasisMark` and `CodeMark`.
 */
import { type SyntaxNodeRef } from "@lezer/common";

import {
  boldMark,
  inlineCodeMark,
  italicMark,
  linkText,
  strikethroughMark,
} from "./decorations";
import { noteDirectory } from "./facets";
import { type BuildContext } from "./types";
import { imageWidget } from "./widgets";

export function visitStrongEmphasis(
  node: SyntaxNodeRef,
  ctx: BuildContext,
): void {
  ctx.ranges.push(boldMark.range(node.from, node.to));
}

export function visitEmphasis(
  node: SyntaxNodeRef,
  ctx: BuildContext,
): void {
  ctx.ranges.push(italicMark.range(node.from, node.to));
}

/** GFM `~~text~~`. Markers are hidden off-cursor by `visitInlineMark`. */
export function visitStrikethrough(
  node: SyntaxNodeRef,
  ctx: BuildContext,
): void {
  ctx.ranges.push(strikethroughMark.range(node.from, node.to));
}

/**
 * GFM bare URL (`https://…`, `www.…`, email). Lezer emits a `URL` node for
 * both this and the URL part of a regular `[text](url)` link — the latter
 * is already hidden by `visitLink`, so only decorate URLs that aren't
 * children of a Link or Image node.
 */
export function visitURL(node: SyntaxNodeRef, ctx: BuildContext): void {
  const parent = node.node.parent;
  const parentName = parent?.name;
  if (parentName === "Link" || parentName === "Image") return;
  if (node.to > node.from) {
    ctx.ranges.push(linkText.range(node.from, node.to));
  }
}

/**
 * Style only the inner range between the opening and closing backticks.
 * Covering the whole span would align the style's edges with the replaced
 * (hidden) backticks and cause the visible text to lose its
 * background/monospace treatment.
 */
export function visitInlineCode(
  node: SyntaxNodeRef,
  ctx: BuildContext,
): void {
  const first = node.node.firstChild;
  const last = node.node.lastChild;
  const innerFrom = first?.name === "CodeMark" ? first.to : node.from;
  const innerTo = last?.name === "CodeMark" ? last.from : node.to;
  if (innerTo > innerFrom) {
    ctx.ranges.push(inlineCodeMark.range(innerFrom, innerTo));
  }
}

/**
 * EmphasisMark and CodeMark share visibility rules:
 * - Fence markers inside `FencedCode` / `CodeBlock`: hidden unless the cursor
 *   is on the fence line (line-level visibility).
 * - Inline markers: hidden unless the cursor is inside (or at the edges of)
 *   the surrounding construct (range-level visibility). Elsewhere on the
 *   line the markers stay hidden so the rendered text reads cleanly.
 */
export function visitInlineMark(
  node: SyntaxNodeRef,
  ctx: BuildContext,
): void {
  const parent = node.node.parent;
  const parentName = parent?.name;
  if (parentName === "FencedCode" || parentName === "CodeBlock") {
    const line = ctx.state.doc.lineAt(node.from);
    if (line.number === ctx.cursorLine) return;
  } else if (parent) {
    if (ctx.head >= parent.from && ctx.head <= parent.to) return;
  }
  if (node.to > node.from) {
    ctx.pushHide(node.from, node.to);
  }
}

/**
 * Find the first `[` and matching `]` among a node's LinkMark children. Used
 * by both link and image visitors to locate the bracketed text segment.
 */
function findBracketPair(
  node: SyntaxNodeRef,
  ctx: BuildContext,
): { open: { from: number; to: number }; close: { from: number; to: number } } | null {
  let open: { from: number; to: number } | null = null;
  let close: { from: number; to: number } | null = null;

  for (let c = node.node.firstChild; c; c = c.nextSibling) {
    if (c.name !== "LinkMark") continue;
    const text = ctx.state.doc.sliceString(c.from, c.to);
    if (text === "[" && !open) {
      open = { from: c.from, to: c.to };
    } else if (text === "]" && open && !close) {
      close = { from: c.from, to: c.to };
      break;
    }
  }

  return open && close ? { open, close } : null;
}

/**
 * Link `[text](url)`: off-cursor, hide `[`, hide everything from `]` through
 * the end of the link, and apply `cm-rendered-link` to the visible text.
 *
 * Cursor-inside-the-link is handled in the walker, which skips descent so
 * `visitLink` is only called for the off-cursor case. When descent is
 * allowed, inline formatting inside the link text (e.g. `[**bold**](url)`)
 * is emitted by the inline emphasis visitors in the same walk and layers
 * on top of `cm-rendered-link`.
 */
export function visitLink(node: SyntaxNodeRef, ctx: BuildContext): void {
  const pair = findBracketPair(node, ctx);
  if (!pair) return;

  ctx.pushHide(pair.open.from, pair.open.to);
  ctx.pushHide(pair.close.from, node.to);
  if (pair.close.from > pair.open.to) {
    ctx.ranges.push(linkText.range(pair.open.to, pair.close.from));
  }
}

/**
 * Image `![alt](url)`: off-cursor, replace the entire node with an `<img>`
 * widget loading the referenced image. Relative URLs are resolved against
 * the `noteDirectory` facet value via Tauri's asset protocol; HTTP(S)
 * URLs load directly. Cursor-inside is handled in the walker — descent
 * is skipped so the raw source stays visible for editing.
 */
export function visitImage(node: SyntaxNodeRef, ctx: BuildContext): void {
  let open: { from: number; to: number } | null = null;
  let close: { from: number; to: number } | null = null;
  let src = "";

  for (let c = node.node.firstChild; c; c = c.nextSibling) {
    if (c.name === "LinkMark") {
      const text = ctx.state.doc.sliceString(c.from, c.to);
      if (text === "[" && !open) open = { from: c.from, to: c.to };
      else if (text === "]" && open && !close) {
        close = { from: c.from, to: c.to };
      }
    } else if (c.name === "URL") {
      src = ctx.state.doc.sliceString(c.from, c.to);
    }
  }

  const alt =
    open && close && close.from > open.to
      ? ctx.state.doc.sliceString(open.to, close.from)
      : "";

  const noteDir = ctx.state.facet(noteDirectory);
  const widget = imageWidget(src, alt, noteDir).range(node.from, node.to);
  ctx.ranges.push(widget);
  ctx.atomicRanges.push(widget);
}
