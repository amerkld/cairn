/**
 * Home dashboard — Cairn's daily driver surface.
 *
 * Sections:
 *   - Due: actions whose `deadline` is today or earlier, or whose `remind_at`
 *     is in the past.
 *   - Actions: everything else, grouped by project, drag-sortable. The
 *     sortable order is persisted to `.cairn/state.json` via `reorder_actions`.
 *
 * Completing an action opens a dialog for an optional reflection note; the
 * action is then moved into its project's `Archive/` directory with
 * `completed_at` and `complete_note` stamped into its frontmatter.
 */
import { useMemo, useState, type CSSProperties, type HTMLAttributes } from "react";
import { formatDistanceToNow, parseISO } from "date-fns";
import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Calendar,
  CheckCircle2,
  Circle,
  GripVertical,
  ListTodo,
} from "lucide-react";
import { Badge, Button } from "@/ds";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/ds/Dialog";
import { cn } from "@/lib/cn";
import type { HomeAction } from "@/lib/invoke";
import {
  useCompleteAction,
  useHomeActionsQuery,
  useReorderActions,
} from "@/lib/queries";
import { useRoute } from "@/shell/routing";

export function Home() {
  const actionsQuery = useHomeActionsQuery();
  const reorder = useReorderActions();
  const actions = useMemo(() => actionsQuery.data ?? [], [actionsQuery.data]);
  const [completing, setCompleting] = useState<HomeAction | null>(null);

  const { dueActions, activeActions } = useMemo(() => partitionByDue(actions), [actions]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = activeActions.findIndex((a) => a.action.path === active.id);
    const newIndex = activeActions.findIndex((a) => a.action.path === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(activeActions, oldIndex, newIndex);
    const mergedOrder = [
      ...dueActions.map((a) => a.action.path),
      ...reordered.map((a) => a.action.path),
    ];
    reorder.mutate(mergedOrder);
  }

  const grouped = useMemo(() => groupByProject(activeActions), [activeActions]);

  return (
    <div className="flex h-full flex-col gap-8 px-10 py-10">
      <Header />
      {actionsQuery.isLoading ? (
        <LoadingRows />
      ) : actions.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <DueSection actions={dueActions} onComplete={setCompleting} />
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <ActionsSection
              groups={grouped}
              onComplete={setCompleting}
              orderedPaths={activeActions.map((a) => a.action.path)}
            />
          </DndContext>
        </>
      )}
      <CompleteDialog
        action={completing}
        onClose={() => setCompleting(null)}
      />
    </div>
  );
}

function Header() {
  return (
    <header className="flex items-end justify-between gap-4">
      <div>
        <div className="text-2xs uppercase tracking-wider text-fg-muted">Today</div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-fg-primary">Home</h1>
      </div>
    </header>
  );
}

