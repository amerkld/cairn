/**
 * Keyboard shortcuts reference. Opens via the global `?` key; also
 * reachable from the command palette and Settings.
 *
 * The list here is the source of truth — if a new shortcut lands, add a
 * row here so it's discoverable, and add the key binding in
 * `GlobalShortcuts.tsx`.
 */
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/ds/Dialog";
import { Keyboard } from "lucide-react";
import { cn } from "@/lib/cn";

interface Shortcut {
  group: string;
  keys: string[];
  label: string;
}

/** Modifier label: on macOS the accelerator rendering of Ctrl is usually ⌘. */
const MOD = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform)
  ? "⌘"
  : "Ctrl";

const SHORTCUTS: ReadonlyArray<Shortcut> = [
  { group: "Global", keys: [MOD, "K"], label: "Open command palette" },
  { group: "Global", keys: [MOD, "N"], label: "New capture" },
  { group: "Global", keys: ["?"], label: "Show this shortcuts sheet" },
  { group: "Dialogs", keys: ["Esc"], label: "Close dialog / palette" },
  { group: "Lists & palette", keys: ["↑", "↓"], label: "Move selection" },
  { group: "Lists & palette", keys: ["Enter"], label: "Open / confirm" },
];

interface ShortcutsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ShortcutsSheet({ open, onOpenChange }: ShortcutsSheetProps) {
  const groups = groupShortcuts(SHORTCUTS);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0">
        <DialogHeader className="border-b border-border-subtle px-5 pb-4 pt-5">
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="h-4 w-4 text-fg-muted" strokeWidth={1.75} />
            Keyboard shortcuts
          </DialogTitle>
          <DialogDescription>
            The quick way around Cairn.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5 px-5 py-4">
          {groups.map((group) => (
            <section key={group.name} className="flex flex-col gap-2">
              <h3 className="text-2xs font-medium uppercase tracking-wider text-fg-muted">
                {group.name}
              </h3>
              <ul className="flex flex-col">
                {group.items.map((item) => (
                  <li
                    key={item.label}
                    className="flex items-center justify-between gap-3 py-1.5"
                  >
                    <span className="min-w-0 truncate text-sm text-fg-secondary">
                      {item.label}
                    </span>
                    <div className="flex shrink-0 items-center gap-1">
                      {item.keys.map((k, idx) => (
                        <span key={idx} className="flex items-center gap-1">
                          <Kbd>{k}</Kbd>
                          {idx < item.keys.length - 1 ? (
                            <span className="text-2xs text-fg-muted">+</span>
                          ) : null}
                        </span>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Kbd({ children }: { children: string }) {
  return (
    <kbd
      className={cn(
        "inline-flex min-w-[1.5rem] items-center justify-center rounded-sm",
        "border border-border-subtle bg-bg-elevated px-1.5 py-0.5",
        "font-mono text-2xs text-fg-secondary",
      )}
    >
      {children}
    </kbd>
  );
}

function groupShortcuts(
  items: ReadonlyArray<Shortcut>,
): Array<{ name: string; items: Shortcut[] }> {
  const order: string[] = [];
  const map = new Map<string, Shortcut[]>();
  for (const item of items) {
    if (!map.has(item.group)) {
      map.set(item.group, []);
      order.push(item.group);
    }
    map.get(item.group)!.push(item);
  }
  return order.map((name) => ({ name, items: map.get(name)! }));
}
