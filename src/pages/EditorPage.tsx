/**
 * Editor page — the screen you see after clicking a capture (or action).
 *
 * Owns:
 * - fetching the note from disk
 * - local editing state (body + frontmatter) and dirty tracking
 * - debounced autosave (1.5s after last keystroke)
 * - image paste → `assets/` via the backend, returning a relative URL
 * - a back button that returns to the page the user came from
 */
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/ds/Button";
import { Editor } from "@/editor/Editor";
import { FrontmatterBar } from "@/editor/FrontmatterBar";
import { api, type Frontmatter } from "@/lib/invoke";
import { useNoteQuery, useTrashNote, useWriteNote } from "@/lib/queries";
import { useRoute, type ReturnableRoute } from "@/shell/routing";
import { cn } from "@/lib/cn";

const AUTOSAVE_DEBOUNCE_MS = 1500;

interface EditorPageProps {
  notePath: string;
  returnTo: ReturnableRoute;
}

export function EditorPage({ notePath, returnTo }: EditorPageProps) {
  const route = useRoute();
  const noteQuery = useNoteQuery(notePath);
  const writeNote = useWriteNote();
  const trashNote = useTrashNote();

  const [body, setBody] = useState<string>("");
  const [frontmatter, setFrontmatter] = useState<Frontmatter>({});
  const [dirty, setDirty] = useState(false);
  const timerRef = useRef<number | null>(null);
  // Used to tell Editor "we've loaded a different note, reset your content".
  const [resetKey, setResetKey] = useState(notePath);

  // Hydrate local state whenever the remote note resolves.
  useEffect(() => {
    if (!noteQuery.data) return;
    setBody(noteQuery.data.body);
    setFrontmatter(noteQuery.data.frontmatter);
    setDirty(false);
    setResetKey(`${notePath}#${noteQuery.dataUpdatedAt}`);
  }, [noteQuery.data, noteQuery.dataUpdatedAt, notePath]);

  // Debounced save. Any change to body/frontmatter clears-and-reschedules.
  useEffect(() => {
    if (!dirty) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      writeNote.mutate(
        { path: notePath, note: { frontmatter, body } },
        { onSuccess: () => setDirty(false) },
      );
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // writeNote identity is stable; excluded to avoid re-triggering on every mutation state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, body, frontmatter, notePath]);

  function flushSave() {
    if (!dirty) return;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    writeNote.mutate(
      { path: notePath, note: { frontmatter, body } },
      { onSuccess: () => setDirty(false) },
    );
  }

  function trashAndExit() {
    // Cancel any pending autosave — writing after trashing would recreate
    // the note at its original path.
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setDirty(false);
    trashNote.mutate(notePath, {
      onSuccess: () => route.navigate({ page: returnTo }),
    });
  }

  async function handleImagePaste(file: File): Promise<string | null> {
    const ext = file.name.includes(".")
      ? file.name.split(".").pop() ?? ""
      : file.type.slice("image/".length);
    const bytes = new Uint8Array(await file.arrayBuffer());
    try {
      return await api.pasteImage(notePath, ext, Array.from(bytes));
    } catch {
      return null;
    }
  }

  const isActionNote = notePath.includes("/Actions/") || notePath.includes("\\Actions\\");

  return (
    <div className="flex h-full flex-col">
      <Toolbar
        onBack={() => {
          flushSave();
          route.navigate({ page: returnTo });
        }}
        onTrash={trashAndExit}
        isTrashing={trashNote.isPending}
        saveState={
          writeNote.isPending
            ? "saving"
            : writeNote.isError
              ? "error"
              : dirty
                ? "dirty"
                : "saved"
        }
      />
      {noteQuery.isLoading ? (
        <LoadingState />
      ) : noteQuery.isError ? (
        <ErrorState message={String((noteQuery.error as Error | null)?.message ?? "Couldn't load note")} />
      ) : (
        <>
          <FrontmatterBar
            frontmatter={frontmatter}
            onChange={(next) => {
              setFrontmatter(next);
              setDirty(true);
            }}
            showDeadline={isActionNote}
          />
          <div className="min-h-0 flex-1 overflow-hidden">
            <Editor
              initialBody={body}
              resetKey={resetKey}
              onChange={(next) => {
                setBody(next);
                setDirty(true);
              }}
              onBlur={flushSave}
              onImagePaste={handleImagePaste}
            />
          </div>
        </>
      )}
    </div>
  );
}

function Toolbar({
  onBack,
  onTrash,
  isTrashing,
  saveState,
}: {
  onBack: () => void;
  onTrash: () => void;
  isTrashing: boolean;
  saveState: "saved" | "saving" | "dirty" | "error";
}) {
  return (
    <div className="flex h-11 shrink-0 items-center justify-between border-b border-border-subtle bg-bg-base px-4">
      <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5">
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
        Back
      </Button>
      <div className="flex items-center gap-3">
        <SaveIndicator state={saveState} />
        <Button
          variant="ghost"
          size="sm"
          onClick={onTrash}
          disabled={isTrashing}
          aria-label="Move note to trash"
          className="gap-1.5 text-fg-muted hover:text-danger"
        >
          <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
          {isTrashing ? "Trashing…" : "Trash"}
        </Button>
      </div>
    </div>
  );
}

function SaveIndicator({ state }: { state: "saved" | "saving" | "dirty" | "error" }) {
  const label =
    state === "saving"
      ? "Saving"
      : state === "dirty"
        ? "Unsaved"
        : state === "error"
          ? "Save failed"
          : "Saved";
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex items-center gap-1.5 text-2xs uppercase tracking-wider",
        state === "error" ? "text-danger" : "text-fg-muted",
      )}
    >
      {state === "saving" ? (
        <Loader2 className="h-3 w-3 animate-spin" strokeWidth={1.75} />
      ) : state === "saved" ? (
        <Check className="h-3 w-3" strokeWidth={2} />
      ) : null}
      <span>{label}</span>
    </div>
  );
}

function LoadingState() {
  return (
    <div
      role="status"
      aria-label="Loading note"
      className="flex min-h-0 flex-1 flex-col"
    >
      {/* Metadata bar placeholder — matches FrontmatterBar's inner column. */}
      <div className="border-b border-border-subtle bg-bg-surface/60 px-10 py-4">
        <div
          className="mx-auto"
          style={{ maxWidth: "var(--editor-max-width)" }}
        >
          <div className="h-7 w-1/2 animate-pulse rounded bg-bg-elevated" />
          <div className="mt-3 flex items-center gap-2">
            <div className="h-4 w-16 animate-pulse rounded bg-bg-elevated" />
            <div className="h-4 w-20 animate-pulse rounded bg-bg-elevated" />
          </div>
        </div>
      </div>
      {/* Body placeholder — a stack of varying-width lines. */}
      <div
        className="mx-auto flex w-full flex-col gap-3 px-6 py-8"
        style={{ maxWidth: "var(--editor-max-width)" }}
      >
        {[92, 78, 88, 68, 84, 70].map((w, i) => (
          <div
            key={i}
            className="h-3 animate-pulse rounded bg-bg-elevated"
            style={{ width: `${w}%` }}
          />
        ))}
      </div>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center p-10 text-center">
      <div className="flex max-w-md flex-col gap-2">
        <h2 className="text-base font-medium text-fg-primary">Couldn't open this note</h2>
        <p className="text-sm text-fg-secondary">{message}</p>
      </div>
    </div>
  );
}
