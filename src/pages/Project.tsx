/**
 * Project page — the project's Actions list plus a browser for everything
 * else in the project tree.
 *
 * Sections:
 *   - Actions: open GTD items from `<project>/Actions/`
 *   - Docs: files + folders inside the project, with breadcrumb navigation
 *     into subdirectories. `Actions/` and `assets/` are hidden from the docs
 *     browser since they have their own purposes.
 */
import { useMemo, useState } from "react";
import { TagFilter } from "@/tags/TagFilter";
import { applyTagFilter } from "@/tags/filter";
import {
  Plus,
  ListTodo,
  Folder,
  ArrowRight,
  FileText,
  FolderOpen,
  ChevronRight,
  Home as HomeIcon,
} from "lucide-react";
import { formatDistanceToNow, parseISO } from "date-fns";
import { Button } from "@/ds/Button";
import { Badge } from "@/ds/Badge";
import { cn } from "@/lib/cn";
import type { FolderEntry, NoteRef, Project as ProjectType } from "@/lib/invoke";
import {
  useCreateAction,
  useFolderQuery,
  useTreeQuery,
} from "@/lib/queries";
import { useRoute } from "@/shell/routing";

// Folder names to hide from the docs browser at the project root.
// `Actions/` has its own section; `assets/` is app-managed (pasted images).
const HIDDEN_ROOT_FOLDERS: ReadonlySet<string> = new Set(["Actions", "assets"]);

interface ProjectPageProps {
  projectPath: string;
}

export function ProjectPage({ projectPath }: ProjectPageProps) {
  const treeQuery = useTreeQuery();
  const project = useMemo<ProjectType | undefined>(
    () => treeQuery.data?.projects.find((p) => p.path === projectPath),
    [treeQuery.data, projectPath],
  );
  const createAction = useCreateAction();
  const route = useRoute();
  const [tagFilter, setTagFilter] = useState<string | null>(null);

  if (treeQuery.isLoading) return <LoadingSkeleton />;
  if (!project) return <NotFound path={projectPath} />;

  function newAction() {
    if (!project) return;
    createAction.mutate(
      { projectPath: project.path },
      {
        onSuccess: (note) => {
          route.navigate({
            page: "editor",
            notePath: note.path,
            returnTo: "home",
          });
        },
      },
    );
  }

  return (
    <div className="mx-auto flex h-full max-w-4xl flex-col gap-10 overflow-auto px-10 py-10">
      <header className="flex items-end justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex items-center gap-2 text-2xs uppercase tracking-wider text-fg-muted">
            <Folder className="h-3 w-3" strokeWidth={1.75} />
            Project
          </div>
          <h1 className="truncate text-2xl font-semibold tracking-tight text-fg-primary">
            {project.name}
          </h1>
        </div>
        <Button
          variant="primary"
          size="md"
          onClick={newAction}
          disabled={createAction.isPending}
          className="gap-2"
        >
          <Plus className="h-4 w-4" strokeWidth={1.75} />
          {createAction.isPending ? "Creating…" : "New action"}
        </Button>
      </header>

      <TagFilter selected={tagFilter} onSelect={setTagFilter} />
      <ActionsSection
        project={project}
        onNew={newAction}
        isCreating={createAction.isPending}
        tagFilter={tagFilter}
      />
      <DocsSection project={project} tagFilter={tagFilter} />
    </div>
  );
}

