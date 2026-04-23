import { useMemo, useState } from "react";
import {
  MoreHorizontal,
  Plus,
  Inbox,
  Clock,
  FolderKanban,
  Trash2,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Button } from "@/ds/Button";
import { Badge } from "@/ds/Badge";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/ds/DropdownMenu";
import { cn } from "@/lib/cn";
import type { NoteRef } from "@/lib/invoke";
import {
  useCreateCapture,
  useMoveNote,
  useTreeQuery,
  useTrashNote,
} from "@/lib/queries";
import { useRoute } from "@/shell/routing";
import { TagFilter } from "@/tags/TagFilter";
import { applyTagFilter } from "@/tags/filter";
import { MoveToProjectDialog } from "./MoveToProjectDialog";

export function Captures() {
  const tree = useTreeQuery();
  const createCapture = useCreateCapture();
  const moveNote = useMoveNote();
  const route = useRoute();

  const captures = useMemo(() => tree.data?.captures ?? [], [tree.data?.captures]);
  const projects = tree.data?.projects ?? [];
  const trashNote = useTrashNote();

  const [moveTarget, setMoveTarget] = useState<NoteRef | null>(null);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const visibleCaptures = useMemo(
    () => applyTagFilter(captures, tagFilter),
    [captures, tagFilter],
  );

  function openNote(notePath: string) {
    route.navigate({ page: "editor", notePath, returnTo: { page: "captures" } });
  }

  return (
    <div className="flex h-full flex-col">
      <Header
        count={captures.length}
        onNew={() =>
          createCapture.mutate(undefined, {
            onSuccess: (note) => openNote(note.path),
          })
        }
        isCreating={createCapture.isPending}
      />
      <div className="flex w-full flex-col gap-4 px-10 pb-4">
        <TagFilter selected={tagFilter} onSelect={setTagFilter} />
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-10 pb-10">
        {tree.isLoading ? (
          <LoadingGrid />
        ) : captures.length === 0 ? (
          <EmptyState />
        ) : visibleCaptures.length === 0 ? (
          <FilteredEmpty tagLabel={tagFilter ?? ""} onClear={() => setTagFilter(null)} />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {visibleCaptures.map((capture) => (
              <CaptureCard
                key={capture.path}
                note={capture}
                onOpen={() => openNote(capture.path)}
                onMoveSomeday={() =>
                  moveNote.mutate({ src: capture.path, target: "someday" })
                }
                onMoveToProject={() => setMoveTarget(capture)}
                onTrash={() => trashNote.mutate(capture.path)}
              />
            ))}
          </div>
        )}
      </div>
      <MoveToProjectDialog
        open={moveTarget !== null}
        onOpenChange={(open) => {
          if (!open) setMoveTarget(null);
        }}
        capturePath={moveTarget?.path ?? ""}
        captureTitle={moveTarget?.title ?? ""}
        projects={projects}
      />
    </div>
  );
}

function Header({
  count,
  onNew,
  isCreating,
}: {
  count: number;
  onNew: () => void;
  isCreating: boolean;
}) {
  return (
    <header className="flex w-full items-end justify-between gap-4 px-10 pb-6 pt-10">
      <div className="flex flex-col gap-1">
        <div className="text-2xs uppercase tracking-wider text-fg-muted">Inbox</div>
        <div className="flex items-baseline gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-fg-primary">Captures</h1>
          <Badge>{count}</Badge>
        </div>
      </div>
      <Button
        variant="primary"
        size="md"
        onClick={onNew}
        disabled={isCreating}
        className="gap-2"
      >
        <Plus className="h-4 w-4" strokeWidth={1.75} />
        New capture
      </Button>
    </header>
  );
}

