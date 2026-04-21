/**
 * Two-step dialog for moving a capture into a project.
 *
 * Step 1 — pick a project, or type to create one on the spot.
 * Step 2 — pick the destination *inside* that project: the project root
 *          (reference note), the Actions directory (GTD action), or a
 *          subdirectory (existing or new).
 *
 * The dialog owns all the orchestration; callers pass a source path and a
 * close handler and don't need to worry about the mutation chain.
 */
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  ArrowLeft,
  Check,
  Folder,
  FolderPlus,
  ListTodo,
  Plus,
  Search,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/ds/Dialog";
import { Button } from "@/ds/Button";
import { cn } from "@/lib/cn";
import type { MoveTarget, Project } from "@/lib/invoke";
import { useCreateProject, useMoveNote } from "@/lib/queries";

type DestinationKind = "root" | "actions" | "subdirectory";

interface MoveToProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  capturePath: string;
  captureTitle: string;
  projects: Project[];
}

export function MoveToProjectDialog({
  open,
  onOpenChange,
  capturePath,
  captureTitle,
  projects,
}: MoveToProjectDialogProps) {
  const [step, setStep] = useState<"pick-project" | "pick-destination">("pick-project");
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  const createProject = useCreateProject();
  const moveNote = useMoveNote();

  // Reset on close so reopening always starts fresh.
  useEffect(() => {
    if (!open) {
      setStep("pick-project");
      setSelectedProject(null);
      setQuery("");
      setError(null);
    }
  }, [open]);

  function handlePickProject(project: Project) {
    setSelectedProject(project);
    setError(null);
    setStep("pick-destination");
  }

  function handleCreateProject(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    setError(null);
    createProject.mutate(trimmed, {
      onSuccess: (projectPath) => {
        // The tree query refetches asynchronously; synthesize a Project
        // locally so the dialog can continue without waiting.
        const synthetic: Project = {
          name: trimmed,
          path: projectPath,
          actions: [],
          subdirectories: [],
        };
        handlePickProject(synthetic);
      },
      onError: (err) => setError(extractMessage(err)),
    });
  }

  function handleMove(target: MoveTarget) {
    moveNote.mutate(
      { src: capturePath, target },
      {
        onSuccess: () => onOpenChange(false),
        onError: (err) => setError(extractMessage(err)),
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0">
        {step === "pick-project" ? (
          <PickProjectStep
            captureTitle={captureTitle}
            query={query}
            onQueryChange={setQuery}
            projects={projects}
            onPick={handlePickProject}
            onCreate={handleCreateProject}
            creating={createProject.isPending}
            error={error}
          />
        ) : selectedProject ? (
          <PickDestinationStep
            project={selectedProject}
            onBack={() => setStep("pick-project")}
            onMove={handleMove}
            moving={moveNote.isPending}
            error={error}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

// ─── Step 1 ──────────────────────────────────────────────────────────────

function PickProjectStep({
  captureTitle,
  query,
  onQueryChange,
  projects,
  onPick,
  onCreate,
  creating,
  error,
}: {
  captureTitle: string;
  query: string;
  onQueryChange: (q: string) => void;
  projects: Project[];
  onPick: (project: Project) => void;
  onCreate: (name: string) => void;
  creating: boolean;
  error: string | null;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => inputRef.current?.focus(), []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((p) => p.name.toLowerCase().includes(q));
  }, [projects, query]);

  const exactMatch = useMemo(
    () => projects.find((p) => p.name.toLowerCase() === query.trim().toLowerCase()),
    [projects, query],
  );
  const canCreate = query.trim().length > 0 && !exactMatch;

  // Keyboard nav: ArrowDown/Up over items + "create" row; Enter picks.
  const rowCount = filtered.length + (canCreate ? 1 : 0);
  const [cursor, setCursor] = useState(0);
  useEffect(() => {
    setCursor(0);
  }, [query]);

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => (rowCount === 0 ? 0 : (c + 1) % rowCount));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => (rowCount === 0 ? 0 : (c - 1 + rowCount) % rowCount));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (cursor < filtered.length) {
        const p = filtered[cursor];
        if (p) onPick(p);
      } else if (canCreate) {
        onCreate(query);
      }
    }
  }

  return (
    <>
      <DialogHeader className="border-b border-border-subtle px-5 pb-4 pt-5">
        <DialogTitle>Move to project</DialogTitle>
        <DialogDescription className="truncate text-xs">
          {captureTitle || "Untitled"}
        </DialogDescription>
      </DialogHeader>

      <div className="flex items-center gap-2 border-b border-border-subtle px-5 py-2.5">
        <Search className="h-3.5 w-3.5 shrink-0 text-fg-muted" strokeWidth={1.75} />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search projects or type a new name…"
          aria-label="Search projects"
          className="min-w-0 flex-1 bg-transparent text-sm text-fg-primary placeholder:text-fg-muted focus:outline-none"
        />
      </div>

      <div className="max-h-80 overflow-auto py-1.5" role="listbox">
        {filtered.length === 0 && !canCreate ? (
          <p className="px-5 py-8 text-center text-xs text-fg-muted">
            No projects yet. Type a name to create one.
          </p>
        ) : null}
        {filtered.map((p, i) => (
          <ProjectRow
            key={p.path}
            project={p}
            highlighted={i === cursor}
            onHover={() => setCursor(i)}
            onSelect={() => onPick(p)}
          />
        ))}
        {canCreate ? (
          <CreateRow
            name={query.trim()}
            highlighted={cursor === filtered.length}
            onHover={() => setCursor(filtered.length)}
            onSelect={() => onCreate(query)}
            pending={creating}
          />
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="border-t border-danger/30 bg-danger/10 px-5 py-2 text-xs text-danger">
          {error}
        </p>
      ) : null}
    </>
  );
}

function ProjectRow({
  project,
  highlighted,
  onHover,
  onSelect,
}: {
  project: Project;
  highlighted: boolean;
  onHover: () => void;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={highlighted}
      onMouseEnter={onHover}
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-2.5 px-5 py-2 text-left",
        "transition-colors duration-fast ease-swift",
        highlighted ? "bg-bg-elevated" : "hover:bg-bg-elevated/60",
      )}
    >
      <Folder className="h-3.5 w-3.5 shrink-0 text-fg-muted" strokeWidth={1.75} />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm text-fg-primary">{project.name}</span>
        <span className="truncate text-2xs text-fg-muted">
          {project.actions.length} action{project.actions.length === 1 ? "" : "s"}
          {project.subdirectories.length > 0
            ? ` · ${project.subdirectories.length} folder${project.subdirectories.length === 1 ? "" : "s"}`
            : ""}
        </span>
      </div>
    </button>
  );
}

