/**
 * Tag management dialog. Lists every tag (declared + ad-hoc) with usage
 * counts. Each row supports:
 *   - inline rename (pencil icon → input → Enter commits)
 *   - color assignment from a small curated palette
 *   - deletion with a confirm step inline on the row
 *
 * Rename and delete are write-heavy operations that rewrite frontmatter
 * across the vault; mutations show a "Renamed N notes" hint in the row
 * after success.
 */
import { useMemo, useState, type FormEvent } from "react";
import { Check, Droplet, Pencil, Tag as TagIcon, Trash2, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/ds/Dialog";
import { Button } from "@/ds/Button";
import { Input } from "@/ds/Input";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/ds/DropdownMenu";
import { cn } from "@/lib/cn";
import type { TagInfo } from "@/lib/invoke";
import {
  useDeleteTag,
  useRenameTag,
  useSetTagColor,
  useTagsQuery,
} from "@/lib/queries";

const COLOR_PALETTE: ReadonlyArray<{ label: string; value: string }> = [
  { label: "Accent", value: "#fac775" },
  { label: "Sky", value: "#7aa7d6" },
  { label: "Sage", value: "#88b09a" },
  { label: "Rose", value: "#d88c9a" },
  { label: "Lilac", value: "#b699c8" },
  { label: "Slate", value: "#7b8694" },
];

interface TagManagerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TagManagerDialog({ open, onOpenChange }: TagManagerDialogProps) {
  const tagsQuery = useTagsQuery();
  const tags = useMemo(() => tagsQuery.data ?? [], [tagsQuery.data]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0">
        <DialogHeader className="border-b border-border-subtle px-5 pb-4 pt-5">
          <DialogTitle>Tags</DialogTitle>
          <DialogDescription>
            Rename or delete tags across the whole vault, or assign a color for
            quick scanning.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-auto">
          {tagsQuery.isLoading ? (
            <LoadingRows />
          ) : tags.length === 0 ? (
            <EmptyState />
          ) : (
            <ul className="flex flex-col">
              {tags.map((tag, i) => (
                <TagRow
                  key={tag.label}
                  tag={tag}
                  isLast={i === tags.length - 1}
                />
              ))}
            </ul>
          )}
        </div>

        <footer className="flex justify-end border-t border-border-subtle px-5 py-3">
          <Button variant="ghost" size="md" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}

function TagRow({ tag, isLast }: { tag: TagInfo; isLast: boolean }) {
  const [mode, setMode] = useState<"view" | "rename" | "confirm-delete">("view");
  const [draft, setDraft] = useState(tag.label);
  const [lastRewriteCount, setLastRewriteCount] = useState<number | null>(null);

  const renameTag = useRenameTag();
  const deleteTag = useDeleteTag();
  const setColor = useSetTagColor();

  function submitRename(e: FormEvent) {
    e.preventDefault();
    const next = draft.trim();
    if (!next || next === tag.label) {
      setMode("view");
      setDraft(tag.label);
      return;
    }
    renameTag.mutate(
      { oldLabel: tag.label, newLabel: next },
      {
        onSuccess: (count) => {
          setLastRewriteCount(count);
          setMode("view");
        },
      },
    );
  }

  function confirmDelete() {
    deleteTag.mutate(tag.label, {
      onSuccess: (count) => {
        setLastRewriteCount(count);
        setMode("view");
      },
    });
  }

  return (
    <li
      className={cn(
        "flex items-center gap-2 px-5 py-3",
        !isLast && "border-b border-border-subtle/60",
      )}
    >
      {mode === "rename" ? (
        <form onSubmit={submitRename} className="flex min-w-0 flex-1 items-center gap-2">
          <Input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setMode("view");
                setDraft(tag.label);
              }
            }}
            aria-label={`Rename tag ${tag.label}`}
            className="h-7 text-xs"
          />
          <Button
            variant="primary"
            size="sm"
            type="submit"
            disabled={renameTag.isPending}
          >
            {renameTag.isPending ? "Saving…" : "Rename"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            type="button"
            onClick={() => {
              setMode("view");
              setDraft(tag.label);
            }}
          >
            Cancel
          </Button>
        </form>
      ) : mode === "confirm-delete" ? (
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-sm text-fg-primary">
            Delete{" "}
            <span className="font-medium">{tag.label}</span>{" "}
            from {tag.count} note{tag.count === 1 ? "" : "s"}?
          </span>
          <Button
            variant="danger"
            size="sm"
            onClick={confirmDelete}
            disabled={deleteTag.isPending}
          >
            {deleteTag.isPending ? "Deleting…" : "Delete"}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setMode("view")}>
            Cancel
          </Button>
        </div>
      ) : (
        <>
          <TagColorChip
            color={tag.color ?? null}
            onPick={(value) =>
              setColor.mutate({ label: tag.label, color: value })
            }
          />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate text-sm font-medium text-fg-primary">
              {tag.label}
            </span>
            <span className="truncate text-2xs text-fg-muted">
              {tag.count} note{tag.count === 1 ? "" : "s"}
              {tag.declared ? "" : " · ad-hoc"}
              {lastRewriteCount !== null
                ? ` · updated ${lastRewriteCount} file${lastRewriteCount === 1 ? "" : "s"}`
                : ""}
            </span>
          </div>
          <button
            type="button"
            aria-label={`Rename ${tag.label}`}
            onClick={() => setMode("rename")}
            className="inline-flex h-7 w-7 items-center justify-center rounded text-fg-muted hover:bg-bg-elevated hover:text-fg-primary"
          >
            <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} />
          </button>
          <button
            type="button"
            aria-label={`Delete ${tag.label}`}
            onClick={() => setMode("confirm-delete")}
            className="inline-flex h-7 w-7 items-center justify-center rounded text-fg-muted hover:bg-danger/10 hover:text-danger"
          >
            <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
          </button>
        </>
      )}
    </li>
  );
}