function CaptureCard({
  note,
  onOpen,
  onMoveSomeday,
  onMoveToProject,
  onTrash,
}: {
  note: NoteRef;
  onOpen: () => void;
  onMoveSomeday: () => void;
  onMoveToProject: () => void;
  onTrash: () => void;
}) {
  const createdLabel = note.createdAt
    ? formatDistanceToNow(new Date(note.createdAt), { addSuffix: true })
    : null;
  const preview = note.preview?.trim();

  return (
    <article
      className={cn(
        "group relative flex h-44 min-w-0 flex-col rounded-lg border border-border-subtle",
        "bg-bg-surface p-4 text-left",
        "transition-colors duration-fast ease-swift",
        "hover:border-border-strong focus-within:border-border-strong",
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Open ${note.title || "Untitled"}`}
        className="absolute inset-0 rounded-lg"
      />
      <header className="relative mb-2 flex min-w-0 items-start gap-2">
        <h3 className="min-w-0 flex-1 truncate text-sm font-medium text-fg-primary">
          {note.title || "Untitled"}
        </h3>
        <CardMenu
          onMoveSomeday={onMoveSomeday}
          onMoveToProject={onMoveToProject}
          onTrash={onTrash}
        />
      </header>
      <p className="relative min-h-0 flex-1 overflow-hidden text-xs leading-relaxed text-fg-secondary pointer-events-none">
        {preview && preview.length > 0 ? preview : (
          <span className="text-fg-muted">No content yet</span>
        )}
      </p>
      <footer className="relative mt-3 flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap gap-1">
          {note.tags.slice(0, 3).map((t) => (
            <Badge key={t}>{t}</Badge>
          ))}
          {note.tags.length > 3 ? (
            <span className="text-2xs text-fg-muted">+{note.tags.length - 3}</span>
          ) : null}
        </div>
        {createdLabel ? (
          <time className="shrink-0 text-2xs text-fg-muted">{createdLabel}</time>
        ) : null}
      </footer>
    </article>
  );
}

function CardMenu({
  onMoveSomeday,
  onMoveToProject,
  onTrash,
}: {
  onMoveSomeday: () => void;
  onMoveToProject: () => void;
  onTrash: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="More actions"
          className={cn(
            "inline-flex h-7 w-7 items-center justify-center rounded",
            "text-fg-muted opacity-0",
            "transition-opacity duration-fast ease-swift",
            "hover:bg-bg-elevated hover:text-fg-primary",
            "group-hover:opacity-100 focus-visible:opacity-100",
            "data-[state=open]:opacity-100",
          )}
        >
          <MoreHorizontal className="h-4 w-4" strokeWidth={1.75} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={onMoveToProject}>
          <FolderKanban className="h-4 w-4 text-fg-muted" strokeWidth={1.75} />
          Move to project…
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onMoveSomeday}>
          <Clock className="h-4 w-4 text-fg-muted" strokeWidth={1.75} />
          Move to Someday
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={onTrash}
          className="text-danger data-[highlighted]:text-danger"
        >
          <Trash2 className="h-4 w-4 text-danger/80" strokeWidth={1.75} />
          Trash
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function FilteredEmpty({
  tagLabel,
  onClear,
}: {
  tagLabel: string;
  onClear: () => void;
}) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-14 text-center">
      <p className="text-sm text-fg-secondary">
        No captures tagged{" "}
        <span className="font-medium text-fg-primary">#{tagLabel}</span>.
      </p>
      <Button variant="ghost" size="sm" onClick={onClear}>
        Clear filter
      </Button>
    </div>
  );
}

function LoadingGrid() {
  return (
    <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          aria-hidden
          className="h-44 animate-pulse rounded-lg border border-border-subtle bg-bg-surface"
        />
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-5 py-20 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full border border-border-subtle bg-bg-surface">
        <Inbox className="h-6 w-6 text-fg-muted" strokeWidth={1.5} />
      </div>
      <div className="flex flex-col gap-1.5">
        <h2 className="text-base font-medium text-fg-primary">Captures is empty</h2>
        <p className="text-sm text-fg-secondary">
          Drop any thought here to deal with later. Cairn won't sort it for you —
          you can file it into a project, park it in Someday, or let it sit.
        </p>
      </div>
      <p className="text-2xs uppercase tracking-wider text-fg-muted">
        Tip · <kbd className="font-mono">Ctrl</kbd>+<kbd className="font-mono">N</kbd> from anywhere
      </p>
    </div>
  );
}
