/**
 * Compact destination picker for the Quick Capture dialog. A button showing
 * the current destination opens a floating, filterable list:
 *
 *   Captures                   ← always first, default
 *   ──────────────
 *   Alpha / Actions            ← creates an Action under Projects/Alpha
 *   Alpha / Research           ← moves into the subdirectory
 *   Beta / Actions
 *   Beta / Archive
 *   …
 *
 * Keyboard: type to filter, ↑/↓ to move, Enter to pick, Esc to close.
 * Adapts the pattern from `MoveToProjectDialog` — same grammar, simpler
 * layout since there's no project-creation flow here.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { ChevronDown, Inbox, ListTodo, Folder, Search } from "lucide-react";
import { cn } from "@/lib/cn";
import type { Project } from "@/lib/invoke";

export type QuickCaptureDestination =
  | { kind: "captures" }
  | { kind: "action"; projectPath: string; projectName: string }
  | {
      kind: "subdirectory";
      projectPath: string;
      projectName: string;
      subdir: string;
    };

export const CAPTURES_DESTINATION: QuickCaptureDestination = { kind: "captures" };

export function destinationLabel(d: QuickCaptureDestination): string {
  switch (d.kind) {
    case "captures":
      return "Captures";
    case "action":
      return `${d.projectName} · Actions`;
    case "subdirectory":
      return `${d.projectName} · ${d.subdir}`;
  }
}

interface DestinationPickerProps {
  value: QuickCaptureDestination;
  onChange: (next: QuickCaptureDestination) => void;
  projects: Project[];
  disabled?: boolean;
}

interface Row {
  destination: QuickCaptureDestination;
  label: string;
  /** Free-text label used for filtering. */
  search: string;
}

function buildRows(projects: Project[]): Row[] {
  const rows: Row[] = [
    {
      destination: CAPTURES_DESTINATION,
      label: "Captures",
      search: "captures inbox",
    },
  ];
  for (const project of projects) {
    rows.push({
      destination: {
        kind: "action",
        projectPath: project.path,
        projectName: project.name,
      },
      label: `${project.name} · Actions`,
      search: `${project.name} actions`,
    });
    for (const subdir of project.subdirectories) {
      rows.push({
        destination: {
          kind: "subdirectory",
          projectPath: project.path,
          projectName: project.name,
          subdir,
        },
        label: `${project.name} · ${subdir}`,
        search: `${project.name} ${subdir}`,
      });
    }
  }
  return rows;
}

function isSameDestination(
  a: QuickCaptureDestination,
  b: QuickCaptureDestination,
): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "captures") return true;
  if (a.kind === "action" && b.kind === "action") {
    return a.projectPath === b.projectPath;
  }
  if (a.kind === "subdirectory" && b.kind === "subdirectory") {
    return a.projectPath === b.projectPath && a.subdir === b.subdir;
  }
  return false;
}

export function DestinationPicker({
  value,
  onChange,
  projects,
  disabled,
}: DestinationPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const rows = useMemo(() => buildRows(projects), [projects]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.search.toLowerCase().includes(q));
  }, [rows, query]);

  // Reset cursor when the filtered list shifts under it.
  useEffect(() => {
    setCursor(0);
  }, [query]);

  // Focus the filter input when the panel opens.
  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
    } else {
      setQuery("");
    }
  }, [open]);

  const close = useCallback(() => setOpen(false), []);

  // Close on click outside the panel + trigger.
  useEffect(() => {
    if (!open) return;
    function onDocPointer(event: MouseEvent) {
      const target = event.target as globalThis.Node | null;
      if (!target) return;
      if (panelRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      close();
    }
    document.addEventListener("mousedown", onDocPointer);
    return () => document.removeEventListener("mousedown", onDocPointer);
  }, [open, close]);

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      triggerRef.current?.focus();
      return;
    }
    const count = filtered.length;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => (count === 0 ? 0 : (c + 1) % count));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => (count === 0 ? 0 : (c - 1 + count) % count));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const row = filtered[cursor];
      if (row) {
        onChange(row.destination);
        close();
      }
    }
  }

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded border border-border-subtle bg-bg-base px-2.5",
          "text-sm text-fg-primary",
          "transition-colors duration-fast ease-swift",
          "hover:border-border-strong focus:border-accent focus:outline-none",
          "disabled:cursor-not-allowed disabled:opacity-50",
        )}
      >
        <DestinationIcon destination={value} />
        <span className="truncate max-w-[12rem]">{destinationLabel(value)}</span>
        <ChevronDown className="h-3 w-3 text-fg-muted" strokeWidth={2} />
      </button>

      {open ? (
        <div
          ref={panelRef}
          role="listbox"
          className={cn(
            "absolute bottom-full left-0 z-50 mb-1.5 w-72 overflow-hidden",
            "rounded-lg border border-border-subtle bg-bg-surface shadow-elevated",
          )}
        >
          <div className="flex items-center gap-2 border-b border-border-subtle px-2.5 py-2">
            <Search className="h-3.5 w-3.5 shrink-0 text-fg-muted" strokeWidth={1.75} />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Filter destinations…"
              aria-label="Filter destinations"
              className="min-w-0 flex-1 bg-transparent text-sm text-fg-primary placeholder:text-fg-muted focus:outline-none"
            />
          </div>
          <div className="max-h-60 overflow-auto py-1" role="presentation">
            {filtered.length === 0 ? (
              <p className="px-3 py-4 text-center text-xs text-fg-muted">
                No matching destinations
              </p>
            ) : (
              filtered.map((row, i) => (
                <DestinationRow
                  key={
                    row.destination.kind === "captures"
                      ? "captures"
                      : row.destination.kind === "action"
                        ? `a:${row.destination.projectPath}`
                        : `s:${row.destination.projectPath}:${row.destination.subdir}`
                  }
                  row={row}
                  selected={isSameDestination(row.destination, value)}
                  highlighted={i === cursor}
                  onHover={() => setCursor(i)}
                  onSelect={() => {
                    onChange(row.destination);
                    close();
                  }}
                />
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DestinationRow({
  row,
  selected,
  highlighted,
  onHover,
  onSelect,
}: {
  row: Row;
  selected: boolean;
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
        "flex w-full items-center gap-2.5 px-3 py-2 text-left",
        "transition-colors duration-fast ease-swift",
        highlighted ? "bg-bg-elevated" : "hover:bg-bg-elevated/60",
      )}
    >
      <DestinationIcon destination={row.destination} />
      <span className="min-w-0 flex-1 truncate text-sm text-fg-primary">
        {row.label}
      </span>
      {selected ? (
        <span className="text-2xs uppercase tracking-wider text-accent">Current</span>
      ) : null}
    </button>
  );
}

function DestinationIcon({ destination }: { destination: QuickCaptureDestination }) {
  const className = "h-3.5 w-3.5 shrink-0 text-fg-muted";
  const strokeWidth = 1.75;
  if (destination.kind === "captures") {
    return <Inbox className={className} strokeWidth={strokeWidth} />;
  }
  if (destination.kind === "action") {
    return <ListTodo className={className} strokeWidth={strokeWidth} />;
  }
  return <Folder className={className} strokeWidth={strokeWidth} />;
}
