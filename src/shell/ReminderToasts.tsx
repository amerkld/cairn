/**
 * Transient in-app surface for reminder fires. The Rust scheduler also
 * posts an OS notification, but that's best-effort (users may have
 * notifications muted, or the app may already be focused). The in-app
 * toast guarantees the user always sees the signal while Cairn is open.
 *
 * Toasts auto-dismiss after 8 seconds; clicking the title opens the note
 * in the editor. Stacked bottom-right, one card per reminder, most-recent
 * on top.
 */
import { BellRing, X } from "lucide-react";
import { useReminderToasts } from "@/lib/tauri-events";
import { useRoute } from "./routing";
import { cn } from "@/lib/cn";

export function ReminderToasts() {
  const { toasts, dismiss } = useReminderToasts();
  const route = useRoute();

  if (toasts.length === 0) return null;

  return (
    <div
      role="region"
      aria-label="Reminder toasts"
      className="pointer-events-none fixed bottom-4 right-4 z-40 flex max-w-sm flex-col-reverse gap-2"
    >
      {toasts.map((toast) => (
        <div
          key={`${toast.path}-${toast.remindAt}`}
          role="status"
          className={cn(
            "pointer-events-auto flex items-start gap-3 rounded-lg border border-border-subtle",
            "bg-bg-surface p-3 shadow-elevated",
          )}
        >
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-muted/30">
            <BellRing className="h-3.5 w-3.5 text-accent" strokeWidth={1.75} />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-2xs font-medium uppercase tracking-wider text-fg-muted">
              Reminder
            </span>
            <button
              type="button"
              onClick={() => {
                dismiss(toast.path);
                route.navigate({
                  page: "editor",
                  notePath: toast.path,
                  returnTo: "home",
                });
              }}
              className="truncate text-left text-sm font-medium text-fg-primary hover:underline"
            >
              {toast.title}
            </button>
          </div>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => dismiss(toast.path)}
            className="inline-flex h-6 w-6 items-center justify-center rounded text-fg-muted hover:bg-bg-elevated hover:text-fg-primary"
          >
            <X className="h-3 w-3" strokeWidth={2} />
          </button>
        </div>
      ))}
    </div>
  );
}
