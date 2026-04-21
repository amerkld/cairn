/**
 * Ctrl/Cmd+K command palette. Houses two things:
 *
 * 1. **Navigation** — always visible: Home, Captures, Someday, Trash, plus
 *    one row per registered project.
 * 2. **Search** — notes matching the current query (debounced 120ms), via
 *    the Rust `search_notes` command. Title matches sort first.
 *
 * Built on `cmdk`, which handles keyboard navigation (↑/↓/Enter) and
 * keeps the active item in view. We force `shouldFilter={false}` because
 * our search is server-side — letting cmdk re-filter would drop valid
 * backend matches that don't fuzzy-match the query string on the frontend.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Command } from "cmdk";
import { useQuery } from "@tanstack/react-query";
import {
  Home as HomeIcon,
  Inbox,
  Clock,
  Trash2,
  FolderKanban,
  FileText,
  Search,
  Keyboard,
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/ds/Dialog";
import { cn } from "@/lib/cn";
import { api } from "@/lib/invoke";
import { useTreeQuery } from "@/lib/queries";
import { useRoute } from "./routing";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenShortcuts?: () => void;
}

const SEARCH_DEBOUNCE_MS = 120;
const SEARCH_LIMIT = 20;

export function CommandPalette({
  open,
  onOpenChange,
  onOpenShortcuts,
}: CommandPaletteProps) {
  const route = useRoute();
  const tree = useTreeQuery();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  // Reset query on close so reopening isn't sticky.
  useEffect(() => {
    if (!open) {
      setQuery("");
      setDebouncedQuery("");
    }
  }, [open]);

  // Debounce so we don't fire search IPC on every keystroke.
  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedQuery(query.trim()), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [query]);

  const searchQuery = useQuery({
    queryKey: ["search", debouncedQuery],
    queryFn: () => api.searchNotes(debouncedQuery, SEARCH_LIMIT),
    enabled: open && debouncedQuery.length > 0,
    staleTime: 30_000,
  });

  const projects = useMemo(() => tree.data?.projects ?? [], [tree.data]);
  const results = searchQuery.data ?? [];

  function pickNav(target: () => void) {
    target();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl p-0" aria-describedby={undefined}>
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <Command
          label="Command palette"
          shouldFilter={false}
          className="flex flex-col"
        >
          <div className="flex items-center gap-2 border-b border-border-subtle px-4 py-3">
            <Search className="h-3.5 w-3.5 shrink-0 text-fg-muted" strokeWidth={1.75} />
            <Command.Input
              autoFocus
              value={query}
              onValueChange={setQuery}
              placeholder="Search notes or jump to…"
              className="min-w-0 flex-1 bg-transparent text-sm text-fg-primary placeholder:text-fg-muted focus:outline-none"
            />
            <kbd className="rounded-sm border border-border-subtle bg-bg-elevated px-1.5 py-0.5 font-mono text-2xs text-fg-muted">
              esc
            </kbd>
          </div>

          <Command.List className="max-h-[60vh] overflow-auto py-1.5">
            <Command.Empty className="px-4 py-8 text-center text-xs text-fg-muted">
              {debouncedQuery.length > 0 && searchQuery.isLoading
                ? "Searching…"
                : debouncedQuery.length > 0
                  ? `No matches for "${debouncedQuery}"`
                  : "Type to search, or jump to a page below."}
            </Command.Empty>

            <Command.Group
              heading="Navigation"
              className="px-1 text-2xs uppercase tracking-wider text-fg-muted [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1"
            >
              <NavItem
                icon={HomeIcon}
                label="Home"
                shortcut="g h"
                onSelect={() => pickNav(() => route.navigate({ page: "home" }))}
              />
              <NavItem
                icon={Inbox}
                label="Captures"
                shortcut="g c"
                onSelect={() => pickNav(() => route.navigate({ page: "captures" }))}
              />
              <NavItem
                icon={Clock}
                label="Someday"
                shortcut="g s"
                onSelect={() => pickNav(() => route.navigate({ page: "someday" }))}
              />
              <NavItem
                icon={Trash2}
                label="Trash"
                shortcut="g t"
                onSelect={() => pickNav(() => route.navigate({ page: "trash" }))}
              />
              {onOpenShortcuts ? (
                <NavItem
                  icon={Keyboard}
                  label="Keyboard shortcuts"
                  shortcut="?"
                  onSelect={() => pickNav(onOpenShortcuts)}
                />
              ) : null}
            </Command.Group>

            {projects.length > 0 ? (
              <Command.Group
                heading="Projects"
                className="px-1 text-2xs uppercase tracking-wider text-fg-muted [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1"
              >
                {projects.map((project) => (
                  <ItemButton
                    key={project.path}
                    value={`project ${project.name}`}
                    onSelect={() =>
                      pickNav(() =>
                        route.navigate({
                          page: "project",
                          projectPath: project.path,
                        }),
                      )
                    }
                  >
                    <FolderKanban className="h-3.5 w-3.5 text-fg-muted" strokeWidth={1.75} />
                    <span className="min-w-0 flex-1 truncate">{project.name}</span>
                    <span className="shrink-0 text-2xs text-fg-muted">
                      {project.actions.length}
                    </span>
                  </ItemButton>
                ))}
              </Command.Group>
            ) : null}

            {results.length > 0 ? (
              <Command.Group
                heading="Search results"
                className="px-1 text-2xs uppercase tracking-wider text-fg-muted [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1"
              >
                {results.map((hit) => (
                  <ItemButton
                    key={hit.path}
                    value={`hit ${hit.path}`}
                    onSelect={() =>
                      pickNav(() =>
                        route.navigate({
                          page: "editor",
                          notePath: hit.path,
                          returnTo: "home",
                        }),
                      )
                    }
                  >
                    <FileText className="h-3.5 w-3.5 shrink-0 text-fg-muted" strokeWidth={1.75} />
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate text-sm text-fg-primary">
                        {hit.title || "Untitled"}
                      </span>
                      <span className="truncate text-2xs text-fg-muted">
                        {hit.snippet}
                      </span>
                    </div>
                  </ItemButton>
                ))}
              </Command.Group>
            ) : null}
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

function NavItem({
  icon: Icon,
  label,
  shortcut,
  onSelect,
}: {
  icon: typeof HomeIcon;
  label: string;
  shortcut?: string;
  onSelect: () => void;
}) {
  return (
    <ItemButton value={`nav ${label}`} onSelect={onSelect}>
      <Icon className="h-3.5 w-3.5 text-fg-muted" strokeWidth={1.75} />
      <span className="flex-1">{label}</span>
      {shortcut ? (
        <kbd className="font-mono text-2xs text-fg-muted">{shortcut}</kbd>
      ) : null}
    </ItemButton>
  );
}

function ItemButton({
  value,
  onSelect,
  children,
}: {
  value: string;
  onSelect: () => void;
  children: ReactNode;
}) {
  // Use a ref to forward cmdk's mousedown preventDefault so clicks don't
  // steal focus from the input before the item fires.
  const ref = useRef<HTMLDivElement | null>(null);
  return (
    <Command.Item
      ref={ref}
      value={value}
      onSelect={onSelect}
      className={cn(
        "mx-1 flex cursor-default items-center gap-2.5 rounded px-2.5 py-2 text-sm",
        "text-fg-secondary outline-none",
        "data-[selected=true]:bg-bg-elevated data-[selected=true]:text-fg-primary",
      )}
    >
      {children}
    </Command.Item>
  );
}
