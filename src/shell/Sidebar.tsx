import { useState, type FormEvent } from "react";
import {
  Home as HomeIcon,
  Inbox,
  Clock,
  Trash2,
  FolderKanban,
  ChevronRight,
  ChevronDown,
  ChevronsUpDown,
  FolderOpen,
  LogOut,
  Plus,
  Folder,
  Settings2,
} from "lucide-react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/ds/DropdownMenu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/ds/Dialog";
import { Button } from "@/ds/Button";
import { Input } from "@/ds/Input";
import { SettingsDialog } from "./SettingsDialog";
import { ShortcutsSheet } from "./ShortcutsSheet";
import { ProjectRowMenu } from "./ProjectRowMenu";
import { RenameProjectDialog } from "./RenameProjectDialog";
import { DeleteProjectDialog } from "./DeleteProjectDialog";
import { cn } from "@/lib/cn";
import type { Project, VaultSummary } from "@/lib/invoke";
import {
  useCloseActiveVault,
  useCreateProject,
  useOpenVault,
  useSwitchVault,
  useTreeQuery,
  useVaultsQuery,
} from "@/lib/queries";
import { useRoute } from "./routing";

type NavKey = "home" | "captures" | "someday" | "trash";

interface NavItem {
  key: NavKey;
  label: string;
  icon: typeof HomeIcon;
}

const NAV_ITEMS: ReadonlyArray<NavItem> = [
  { key: "home", label: "Home", icon: HomeIcon },
  { key: "captures", label: "Captures", icon: Inbox },
  { key: "someday", label: "Someday", icon: Clock },
  { key: "trash", label: "Trash", icon: Trash2 },
];

interface SidebarProps {
  vault: VaultSummary;
}

export function Sidebar({ vault }: SidebarProps) {
  const route = useRoute();

  return (
    <nav
      aria-label="Primary"
      className="flex h-full w-56 shrink-0 flex-col border-r border-border-subtle bg-bg-surface"
    >
      <div className="flex flex-col gap-0.5 p-2">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.key}
            item={item}
            active={route.state.page === item.key}
            onSelect={() => route.navigate({ page: item.key })}
          />
        ))}
      </div>
      <ProjectsSection />
      <VaultFooter vault={vault} />
    </nav>
  );
}

function NavLink({
  item,
  active,
  onSelect,
}: {
  item: NavItem;
  active: boolean;
  onSelect: () => void;
}) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex h-8 items-center gap-2.5 rounded px-2",
        "text-sm transition-colors duration-fast ease-swift",
        active
          ? "bg-bg-elevated text-fg-primary"
          : "text-fg-secondary hover:bg-bg-elevated/60 hover:text-fg-primary",
      )}
    >
      <Icon
        className={cn("h-4 w-4", active ? "text-accent" : "text-fg-muted")}
        strokeWidth={1.75}
      />
      <span className="truncate">{item.label}</span>
    </button>
  );
}

function ProjectsSection() {
  const treeQuery = useTreeQuery();
  const [expanded, setExpanded] = useState(true);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const projects = treeQuery.data?.projects ?? [];

  return (
    <div className="flex min-h-0 flex-1 flex-col border-t border-border-subtle">
      <header className="flex items-center gap-1.5 px-3 pb-1 pt-3">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          aria-label={expanded ? "Collapse projects" : "Expand projects"}
          className="-ml-1 inline-flex h-5 w-5 items-center justify-center rounded text-fg-muted hover:bg-bg-elevated hover:text-fg-primary"
        >
          {expanded ? (
            <ChevronDown className="h-3 w-3" strokeWidth={2} />
          ) : (
            <ChevronRight className="h-3 w-3" strokeWidth={2} />
          )}
        </button>
        <FolderKanban className="h-3.5 w-3.5 text-fg-muted" strokeWidth={1.75} />
        <span className="flex-1 text-2xs font-medium uppercase tracking-wider text-fg-muted">
          Projects
        </span>
        <button
          type="button"
          onClick={() => setNewProjectOpen(true)}
          aria-label="New project"
          className="inline-flex h-5 w-5 items-center justify-center rounded text-fg-muted hover:bg-bg-elevated hover:text-fg-primary"
        >
          <Plus className="h-3 w-3" strokeWidth={2} />
        </button>
      </header>
      {expanded ? (
        <ProjectList projects={projects} loading={treeQuery.isLoading} />
      ) : null}
      <NewProjectDialog open={newProjectOpen} onOpenChange={setNewProjectOpen} />
    </div>
  );
}

