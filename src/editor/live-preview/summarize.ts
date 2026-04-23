/**
 * Test helper that flattens a `DecorationSet` into an array of plain
 * summaries so tests can assert without dealing with the `RangeSet`
 * iterator API. Shared across the per-construct live-preview test files.
 */
import type { DecorationSet } from "@codemirror/view";

export interface DecoSummary {
  from: number;
  to: number;
  class: string | undefined;
  replace: boolean;
  line: boolean;
}

export function summarize(
  set: DecorationSet,
  docLength: number,
): DecoSummary[] {
  const out: DecoSummary[] = [];
  set.between(0, docLength, (from, to, value) => {
    const spec = value.spec as { class?: string; widget?: unknown };
    out.push({
      from,
      to,
      class: spec.class,
      // Replace decorations are created via `Decoration.replace({})`, which
      // leaves the spec without a class. Line decorations have a class and
      // `from === to`.
      replace: spec.class === undefined,
      line: from === to,
    });
  });
  return out;
}

export function classesAt(summary: DecoSummary[], from: number): string[] {
  return summary.filter((d) => d.from === from && d.class).map((d) => d.class!);
}
