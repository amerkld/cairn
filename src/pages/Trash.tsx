/**
 * Trash page — soft-deleted notes. Two actions per row: restore (moves the
 * file back to its original path, collision-renaming if needed) and a
 * top-level "Empty trash" that permanently deletes everything in
 * `.cairn/trash/`.
 *
 * Restoration never asks for confirmation — it's non-destructive. Empty
 * Trash is destructive (files are gone for good) and gets an inline
 * confirm button.
 */
import { useState } from "react";
import { formatDistanceToNow, parseISO } from "date-fns";
import { FileText, RotateCcw, Trash2, Trash } from "lucide-react";
import { Button } from "@/ds/Button";
import { Badge } from "@/ds/Badge";
import { cn } from "@/lib/cn";
import type { TrashEntry } from "@/lib/invoke";
import { useEmptyTrash, useRestoreTrash, useTrashQuery } from "@/lib/queries";

export function TrashPage() {
  const trashQuery = useTrashQuery();
  const restore = useRestoreTrash();
  const empty = useEmptyTrash();
  const [confirmingEmpty, setConfirmingEmpty] = useState(false);
  const entries = trashQuery.data ?? [];

  return (
    <div className="mx-auto flex h-full max-w-4xl flex-col gap-8 overflow-auto px-10 py-10">
      <header className="flex items-end justify-between gap-4">
        <div>
          <div className="text-2xs uppercase tracking-wider text-fg-muted">
            Deleted
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-fg-primary">
            Trash
          </h1>
        </div>
        {entries.length > 0 ? (
          confirmingEmpty ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-fg-secondary">
                Delete all {entries.length} note{entries.length === 1 ? "" : "s"}?
              </span>
              <Button
                variant="danger"
                size="md"
                onClick={() =>
                  empty.mutate(undefined, {
                    onSuccess: () => setConfirmingEmpty(false),
                  })
                }
                disabled={empty.isPending}
              >
                {empty.isPending ? "Deleting…" : "Yes, delete"}
              </Button>
              <Button
                variant="ghost"
                size="md"
                onClick={() => setConfirmingEmpty(false)}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <Button
              variant="danger"
              size="md"
              onClick={() => setConfirmingEmpty(true)}
              className="gap-2"
            >
              <Trash className="h-4 w-4" strokeWidth={1.75} />
              Empty trash
            </Button>
          )
        ) : null}
      </header>

      <section aria-labelledby="trash-heading" className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Trash2 className="h-3.5 w-3.5 text-fg-muted" strokeWidth={1.75} />
          <h2
            id="trash-heading"
            className="text-xs font-medium uppercase tracking-wider text-fg-muted"
          >
            Deleted notes
          </h2>
          <Badge>{entries.length}</Badge>
        </div>

        {trashQuery.isLoading ? (
          <LoadingRows />
        ) : entries.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="overflow-hidden rounded-lg border border-border-subtle bg-bg-surface">
            {entries.map((entry, i) => (
              <TrashRow
                key={entry.trashedPath}
                entry={entry}
                isLast={i === entries.length - 1}
                onRestore={() => restore.mutate(entry.trashedPath)}
                restoring={restore.isPending}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function TrashRow({
  entry,
  isLast,
  onRestore,
  restoring,
}: {
  entry: TrashEntry;
  isLast: boolean;
  onRestore: () => void;
  restoring: boolean;
}) {
  return (
    <div
      className={cn(
        "group flex items-center gap-3 px-4 py-2.5",
        !isLast && "border-b border-border-subtle/60",
      )}
    >
      <FileText className="h-3.5 w-3.5 shrink-0 text-fg-muted" strokeWidth={1.75} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm text-fg-primary">
          {entry.title || "Untitled"}
        </span>
        <span className="truncate font-mono text-2xs text-fg-muted">
          {entry.originalPath}
        </span>
      </div>
      <span className="shrink-0 text-2xs text-fg-muted">
        {relativeLabel(entry.deletedAt)}
      </span>
      <button
        type="button"
        onClick={onRestore}
        disabled={restoring}
        aria-label={`Restore ${entry.title || entry.originalPath}`}
        className={cn(
          "inline-flex h-7 items-center gap-1.5 rounded px-2 text-xs",
          "border border-border-subtle bg-bg-surface text-fg-secondary",
          "transition-colors duration-fast ease-swift",
          "hover:border-border-strong hover:text-fg-primary",
          "disabled:opacity-50",
        )}
      >
        <RotateCcw className="h-3 w-3" strokeWidth={1.75} />
        Restore
      </button>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-border-subtle bg-bg-surface px-6 py-14 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full border border-border-subtle">
        <Trash2 className="h-5 w-5 text-fg-muted" strokeWidth={1.5} />
      </div>
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-medium text-fg-primary">Trash is empty</h3>
        <p className="text-xs text-fg-secondary">
          Deleted notes land here. Restore to bring them back, or empty the
          trash to remove them permanently.
        </p>
      </div>
    </div>
  );
}

function LoadingRows() {
  return (
    <div className="flex flex-col gap-2">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-12 animate-pulse rounded-lg border border-border-subtle bg-bg-surface"
        />
      ))}
    </div>
  );
}

function relativeLabel(iso: string): string {
  try {
    return formatDistanceToNow(parseISO(iso), { addSuffix: true });
  } catch {
    return "";
  }
}
