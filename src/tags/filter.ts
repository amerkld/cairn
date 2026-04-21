/**
 * Shared helper for applying a tag filter to a list of `NoteRef`-shaped
 * items. Used by Captures/Someday pages and the project docs browser so
 * the filter semantics stay identical everywhere.
 *
 * Single-tag filter for Phase 1: `selected` is one label or null. Multi-tag
 * filtering can layer on top later without changing the call sites.
 */
import type { NoteRef } from "@/lib/invoke";

export function applyTagFilter<T extends { tags?: string[] }>(
  items: T[],
  selected: string | null,
): T[] {
  if (!selected) return items;
  return items.filter((item) => (item.tags ?? []).includes(selected));
}

export function noteHasTag(note: NoteRef, label: string): boolean {
  return note.tags.includes(label);
}