function ProjectList({
  projects,
  loading,
}: {
  projects: Project[];
  loading: boolean;
}) {
  const route = useRoute();
  const activePath =
    route.state.page === "project" ? route.state.projectPath : undefined;
  const [renameTarget, setRenameTarget] = useState<Project | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);

  if (loading) {
    return (
      <div className="flex flex-col gap-1 px-2 py-1">
        {[0, 1].map((i) => (
          <div key={i} className="h-7 animate-pulse rounded bg-bg-elevated/60" />
        ))}
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="px-3 py-4 text-xs text-fg-muted">
        No projects yet.
        <br />
        Tap <span className="font-medium text-fg-secondary">+</span> to create one.
      </div>
    );
  }

  return (
    <>
      <ul className="flex flex-col gap-0.5 px-2">
        {projects.map((project) => {
          const active = project.path === activePath;
          return (
            <li
              key={project.path}
              className={cn(
                "group relative flex h-7 items-center rounded",
                "transition-colors duration-fast ease-swift",
                active
                  ? "bg-bg-elevated text-fg-primary"
                  : "text-fg-secondary hover:bg-bg-elevated/60 hover:text-fg-primary",
              )}
            >
              <button
                type="button"
                onClick={() =>
                  route.navigate({ page: "project", projectPath: project.path })
                }
                className="absolute inset-0 rounded"
                aria-label={`Open ${project.name}`}
              />
              <div className="pointer-events-none relative flex h-full w-full items-center gap-2 px-2 text-sm">
                <Folder
                  className={cn(
                    "h-3.5 w-3.5 shrink-0",
                    active ? "text-accent" : "text-fg-muted",
                  )}
                  strokeWidth={1.75}
                />
                <span className="min-w-0 flex-1 truncate text-left">
                  {project.name}
                </span>
                {project.actions.length > 0 ? (
                  <span
                    className={cn(
                      "shrink-0 text-2xs text-fg-muted",
                      "transition-opacity duration-fast ease-swift",
                      "group-hover:opacity-0",
                    )}
                  >
                    {project.actions.length}
                  </span>
                ) : null}
                <div className="pointer-events-auto shrink-0">
                  <ProjectRowMenu
                    projectName={project.name}
                    variant="hover"
                    stopPropagation
                    onRename={() => setRenameTarget(project)}
                    onDelete={() => setDeleteTarget(project)}
                  />
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {renameTarget ? (
        <RenameProjectDialog
          open
          onOpenChange={(next) => {
            if (!next) setRenameTarget(null);
          }}
          projectPath={renameTarget.path}
          projectName={renameTarget.name}
          onRenamed={(newPath) => {
            // If the renamed project is the active route, follow it to its
            // new path. Otherwise the tree refetch will surface the new name
            // without disrupting whatever the user was looking at.
            if (activePath === renameTarget.path) {
              route.navigate({ page: "project", projectPath: newPath });
            }
          }}
        />
      ) : null}
      {deleteTarget ? (
        <DeleteProjectDialog
          open
          onOpenChange={(next) => {
            if (!next) setDeleteTarget(null);
          }}
          projectPath={deleteTarget.path}
          projectName={deleteTarget.name}
          onDeleted={() => {
            if (activePath === deleteTarget.path) {
              route.navigate({ page: "home" });
            }
          }}
        />
      ) : null}
    </>
  );
}

function NewProjectDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const createProject = useCreateProject();
  const treeQuery = useTreeQuery();
  const route = useRoute();

  const trimmed = name.trim();
  const existingNames = (treeQuery.data?.projects ?? []).map((p) =>
    p.name.toLowerCase(),
  );
  const empty = trimmed.length === 0;
  const collides = !empty && existingNames.includes(trimmed.toLowerCase());
  const validationHint = collides
    ? `A project named "${trimmed}" already exists.`
    : null;
  const disableSubmit = createProject.isPending || empty || collides;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (disableSubmit) return;
    setError(null);
    createProject.mutate(trimmed, {
      onSuccess: (projectPath) => {
        setName("");
        onOpenChange(false);
        route.navigate({ page: "project", projectPath });
      },
      onError: (err) => {
        setError(extractMessage(err));
      },
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setName("");
          setError(null);
        }
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>New project</DialogTitle>
            <DialogDescription>
              A new folder under{" "}
              <code className="font-mono text-fg-primary">Projects/</code> with an{" "}
              <code className="font-mono text-fg-primary">Actions/</code> subdirectory.
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Project name"
            aria-label="Project name"
            aria-invalid={collides ? true : undefined}
          />
          {validationHint ? (
            <p className="mt-2 text-xs text-fg-muted">{validationHint}</p>
          ) : null}
          {error ? (
            <p role="alert" className="mt-2 text-xs text-danger">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              variant="ghost"
              size="md"
              type="button"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="md"
              type="submit"
              disabled={disableSubmit}
            >
              {createProject.isPending ? "Creating…" : "Create project"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function VaultFooter({ vault }: { vault: VaultSummary }) {
  const vaultsQuery = useVaultsQuery();
  const switchVault = useSwitchVault();
  const openVault = useOpenVault();
  const closeVault = useCloseActiveVault();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  const others = (vaultsQuery.data ?? []).filter((v) => v.path !== vault.path);

  async function pickOther() {
    const selected = await openDialog({
      directory: true,
      multiple: false,
      title: "Choose a folder to use as a vault",
    });
    if (typeof selected !== "string" || selected.length === 0) return;
    openVault.mutate(selected);
  }

  return (
    <div className="border-t border-border-subtle p-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Switch vault"
            className={cn(
              "flex w-full items-center gap-2 rounded px-2 py-2 text-left",
              "transition-colors duration-fast ease-swift",
              "hover:bg-bg-elevated",
              "data-[state=open]:bg-bg-elevated",
            )}
          >
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-2xs uppercase tracking-wider text-fg-muted">
                Vault
              </span>
              <span className="truncate text-sm font-medium text-fg-primary">
                {vault.name}
              </span>
            </div>
            <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-fg-muted" strokeWidth={1.75} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="top" className="w-56">
          {others.length > 0 ? (
            <>
              <DropdownMenuLabel>Switch to</DropdownMenuLabel>
              {others.map((v) => (
                <DropdownMenuItem
                  key={v.path}
                  onSelect={() => switchVault.mutate(v.path)}
                  className="flex-col items-start gap-0 py-2"
                >
                  <span className="w-full truncate text-sm text-fg-primary">{v.name}</span>
                  <span className="w-full truncate font-mono text-2xs text-fg-muted">
                    {v.path}
                  </span>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
            </>
          ) : null}
          <DropdownMenuItem onSelect={pickOther}>
            <FolderOpen className="h-4 w-4 text-fg-muted" strokeWidth={1.75} />
            Open a different folder…
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setSettingsOpen(true)}>
            <Settings2 className="h-4 w-4 text-fg-muted" strokeWidth={1.75} />
            Settings
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => closeVault.mutate()}>
            <LogOut className="h-4 w-4 text-fg-muted" strokeWidth={1.75} />
            Close vault
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        vault={vault}
        onOpenShortcuts={() => setShortcutsOpen(true)}
      />
      <ShortcutsSheet open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </div>
  );
}

function extractMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    const m = (error as { message: unknown }).message;
    if (typeof m === "string") return m;
  }
  if (error instanceof Error) return error.message;
  return "Something went wrong.";
}
