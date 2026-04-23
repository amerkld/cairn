/**
 * Subscribe the frontend to backend events that should invalidate cached
 * queries.
 *   - `vault.changed` → tree / folder / home-actions are stale
 *   - `reminder_due`  → a reminder fired; reminders + home are stale and
 *     the UI shows a transient in-app toast via `useReminderToasts`.
 *
 * Mount `useVaultEventSubscriptions()` once near the root.
 */
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";
import { queryKeys } from "./queries";

interface VaultChangedPayload {
  paths: string[];
}

export interface ReminderDuePayload {
  path: string;
  title: string;
  remindAt: string;
}

/**
 * Payload of the `tray:navigate` event emitted by the Rust tray handler
 * when a menu item should deep-link the main window. The shape mirrors
 * `tray::TrayNavigate` (tagged union with `target`).
 */
export type TrayNavigatePayload =
  | { target: "captures" }
  | { target: "project"; path: string };

export function useVaultEventSubscriptions(): void {
  const qc = useQueryClient();
  useEffect(() => {
    const cleanups: Array<() => void> = [];
    let active = true;

    listen<VaultChangedPayload>("vault.changed", () => {
      qc.invalidateQueries({ queryKey: queryKeys.tree });
      qc.invalidateQueries({ queryKey: queryKeys.homeActions });
      qc.invalidateQueries({ queryKey: queryKeys.reminders });
      qc.invalidateQueries({ queryKey: queryKeys.tags });
      qc.invalidateQueries({ queryKey: queryKeys.trash });
      // Invalidate every open folder browser at once — cheap, and the docs
      // browser expects to reflect external edits promptly.
      qc.invalidateQueries({ queryKey: ["folder"] });
    }).then((unlisten) => {
      if (active) cleanups.push(unlisten);
      else unlisten();
    });

    listen<ReminderDuePayload>("reminder_due", () => {
      qc.invalidateQueries({ queryKey: queryKeys.reminders });
      qc.invalidateQueries({ queryKey: queryKeys.homeActions });
    }).then((unlisten) => {
      if (active) cleanups.push(unlisten);
      else unlisten();
    });

    return () => {
      active = false;
      cleanups.forEach((c) => c());
    };
  }, [qc]);
}

/**
 * Collect `reminder_due` events into a short-lived toast list. Each entry
 * auto-expires after 8 seconds; callers render them as in-app toasts.
 */
export function useReminderToasts(): {
  toasts: ReminderDuePayload[];
  dismiss: (path: string) => void;
} {
  const [toasts, setToasts] = useState<ReminderDuePayload[]>([]);

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    let active = true;

    listen<ReminderDuePayload>("reminder_due", (event) => {
      const payload = event.payload;
      setToasts((prev) => {
        // Dedupe by path so rapid re-fires don't stack.
        const without = prev.filter((t) => t.path !== payload.path);
        return [...without, payload];
      });
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.path !== payload.path));
      }, 8_000);
    }).then((unlisten) => {
      if (active) cleanup = unlisten;
      else unlisten();
    });

    return () => {
      active = false;
      cleanup?.();
    };
  }, []);

  function dismiss(path: string) {
    setToasts((prev) => prev.filter((t) => t.path !== path));
  }

  return { toasts, dismiss };
}

/**
 * Subscribe to the Rust-emitted `tray:navigate` event. The tray handler has
 * already shown + focused the main window by the time this fires; the
 * handler passed in just needs to route.
 *
 * The handler should be memoized (e.g. via `useCallback`) to avoid
 * re-subscribing on every render.
 */
export function useTrayNavigate(handler: (payload: TrayNavigatePayload) => void): void {
  useEffect(() => {
    let active = true;
    let cleanup: (() => void) | undefined;

    listen<TrayNavigatePayload>("tray:navigate", (event) => {
      handler(event.payload);
    }).then((unlisten) => {
      if (active) cleanup = unlisten;
      else unlisten();
    });

    return () => {
      active = false;
      cleanup?.();
    };
  }, [handler]);
}