function DueSection({
  actions,
  onComplete,
}: {
  actions: HomeAction[];
  onComplete: (a: HomeAction) => void;
}) {
  return (
    <section aria-labelledby="due-heading" className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <h2
          id="due-heading"
          className="text-xs font-medium uppercase tracking-wider text-fg-muted"
        >
          Due
        </h2>
        <Badge tone={actions.length > 0 ? "accent" : "neutral"}>{actions.length}</Badge>
      </div>
      {actions.length === 0 ? (
        <div className="rounded-lg border border-border-subtle bg-bg-surface px-5 py-6 text-center text-sm text-fg-muted">
          Nothing due. Enjoy the quiet.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border-subtle bg-bg-surface">
          {actions.map((entry, i) => (
            <ActionRow
              key={entry.action.path}
              entry={entry}
              onComplete={() => onComplete(entry)}
              showDueChip
              isLast={i === actions.length - 1}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function ActionsSection({
  groups,
  onComplete,
  orderedPaths,
}: {
  groups: Array<{ projectName: string; projectPath: string; items: HomeAction[] }>;
  onComplete: (a: HomeAction) => void;
  orderedPaths: string[];
}) {
  return (
    <section aria-labelledby="actions-heading" className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <h2
          id="actions-heading"
          className="text-xs font-medium uppercase tracking-wider text-fg-muted"
        >
          Actions
        </h2>
        <Badge>{orderedPaths.length}</Badge>
      </div>
      {groups.length === 0 ? (
        <div className="rounded-lg border border-border-subtle bg-bg-surface px-5 py-6 text-center text-sm text-fg-muted">
          No open actions. Create one from a project.
        </div>
      ) : (
        <SortableContext items={orderedPaths} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-5">
            {groups.map((group) => (
              <ProjectGroup
                key={group.projectPath}
                projectName={group.projectName}
                items={group.items}
                onComplete={onComplete}
              />
            ))}
          </div>
        </SortableContext>
      )}
    </section>
  );
}

function ProjectGroup({
  projectName,
  items,
  onComplete,
}: {
  projectName: string;
  items: HomeAction[];
  onComplete: (a: HomeAction) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 px-1">
        <ListTodo className="h-3 w-3 text-fg-muted" strokeWidth={1.75} />
        <span className="text-2xs font-medium uppercase tracking-wider text-fg-muted">
          {projectName}
        </span>
        <span className="text-2xs text-fg-muted">·</span>
        <span className="text-2xs text-fg-muted">{items.length}</span>
      </div>
      <div className="overflow-hidden rounded-lg border border-border-subtle bg-bg-surface">
        {items.map((entry, i) => (
          <SortableRow
            key={entry.action.path}
            entry={entry}
            onComplete={() => onComplete(entry)}
            isLast={i === items.length - 1}
          />
        ))}
      </div>
    </div>
  );
}

function SortableRow({
  entry,
  onComplete,
  isLast,
}: {
  entry: HomeAction;
  onComplete: () => void;
  isLast: boolean;
}) {
  const sortable = useSortable({ id: entry.action.path });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
    opacity: sortable.isDragging ? 0.5 : 1,
  };

  return (
    <div ref={sortable.setNodeRef} style={style}>
      <ActionRow
        entry={entry}
        onComplete={onComplete}
        dragHandleProps={{
          ...sortable.attributes,
          ...sortable.listeners,
        }}
        isLast={isLast}
      />
    </div>
  );
}

type DragHandleProps = HTMLAttributes<HTMLDivElement>;

function ActionRow({
  entry,
  onComplete,
  dragHandleProps,
  showDueChip,
  isLast,
}: {
  entry: HomeAction;
  onComplete: () => void;
  dragHandleProps?: DragHandleProps;
  showDueChip?: boolean;
  isLast?: boolean;
}) {
  const route = useRoute();
  const subtitle = useMemo(() => buildSubtitle(entry), [entry]);

  return (
    <div
      className={cn(
        "group flex items-center gap-2 px-3 py-2",
        !isLast && "border-b border-border-subtle/60",
        "transition-colors duration-fast ease-swift hover:bg-bg-elevated/40",
      )}
    >
      {dragHandleProps ? (
        <div
          {...dragHandleProps}
          aria-label="Drag to reorder"
          className="flex h-6 w-5 shrink-0 cursor-grab items-center justify-center text-fg-muted opacity-0 transition-opacity duration-fast ease-swift hover:text-fg-primary group-hover:opacity-100"
        >
          <GripVertical className="h-3.5 w-3.5" strokeWidth={1.75} />
        </div>
      ) : (
        <div className="w-5 shrink-0" />
      )}
      <button
        type="button"
        onClick={onComplete}
        aria-label="Complete action"
        className="shrink-0 text-fg-muted transition-colors duration-fast ease-swift hover:text-accent"
      >
        <Circle className="h-4 w-4" strokeWidth={1.75} />
      </button>
      <button
        type="button"
        onClick={() =>
          route.navigate({
            page: "editor",
            notePath: entry.action.path,
            returnTo: { page: "home" },
          })
        }
        className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left"
      >
        <span className="truncate text-sm text-fg-primary">
          {entry.action.title || "Untitled"}
        </span>
        {subtitle ? (
          <span className="truncate text-2xs text-fg-muted">{subtitle}</span>
        ) : null}
      </button>
      <div className="flex shrink-0 items-center gap-1.5">
        {entry.action.tags.slice(0, 2).map((t) => (
          <Badge key={t}>{t}</Badge>
        ))}
        {showDueChip ? (
          <Badge tone="accent" className="gap-1">
            <Calendar className="h-3 w-3" strokeWidth={1.75} />
            Due
          </Badge>
        ) : null}
      </div>
    </div>
  );
}

function CompleteDialog({
  action,
  onClose,
}: {
  action: HomeAction | null;
  onClose: () => void;
}) {
  const [note, setNote] = useState("");
  const complete = useCompleteAction();

  function submit() {
    if (!action) return;
    const trimmed = note.trim();
    const variables =
      trimmed.length > 0
        ? { path: action.action.path, note: trimmed }
        : { path: action.action.path };
    complete.mutate(variables, {
      onSuccess: () => {
        setNote("");
        onClose();
      },
    });
  }

  return (
    <Dialog
      open={!!action}
      onOpenChange={(open) => {
        if (!open) {
          setNote("");
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-accent" strokeWidth={1.75} />
            Complete action
          </DialogTitle>
          <DialogDescription>
            Leaving a note is optional. It'll be saved with the archived action so
            future-you can see what this was about.
          </DialogDescription>
        </DialogHeader>
        <div className="mb-1 text-sm font-medium text-fg-primary">
          {action?.action.title || "Untitled"}
        </div>
        <textarea
          autoFocus
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="What did you ship? How did it feel?"
          aria-label="Completion note"
          rows={3}
          className="w-full resize-none rounded border border-border-subtle bg-bg-base px-3 py-2 text-sm text-fg-primary placeholder:text-fg-muted focus:border-accent focus:outline-none"
        />
        <DialogFooter>
          <Button variant="ghost" size="md" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={submit}
            disabled={complete.isPending}
          >
            {complete.isPending ? "Completing…" : "Mark complete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LoadingRows() {
  return (
    <div className="flex flex-col gap-3">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-10 animate-pulse rounded-lg border border-border-subtle bg-bg-surface"
        />
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <section className="mx-auto flex max-w-md flex-col items-center gap-5 py-14 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full border border-border-subtle bg-bg-surface">
        <ListTodo className="h-6 w-6 text-fg-muted" strokeWidth={1.5} />
      </div>
      <div className="flex flex-col gap-1.5">
        <h2 className="text-base font-medium text-fg-primary">Your home is quiet</h2>
        <p className="text-sm text-fg-secondary">
          Create a project from the sidebar, then add actions. They'll show up
          here grouped by project.
        </p>
      </div>
    </section>
  );
}

// ---------- helpers ----------

/**
 * An action is "Due" if its reminder time has passed or its deadline date
 * is today-or-earlier in local time. Actions without either signal are
 * "active" and sit in the grouped list.
 */
function partitionByDue(actions: HomeAction[]): {
  dueActions: HomeAction[];
  activeActions: HomeAction[];
} {
  const now = new Date();
  const todayYMD = toLocalYMD(now);
  const due: HomeAction[] = [];
  const active: HomeAction[] = [];

  for (const entry of actions) {
    if (isDue(entry, now, todayYMD)) {
      due.push(entry);
    } else {
      active.push(entry);
    }
  }
  return { dueActions: due, activeActions: active };
}

function isDue(entry: HomeAction, now: Date, todayYMD: string): boolean {
  const remindAt = entry.action.remindAt;
  if (remindAt) {
    const when = new Date(remindAt);
    if (!Number.isNaN(when.getTime()) && when.getTime() <= now.getTime()) {
      return true;
    }
  }
  const deadline = entry.action.deadline;
  if (deadline && deadline <= todayYMD) {
    return true;
  }
  return false;
}

function toLocalYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function groupByProject(
  actions: HomeAction[],
): Array<{ projectName: string; projectPath: string; items: HomeAction[] }> {
  const groups = new Map<
    string,
    { projectName: string; projectPath: string; items: HomeAction[] }
  >();
  for (const entry of actions) {
    const existing = groups.get(entry.projectPath);
    if (existing) {
      existing.items.push(entry);
    } else {
      groups.set(entry.projectPath, {
        projectName: entry.projectName,
        projectPath: entry.projectPath,
        items: [entry],
      });
    }
  }
  // Preserve insertion order, which reflects the sorted action list.
  return Array.from(groups.values());
}

function buildSubtitle(entry: HomeAction): string | null {
  const parts: string[] = [];
  if (entry.action.createdAt) {
    try {
      parts.push(
        `Created ${formatDistanceToNow(parseISO(entry.action.createdAt), {
          addSuffix: true,
        })}`,
      );
    } catch {
      // ignore malformed timestamps
    }
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}
