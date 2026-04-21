/**
 * Shared tag-filter chip row. Renders as a horizontal scroll of chips;
 * selecting a chip narrows the current list to notes tagged with that
 * label. Selecting an already-active chip clears the filter. A "Manage"
 * button at the right opens the TagManagerDialog.
 *
 * This is a display-only component: the filter state lives in the host
 * page, since the same selection also controls the filtering logic there.
 */
import { useState } from "react";
import { Tags, Settings2 } from "lucide-react";
import { cn } from "@/lib/cn";
import type { TagInfo } from "@/lib/invoke";
import { useTagsQuery } from "@/lib/queries";
import { TagManagerDialog } from "./TagManagerDialog";

interface TagFilterProps {
  selected: string | null;
  onSelect: (label: string | null) => void;
  /** Show only tags actually used (count > 0). Manage dialog still shows all. */
  onlyUsed?: boolean;
}

export function TagFilter({ selected, onSelect, onlyUsed = true }: TagFilterProps) {
  const tagsQuery = useTagsQuery();
  const [manageOpen, setManageOpen] = useState(false);
  const tags = tagsQuery.data ?? [];
  const filterable = onlyUsed ? tags.filter((t) => t.count > 0) : tags;

  return (
    <>
      <div className="flex items-center gap-2">
        <Tags className="h-3.5 w-3.5 shrink-0 text-fg-muted" strokeWidth={1.75} />
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          {filterable.length === 0 ? (
            <span className="text-2xs text-fg-muted">No tags yet</span>
          ) : (
            filterable.map((tag) => (
              <TagChip
                key={tag.label}
                tag={tag}
                active={selected === tag.label}
                onClick={() => onSelect(selected === tag.label ? null : tag.label)}
              />
            ))
          )}
          {selected ? (
            <button
              type="button"
              onClick={() => onSelect(null)}
              className={cn(
                "rounded-sm px-1.5 py-0.5 text-2xs",
                "text-fg-muted transition-colors duration-fast ease-swift hover:text-fg-primary",
              )}
            >
              Clear
            </button>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => setManageOpen(true)}
          aria-label="Manage tags"
          className={cn(
            "inline-flex h-7 items-center gap-1.5 rounded border border-border-subtle",
            "bg-bg-surface px-2 text-2xs text-fg-secondary",
            "transition-colors duration-fast ease-swift",
            "hover:border-border-strong hover:text-fg-primary",
          )}
        >
          <Settings2 className="h-3 w-3" strokeWidth={1.75} />
          <span>Manage</span>
        </button>
      </div>

      <TagManagerDialog open={manageOpen} onOpenChange={setManageOpen} />
    </>
  );
}

function TagChip({
  tag,
  active,
  onClick,
}: {
  tag: TagInfo;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm border px-1.5 py-0.5 text-2xs",
        "transition-colors duration-fast ease-swift",
        active
          ? "border-accent-muted bg-accent-muted/30 text-accent"
          : "border-border-subtle bg-bg-elevated text-fg-secondary hover:border-border-strong hover:text-fg-primary",
      )}
    >
      {tag.color ? (
        <span
          aria-hidden
          className="h-2 w-2 rounded-full"
          style={{ backgroundColor: tag.color }}
        />
      ) : null}
      <span className="font-medium">{tag.label}</span>
      <span className="text-fg-muted">{tag.count}</span>
    </button>
  );
}