function ActionsSection({
  project,
  onNew,
  isCreating,
  tagFilter,
}: {
  project: ProjectType;
  onNew: () => void;
  isCreating: boolean;
  tagFilter: string | null;
}) {
  const visibleActions = useMemo(
    () => applyTagFilter(project.actions, tagFilter),
    [project.actions, tagFilter],
  );
  return (
    <section aria-labelledby="actions-heading" className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <ListTodo className="h-3.5 w-3.5 text-fg-muted" strokeWidth={1.75} />
        <h2
          id="actions-heading"
          className="text-xs font-medium uppercase tracking-wider text-fg-muted"
        >
          Actions
        </h2>
        <Badge>{project.actions.length}</Badge>
      </div>
      {project.actions.length === 0 ? (
        <EmptyActions onCreate={onNew} isCreating={isCreating} />
      ) : visibleActions.length === 0 ? (
        <FilteredEmptyRow label={tagFilter ?? ""} />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border-subtle bg-bg-surface">
          {visibleActions.map((action, i) => (
            <ActionListRow
              key={action.path}
              action={action}
              isLast={i === visibleActions.length - 1}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function FilteredEmptyRow({ label }: { label: string }) {
  return (
    <div className="rounded-lg border border-border-subtle bg-bg-surface px-5 py-6 text-center text-xs text-fg-muted">
      Nothing tagged{" "}
      <span className="font-medium text-fg-primary">#{label}</span>.
    </div>
  );
}

function DocsSection({
  project,
  tagFilter,
}: {
  project: ProjectType;
  tagFilter: string | null;
}) {
  const [folderPath, setFolderPath] = useState<string>(project.path);
  const folderQuery = useFolderQuery(folderPath);

  // Reset to project root if the project switches under us.
  if (!folderPath.startsWith(project.path)) {
    setFolderPath(project.path);
  }

  const atRoot = folderPath === project.path;
  const contents = folderQuery.data;

  const visibleFolders: FolderEntry[] = useMemo(() => {
    if (!contents) return [];
    if (!atRoot) return contents.folders;
    return contents.folders.filter((f) => !HIDDEN_ROOT_FOLDERS.has(f.name));
  }, [contents, atRoot]);

  const visibleFiles = useMemo(
    () => applyTagFilter(contents?.files ?? [], tagFilter),
    [contents?.files, tagFilter],
  );

  const filesCount = visibleFiles.length;
  const foldersCount = visibleFolders.length;
  const isEmpty = filesCount === 0 && foldersCount === 0;

  return (
    <section aria-labelledby="docs-heading" className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <FileText className="h-3.5 w-3.5 text-fg-muted" strokeWidth={1.75} />
        <h2
          id="docs-heading"
          className="text-xs font-medium uppercase tracking-wider text-fg-muted"
        >
          Docs
        </h2>
        <Badge>{filesCount + foldersCount}</Badge>
      </div>

      <Breadcrumb
        projectName={project.name}
        projectPath={project.path}
        currentPath={folderPath}
        onNavigate={setFolderPath}
      />

      {folderQuery.isLoading ? (
        <DocsLoading />
      ) : isEmpty ? (
        <EmptyDocs atRoot={atRoot} projectName={project.name} />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border-subtle bg-bg-surface">
          {visibleFolders.map((folder, i) => (
            <FolderRow
              key={folder.path}
              folder={folder}
              onOpen={() => setFolderPath(folder.path)}
              isLast={i === foldersCount - 1 && filesCount === 0}
            />
          ))}
          {visibleFiles.map((file, i) => (
            <DocRow
              key={file.path}
              file={file}
              isLast={i === filesCount - 1}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function Breadcrumb({
  projectName,
  projectPath,
  currentPath,
  onNavigate,
}: {
  projectName: string;
  projectPath: string;
  currentPath: string;
  onNavigate: (path: string) => void;
}) {
  const atRoot = currentPath === projectPath;

  // Split the tail path into segments between projectPath and currentPath.
  const tail = currentPath.slice(projectPath.length).replace(/^[/\\]+/, "");
  const segments = tail.length > 0 ? tail.split(/[/\\]+/) : [];

  const separator = detectSeparator(currentPath);

  return (
    <nav
      aria-label="Folder breadcrumb"
      className="flex flex-wrap items-center gap-1 text-xs text-fg-muted"
    >
      <button
        type="button"
        onClick={() => onNavigate(projectPath)}
        className={cn(
          "inline-flex items-center gap-1 rounded px-1.5 py-0.5",
          "transition-colors duration-fast ease-swift hover:bg-bg-elevated",
          atRoot ? "text-fg-primary" : "text-fg-secondary hover:text-fg-primary",
        )}
      >
        <HomeIcon className="h-3 w-3" strokeWidth={1.75} />
        <span className="truncate">{projectName}</span>
      </button>
      {segments.map((segment, i) => {
        const pathSoFar =
          projectPath +
          separator +
          segments.slice(0, i + 1).join(separator);
        const isCurrent = i === segments.length - 1;
        return (
          <span key={pathSoFar} className="flex items-center gap-1">
            <ChevronRight className="h-3 w-3 text-fg-muted" strokeWidth={2} />
            <button
              type="button"
              onClick={() => onNavigate(pathSoFar)}
              disabled={isCurrent}
              className={cn(
                "rounded px-1.5 py-0.5",
                "transition-colors duration-fast ease-swift hover:bg-bg-elevated",
                isCurrent
                  ? "text-fg-primary"
                  : "text-fg-secondary hover:text-fg-primary",
              )}
            >
              <span className="truncate">{segment}</span>
            </button>
          </span>
        );
      })}
    </nav>
  );
}

function FolderRow({
  folder,
  onOpen,
  isLast,
}: {
  folder: FolderEntry;
  onOpen: () => void;
  isLast: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "group flex w-full items-center gap-3 px-4 py-2.5 text-left",
        "transition-colors duration-fast ease-swift",
        "hover:bg-bg-elevated/40",
        !isLast && "border-b border-border-subtle/60",
      )}
    >
      <FolderOpen className="h-3.5 w-3.5 shrink-0 text-fg-muted" strokeWidth={1.75} />
      <span className="min-w-0 flex-1 truncate text-sm text-fg-primary">
        {folder.name}
      </span>
      <span className="shrink-0 text-2xs text-fg-muted">Folder</span>
      <ArrowRight
        className="h-3.5 w-3.5 text-fg-muted opacity-0 transition-opacity duration-fast ease-swift group-hover:opacity-100"
        strokeWidth={1.75}
      />
    </button>
  );
}

function DocRow({ file, isLast }: { file: NoteRef; isLast: boolean }) {
  const route = useRoute();
  return (
    <button
      type="button"
      onClick={() =>
        route.navigate({ page: "editor", notePath: file.path, returnTo: "home" })
      }
      className={cn(
        "group flex w-full items-center gap-3 px-4 py-2.5 text-left",
        "transition-colors duration-fast ease-swift",
        "hover:bg-bg-elevated/40",
        !isLast && "border-b border-border-subtle/60",
      )}
    >
      <FileText className="h-3.5 w-3.5 shrink-0 text-fg-muted" strokeWidth={1.75} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm text-fg-primary">
          {file.title || "Untitled"}
        </span>
        {file.preview ? (
          <span className="truncate text-xs text-fg-muted">{file.preview}</span>
        ) : null}
      </div>
      {file.createdAt ? (
        <span className="shrink-0 text-2xs text-fg-muted">
          {relativeLabel(file.createdAt)}
        </span>
      ) : null}
      <ArrowRight
        className="h-3.5 w-3.5 text-fg-muted opacity-0 transition-opacity duration-fast ease-swift group-hover:opacity-100"
        strokeWidth={1.75}
      />
    </button>
  );
}

function ActionListRow({
  action,
  isLast,
}: {
  action: NoteRef;
  isLast: boolean;
}) {
  const route = useRoute();
  return (
    <button
      type="button"
      onClick={() =>
        route.navigate({ page: "editor", notePath: action.path, returnTo: "home" })
      }
      className={cn(
        "group flex w-full items-center gap-3 px-4 py-3 text-left",
        "transition-colors duration-fast ease-swift",
        "hover:bg-bg-elevated/40",
        !isLast && "border-b border-border-subtle/60",
      )}
    >
      <ListTodo className="h-3.5 w-3.5 shrink-0 text-fg-muted" strokeWidth={1.75} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm text-fg-primary">
          {action.title || "Untitled"}
        </span>
        {action.preview ? (
          <span className="truncate text-xs text-fg-muted">{action.preview}</span>
        ) : null}
      </div>
      {action.createdAt ? (
        <span className="shrink-0 text-2xs text-fg-muted">
          {relativeLabel(action.createdAt)}
        </span>
      ) : null}
      <ArrowRight
        className="h-3.5 w-3.5 text-fg-muted opacity-0 transition-opacity duration-fast ease-swift group-hover:opacity-100"
        strokeWidth={1.75}
      />
    </button>
  );
}

function EmptyActions({
  onCreate,
  isCreating,
}: {
  onCreate: () => void;
  isCreating: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-lg border border-border-subtle bg-bg-surface px-6 py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full border border-border-subtle">
        <ListTodo className="h-5 w-5 text-fg-muted" strokeWidth={1.5} />
      </div>
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-medium text-fg-primary">No actions yet</h3>
        <p className="text-xs text-fg-secondary">
          Add a first step. Small and concrete is better than perfect.
        </p>
      </div>
      <Button
        variant="primary"
        size="sm"
        onClick={onCreate}
        disabled={isCreating}
        className="gap-1.5"
      >
        <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
        New action
      </Button>
    </div>
  );
}

function EmptyDocs({
  atRoot,
  projectName,
}: {
  atRoot: boolean;
  projectName: string;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-border-subtle bg-bg-surface px-6 py-10 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full border border-border-subtle">
        <FileText className="h-4 w-4 text-fg-muted" strokeWidth={1.5} />
      </div>
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-medium text-fg-primary">
          {atRoot ? `No docs in ${projectName} yet` : "This folder is empty"}
        </h3>
        <p className="text-xs text-fg-secondary">
          {atRoot
            ? "Move a capture here to start building the project's knowledge base."
            : "Move a capture here or drop notes in from your filesystem."}
        </p>
      </div>
    </div>
  );
}

function DocsLoading() {
  return (
    <div className="flex flex-col gap-1.5">
      {[0, 1].map((i) => (
        <div
          key={i}
          className="h-10 animate-pulse rounded-lg border border-border-subtle bg-bg-surface"
        />
      ))}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 px-10 py-10">
      <div className="h-8 w-48 animate-pulse rounded bg-bg-elevated" />
      <div className="mt-6 flex flex-col gap-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-12 animate-pulse rounded bg-bg-surface" />
        ))}
      </div>
    </div>
  );
}

function NotFound({ path }: { path: string }) {
  return (
    <div className="mx-auto max-w-md px-10 py-20 text-center">
      <h2 className="text-base font-medium text-fg-primary">Project not found</h2>
      <p className="mt-2 text-sm text-fg-secondary">
        Could not find a project at{" "}
        <code className="font-mono text-2xs text-fg-primary">{path}</code>. It may
        have been moved or deleted.
      </p>
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

function detectSeparator(path: string): string {
  return path.includes("\\") ? "\\" : "/";
}
