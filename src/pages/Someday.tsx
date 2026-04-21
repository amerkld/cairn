/**
 * Someday — GTD "parking lot" for notes you want to revisit. Each note
 * can carry a `remind_at` frontmatter field that the Rust scheduler polls;
 * when it passes, the OS notification fires and the note surfaces on
 * Home's Due section.
 */
import { useMemo, useState } from "react";
import {
  BellRing,
  BellOff,
  Clock,
  MoreHorizontal,
  Plus,
  ArrowRight,
  Trash2,
} from "lucide-react";
import { addDays, format, formatDistanceToNow, parseISO, setHours, setMinutes, setSeconds } from "date-fns";
import { Button } from "@/ds/Button";
import { Badge } from "@/ds/Badge";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/ds/DropdownMenu";
import { cn } from "@/lib/cn";
import type { NoteRef } from "@/lib/invoke";
import {
  useCreateSomeday,
  useSetRemindAt,
  useTrashNote,
  useTreeQuery,
} from "@/lib/queries";
import { useRoute } from "@/shell/routing";
import { TagFilter } from "@/tags/TagFilter";
import { applyTagFilter } from "@/tags/filter";

interface Preset {
  label: string;
  /** Offset from "today 9am local" — measured in days. */
  days: number;
}

const PRESETS: ReadonlyArray<Preset> = [
  { label: "Tomorrow", days: 1 },
  { label: "In 3 days", days: 3 },
  { label: "In a week", days: 7 },
  { label: "In two weeks", days: 14 },
  { label: "In a month", days: 30 },
];

