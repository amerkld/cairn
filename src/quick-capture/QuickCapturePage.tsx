/**
 * Floating Quick Capture dialog. Lives in its own Tauri window (see
 * `tauri.conf.json` label `quick-capture`) and its own Vite entry
 * (`/src/quick-capture/main.tsx`).
 *
 * Responsibilities:
 *  - Reset state on every open (listens for the `quick-capture:open` event
 *    the Rust side emits after showing the window).
 *  - Title (autofocus) + optional body + destination picker + Save button.
 *  - Route submit to the right IPC command per destination.
 *  - Dismiss the window (hide, not close) after submit / Esc.
 *  - Show a "no active vault" state when Cairn has no vault open, with a
 *    button to bring the main window to the foreground.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { listen } from "@tauri-apps/api/event";
import { useQueryClient } from "@tanstack/react-query";
import { Inbox } from "lucide-react";
import { Button } from "@/ds/Button";
import { Input } from "@/ds/Input";
import { Textarea } from "@/ds/Textarea";
import { api } from "@/lib/invoke";
import {
  queryKeys,
  useActiveVaultQuery,
  useCreateAction,
  useCreateCapture,
  useMoveNote,
  useTreeQuery,
} from "@/lib/queries";
import { cn } from "@/lib/cn";
import {
  DestinationPicker,
  CAPTURES_DESTINATION,
  type QuickCaptureDestination,
} from "./DestinationPicker";

export function QuickCapturePage() {
  const qc = useQueryClient();
  const vaultQuery = useActiveVaultQuery();
  const hasVault = !!vaultQuery.data;
  const treeQuery = useTreeQuery({ enabled: hasVault });

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [destination, setDestination] = useState<QuickCaptureDestination>(
    CAPTURES_DESTINATION,
  );
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const titleRef = useRef<HTMLInputElement | null>(null);

  const createCapture = useCreateCapture();
  const createAction = useCreateAction();
  const moveNote = useMoveNote();

  const projects = useMemo(
    () => treeQuery.data?.projects ?? [],
    [treeQuery.data?.projects],
  );

  const resetForm = useCallback(() => {
    setTitle("");
    setBody("");
    setDestination(CAPTURES_DESTINATION);
    setError(null);
    // Schedule focus after the DOM has committed the state update so the
    // focus lands on the cleared input rather than bouncing.
    window.setTimeout(() => titleRef.current?.focus(), 0);
  }, []);

  // Reset the form on every external open signal. Refetch the tree so
  // newly-created projects and subdirectories appear in the picker.
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let active = true;
    listen("quick-capture:open", () => {
      resetForm();
      qc.invalidateQueries({ queryKey: queryKeys.tree });
      qc.invalidateQueries({ queryKey: queryKeys.activeVault });
    }).then((fn) => {
      if (active) unlisten = fn;
      else fn();
    });
    return () => {
      active = false;
      unlisten?.();
    };
  }, [resetForm, qc]);

  const dismiss = useCallback(async () => {
    resetForm();
    try {
      await api.hideQuickCapture();
    } catch {
      // Hiding is best-effort; the next open event will reset state again.
    }
  }, [resetForm]);

  // App-level Escape handler. Each nested popover/input stops propagation
  // on its own Escape handling, so this only fires when Escape would
  // otherwise be a no-op.
  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        void dismiss();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dismiss]);

  const hasContent = title.trim().length > 0 || body.trim().length > 0;
  const canSubmit = hasVault && hasContent && !submitting;

  async function submit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const trimmedTitle = title.trim();
      const noteArgs: { title?: string; body?: string } = {
        ...(trimmedTitle.length > 0 && { title: trimmedTitle }),
        ...(body.length > 0 && { body }),
      };

      if (destination.kind === "captures") {
        await createCapture.mutateAsync(noteArgs);
      } else if (destination.kind === "action") {
        await createAction.mutateAsync({
          projectPath: destination.projectPath,
          ...noteArgs,
        });
      } else {
        // Subdirectory: create as capture, then move into the target folder.
        // This reuses fs::move_note (atomic inside-vault rename with
        // collision handling) rather than introducing a new command.
        const created = await createCapture.mutateAsync(noteArgs);
        const target = `Projects/${destination.projectName}/${destination.subdir}`;
        await moveNote.mutateAsync({ src: created.path, target });
      }

      await dismiss();
    } catch (e) {
      setError(extractMessage(e));
    } finally {
      setSubmitting(false);
    }
  }

  function handleTitleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    // Enter on the title line is "save now" — the common shape of a quick
    // capture is a one-liner, and Tab/Shift-Enter remain available to move
    // into the body when the user wants more.
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void submit();
    }
  }

  function handleBodyKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // Inside the textarea, plain Enter is a newline. Cmd/Ctrl+Enter submits.
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void submit();
    }
  }

  if (vaultQuery.isLoading) {
    return <BootSplash />;
  }

  if (!hasVault) {
    return <NoVaultEmptyState onDismiss={() => void dismiss()} />;
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-bg-base">
      <TitleBar />
      <div className="flex min-h-0 flex-1 flex-col gap-2 px-4 pb-3 pt-3">
        <Input
          ref={titleRef}
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={handleTitleKeyDown}
          placeholder="Title"
          aria-label="Capture title"
        />
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={handleBodyKeyDown}
          placeholder="Body (optional) — Ctrl/Cmd + Enter to save"
          aria-label="Capture body"
          rows={4}
          className="min-h-0 flex-1"
        />
      </div>
      {error ? (
        <p
          role="alert"
          className="border-t border-danger/30 bg-danger/10 px-4 py-1.5 text-xs text-danger"
        >
          {error}
        </p>
      ) : null}
      <footer className="flex items-center justify-between gap-3 border-t border-border-subtle bg-bg-surface px-3 py-2.5">
        <DestinationPicker
          value={destination}
          onChange={setDestination}
          projects={projects}
          disabled={submitting}
        />
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="md"
            onClick={() => void dismiss()}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={() => void submit()}
            disabled={!canSubmit}
          >
            {submitting ? "Saving…" : "Save"}
          </Button>
        </div>
      </footer>
    </div>
  );
}

// Thin draggable top strip so the undecorated window can be moved. Mirrors
// the pattern the main window's TitleBar uses.
function TitleBar() {
  return (
    <div
      data-tauri-drag-region
      className={cn(
        "flex h-7 shrink-0 select-none items-center gap-2 border-b border-border-subtle",
        "bg-bg-surface px-3 text-2xs uppercase tracking-wider text-fg-muted",
      )}
    >
      <Inbox className="h-3 w-3" strokeWidth={1.75} />
      Quick capture
    </div>
  );
}

function BootSplash() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Loading"
      className="flex h-screen items-center justify-center bg-bg-base"
    >
      <div className="h-2 w-24 overflow-hidden rounded-full bg-bg-elevated">
        <div className="h-full w-1/2 animate-pulse bg-border-strong" />
      </div>
    </div>
  );
}

function NoVaultEmptyState({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-bg-base">
      <TitleBar />
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
        <p className="text-sm text-fg-primary">No vault is open.</p>
        <p className="text-xs text-fg-muted">
          Open a vault in Cairn, then try again.
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              void api.focusMainWindow();
              onDismiss();
            }}
          >
            Go to Cairn
          </Button>
          <Button variant="ghost" size="sm" onClick={onDismiss}>
            Dismiss
          </Button>
        </div>
      </div>
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