function CreateRow({
  name,
  highlighted,
  onHover,
  onSelect,
  pending,
}: {
  name: string;
  highlighted: boolean;
  onHover: () => void;
  onSelect: () => void;
  pending: boolean;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={highlighted}
      onMouseEnter={onHover}
      onClick={onSelect}
      disabled={pending}
      className={cn(
        "flex w-full items-center gap-2.5 border-t border-border-subtle/60 px-5 py-2 text-left",
        "transition-colors duration-fast ease-swift",
        highlighted ? "bg-bg-elevated" : "hover:bg-bg-elevated/60",
        "disabled:opacity-60",
      )}
    >
      <FolderPlus className="h-3.5 w-3.5 shrink-0 text-accent" strokeWidth={1.75} />
      <span className="min-w-0 flex-1 truncate text-sm text-fg-primary">
        {pending ? "Creating…" : <>Create project <span className="font-medium">“{name}”</span></>}
      </span>
      <Plus className="h-3.5 w-3.5 text-fg-muted" strokeWidth={2} />
    </button>
  );
}

// ─── Step 2 ──────────────────────────────────────────────────────────────

function PickDestinationStep({
  project,
  onBack,
  onMove,
  moving,
  error,
}: {
  project: Project;
  onBack: () => void;
  onMove: (target: MoveTarget) => void;
  moving: boolean;
  error: string | null;
}) {
  const [kind, setKind] = useState<DestinationKind>("root");
  const [subdirValue, setSubdirValue] = useState("");
  const subdirInputRef = useRef<HTMLInputElement | null>(null);

  function resolveTarget(): MoveTarget | null {
    const base = basenameOf(project);
    if (kind === "root") return `Projects/${base}`;
    if (kind === "actions") return `Projects/${base}/Actions`;
    const sub = subdirValue.trim().replace(/^[/\\]+|[/\\]+$/g, "");
    if (!sub) return null;
    // Disallow leading ../ to escape project; normalize separators to /.
    if (sub.includes("..")) return null;
    const normalized = sub.replace(/\\/g, "/");
    return `Projects/${base}/${normalized}`;
  }

  function submit() {
    const t = resolveTarget();
    if (!t) return;
    onMove(t);
  }

  const canSubmit = (() => {
    if (moving) return false;
    if (kind === "subdirectory") return subdirValue.trim().length > 0 && !subdirValue.includes("..");
    return true;
  })();

  return (
    <>
      <DialogHeader className="border-b border-border-subtle px-5 pb-4 pt-5">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to project picker"
            className="inline-flex h-6 w-6 items-center justify-center rounded text-fg-muted hover:bg-bg-elevated hover:text-fg-primary"
          >
            <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
          </button>
          <DialogTitle className="min-w-0 flex-1 truncate">
            Move to <span className="text-accent">{project.name}</span>
          </DialogTitle>
        </div>
        <DialogDescription className="sr-only">
          Choose where inside {project.name} to place this note.
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-1 px-2 py-2">
        <DestinationOption
          active={kind === "root"}
          icon={Folder}
          label="Project root"
          description="As a reference note at the top level"
          onSelect={() => setKind("root")}
        />
        <DestinationOption
          active={kind === "actions"}
          icon={ListTodo}
          label="Actions"
          description="Becomes an open action on Home"
          onSelect={() => setKind("actions")}
        />
        <DestinationOption
          active={kind === "subdirectory"}
          icon={FolderPlus}
          label="Subdirectory"
          description="Existing or new folder inside the project"
          onSelect={() => {
            setKind("subdirectory");
            setTimeout(() => subdirInputRef.current?.focus(), 0);
          }}
        >
          {kind === "subdirectory" ? (
            <div className="mt-2 flex flex-col gap-2">
              <input
                ref={subdirInputRef}
                value={subdirValue}
                onChange={(e) => setSubdirValue(e.target.value)}
                placeholder="Folder name (e.g. research)"
                aria-label="Subdirectory name"
                className={cn(
                  "h-8 rounded border border-border-subtle bg-bg-base px-2.5 text-sm text-fg-primary",
                  "placeholder:text-fg-muted hover:border-border-strong",
                  "focus:border-accent focus:outline-none",
                )}
              />
              {project.subdirectories.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  <span className="text-2xs uppercase tracking-wider text-fg-muted">
                    Existing:
                  </span>
                  {project.subdirectories.map((name) => (
                    <button
                      type="button"
                      key={name}
                      onClick={() => setSubdirValue(name)}
                      className={cn(
                        "rounded-sm border border-border-subtle bg-bg-elevated px-1.5 py-0.5",
                        "text-2xs text-fg-secondary",
                        "transition-colors duration-fast ease-swift hover:border-border-strong hover:text-fg-primary",
                      )}
                    >
                      {name}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </DestinationOption>
      </div>

      {error ? (
        <p role="alert" className="border-t border-danger/30 bg-danger/10 px-5 py-2 text-xs text-danger">
          {error}
        </p>
      ) : null}

      <DialogFooter className="border-t border-border-subtle px-5 py-3">
        <Button variant="ghost" size="md" onClick={onBack}>
          Back
        </Button>
        <Button variant="primary" size="md" onClick={submit} disabled={!canSubmit}>
          {moving ? "Moving…" : "Move"}
        </Button>
      </DialogFooter>
    </>
  );
}

function DestinationOption({
  active,
  icon: Icon,
  label,
  description,
  onSelect,
  children,
}: {
  active: boolean;
  icon: typeof Folder;
  label: string;
  description: string;
  onSelect: () => void;
  children?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded px-3 py-2 transition-colors duration-fast ease-swift",
        active ? "bg-bg-elevated" : "hover:bg-bg-elevated/60",
      )}
    >
      <button
        type="button"
        role="radio"
        aria-checked={active}
        onClick={onSelect}
        className="flex w-full items-center gap-3 text-left"
      >
        <div
          className={cn(
            "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
            active ? "border-accent" : "border-border-strong",
          )}
        >
          {active ? <Check className="h-2.5 w-2.5 text-accent" strokeWidth={3} /> : null}
        </div>
        <Icon
          className={cn("h-4 w-4 shrink-0", active ? "text-accent" : "text-fg-muted")}
          strokeWidth={1.75}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm text-fg-primary">{label}</span>
          <span className="truncate text-2xs text-fg-muted">{description}</span>
        </div>
      </button>
      {children}
    </div>
  );
}

// ─── helpers ─────────────────────────────────────────────────────────────

function basenameOf(project: Project): string {
  return project.path.replace(/[/\\]+$/, "").split(/[/\\]/).pop() ?? project.name;
}

function extractMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    const m = (error as { message: unknown }).message;
    if (typeof m === "string") return m;
  }
  if (error instanceof Error) return error.message;
  return "Something went wrong.";
}