export function Someday() {
  const treeQuery = useTreeQuery();
  const createSomeday = useCreateSomeday();
  const setRemindAt = useSetRemindAt();
  const trashNote = useTrashNote();
  const route = useRoute();
  const notes = useMemo(
    () => treeQuery.data?.someday ?? [],
    [treeQuery.data?.someday],
  );
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const visibleNotes = useMemo(
    () => applyTagFilter(notes, tagFilter),
    [notes, tagFilter],
  );

  function newSomeday() {
    createSomeday.mutate(undefined, {
      onSuccess: (note) => {
        route.navigate({
          page: "editor",
          notePath: note.path,
          returnTo: "someday",
        });
      },
    });
  }

  return (
    <div className="mx-auto flex h-full max-w-4xl flex-col gap-8 overflow-auto px-10 py-10">
      <header className="flex items-end justify-between gap-4">
        <div>
          <div className="text-2xs uppercase tracking-wider text-fg-muted">Parked</div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-fg-primary">
            Someday
          </h1>
        </div>
        <Button
          variant="primary"
          size="md"
          onClick={newSomeday}
          disabled={createSomeday.isPending}
          className="gap-2"
        >
          <Plus className="h-4 w-4" strokeWidth={1.75} />
          {createSomeday.isPending ? "Creating…" : "New someday"}
        </Button>
      </header>

      <section aria-labelledby="someday-heading" className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Clock className="h-3.5 w-3.5 text-fg-muted" strokeWidth={1.75} />
          <h2
            id="someday-heading"
            className="text-xs font-medium uppercase tracking-wider text-fg-muted"
          >
            Parked notes
          </h2>
          <Badge>{notes.length}</Badge>
        </div>
        <TagFilter selected={tagFilter} onSelect={setTagFilter} />
        {treeQuery.isLoading ? (
          <LoadingRows />
        ) : notes.length === 0 ? (
          <EmptyState onNew={newSomeday} isCreating={createSomeday.isPending} />
        ) : visibleNotes.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-border-subtle bg-bg-surface px-6 py-10 text-center">
            <p className="text-sm text-fg-secondary">
              No parked notes tagged{" "}
              <span className="font-medium text-fg-primary">#{tagFilter}</span>.
            </p>
            <Button variant="ghost" size="sm" onClick={() => setTagFilter(null)}>
              Clear filter
            </Button>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border-subtle bg-bg-surface">
            {visibleNotes.map((note, i) => (
              <SomedayRow
                key={note.path}
                note={note}
                isLast={i === visibleNotes.length - 1}
                onSetRemind={(iso) =>
                  setRemindAt.mutate({ path: note.path, remindAt: iso })
                }
                onTrash={() => trashNote.mutate(note.path)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function SomedayRow({
  note,
  isLast,
  onSetRemind,
  onTrash,
}: {
  note: NoteRef;
  isLast: boolean;
  onSetRemind: (iso: string | null) => void;
  onTrash: () => void;
}) {
  const route = useRoute();
  return (
    <div
      className={cn(
        "group flex items-center gap-3 px-3 py-2.5",
        !isLast && "border-b border-border-subtle/60",
        "transition-colors duration-fast ease-swift hover:bg-bg-elevated/40",
      )}
    >
      <button
        type="button"
        onClick={() =>
          route.navigate({
            page: "editor",
            notePath: note.path,
            returnTo: "someday",
          })
        }
        className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left"
      >
        <span className="truncate text-sm text-fg-primary">
          {note.title || "Untitled"}
        </span>
        {note.preview ? (
          <span className="truncate text-xs text-fg-muted">{note.preview}</span>
        ) : null}
      </button>

      <div className="flex shrink-0 items-center gap-2">
        {note.remindAt ? (
          <Badge tone="accent" className="gap-1">
            <BellRing className="h-3 w-3" strokeWidth={1.75} />
            {relativeRemind(note.remindAt)}
          </Badge>
        ) : null}
        <ReminderMenu
          current={note.remindAt ?? null}
          onPreset={(days) => onSetRemind(computePresetIso(days))}
          onClear={() => onSetRemind(null)}
        />
        <RowOverflow onTrash={onTrash} />
      </div>

      <ArrowRight
        className="h-3.5 w-3.5 shrink-0 text-fg-muted opacity-0 transition-opacity duration-fast ease-swift group-hover:opacity-100"
        strokeWidth={1.75}
      />
    </div>
  );
}

function RowOverflow({ onTrash }: { onTrash: () => void }) {
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

function ReminderMenu({
  current,
  onPreset,
  onClear,
}: {
  current: string | null;
  onPreset: (days: number) => void;
  onClear: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex h-7 items-center gap-1.5 rounded px-2 text-xs",
            "border border-border-subtle bg-bg-surface text-fg-secondary",
            "transition-colors duration-fast ease-swift",
            "hover:border-border-strong hover:text-fg-primary",
            "data-[state=open]:border-border-strong data-[state=open]:text-fg-primary",
          )}
        >
          <BellRing className="h-3 w-3" strokeWidth={1.75} />
          <span>{current ? "Change reminder" : "Remind me"}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel>Remind me…</DropdownMenuLabel>
        {PRESETS.map((preset) => (
          <DropdownMenuItem
            key={preset.label}
            onSelect={() => onPreset(preset.days)}
          >
            <span className="flex-1">{preset.label}</span>
            <span className="text-2xs text-fg-muted">
              {format(computePresetDate(preset.days), "MMM d")}
            </span>
          </DropdownMenuItem>
        ))}
        {current ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onClear}>
              <BellOff className="h-3.5 w-3.5 text-fg-muted" strokeWidth={1.75} />
              Clear reminder
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
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

function EmptyState({
  onNew,
  isCreating,
}: {
  onNew: () => void;
  isCreating: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-5 rounded-lg border border-border-subtle bg-bg-surface px-6 py-14 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full border border-border-subtle">
        <Clock className="h-5 w-5 text-fg-muted" strokeWidth={1.5} />
      </div>
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-medium text-fg-primary">Nothing parked</h3>
        <p className="text-xs text-fg-secondary">
          Park ideas and not-yet-actionable thoughts here. Set a reminder and
          Cairn will nudge you when it's time to revisit.
        </p>
      </div>
      <Button
        variant="primary"
        size="sm"
        onClick={onNew}
        disabled={isCreating}
        className="gap-1.5"
      >
        <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
        Park a thought
      </Button>
    </div>
  );
}

// ─── helpers ─────────────────────────────────────────────────────────────

/**
 * Preset N-days-from-now set to 9am local time — a sensible default for
 * reminders. Users who want a different time can edit the frontmatter
 * directly (future milestone: a custom date/time picker).
 */
function computePresetDate(days: number): Date {
  const base = addDays(new Date(), days);
  return setSeconds(setMinutes(setHours(base, 9), 0), 0);
}

function computePresetIso(days: number): string {
  return computePresetDate(days).toISOString();
}

function relativeRemind(iso: string): string {
  try {
    return formatDistanceToNow(parseISO(iso), { addSuffix: true });
  } catch {
    return "soon";
  }
}