function TagColorChip({
  color,
  onPick,
}: {
  color: string | null;
  onPick: (value: string | null) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Set color"
          className={cn(
            "inline-flex h-6 w-6 items-center justify-center rounded-full border border-border-subtle",
            "transition-colors duration-fast ease-swift hover:border-border-strong",
          )}
          style={color ? { backgroundColor: color } : undefined}
        >
          {color ? null : (
            <Droplet className="h-3 w-3 text-fg-muted" strokeWidth={1.75} />
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44">
        <DropdownMenuLabel>Color</DropdownMenuLabel>
        {COLOR_PALETTE.map((c) => (
          <DropdownMenuItem
            key={c.value}
            onSelect={() => onPick(c.value)}
            className="flex items-center gap-2"
          >
            <span
              aria-hidden
              className="h-3 w-3 rounded-full border border-border-subtle"
              style={{ backgroundColor: c.value }}
            />
            <span className="flex-1">{c.label}</span>
            {color === c.value ? (
              <Check className="h-3 w-3 text-accent" strokeWidth={2} />
            ) : null}
          </DropdownMenuItem>
        ))}
        {color ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onPick(null)}>
              <X className="h-3 w-3 text-fg-muted" strokeWidth={2} />
              Clear color
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full border border-border-subtle">
        <TagIcon className="h-4 w-4 text-fg-muted" strokeWidth={1.5} />
      </div>
      <h3 className="text-sm font-medium text-fg-primary">No tags yet</h3>
      <p className="text-xs text-fg-secondary">
        Add a tag from the metadata bar in the editor, then come back here to
        rename, recolor, or delete it.
      </p>
    </div>
  );
}

function LoadingRows() {
  return (
    <div className="flex flex-col gap-1 p-3">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-11 animate-pulse rounded border border-border-subtle bg-bg-surface"
        />
      ))}
    </div>
  );
}
