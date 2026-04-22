/**
 * Soft-delete a project after a typed-name confirmation. The confirmation
 * isn't about reversibility (the project can be restored from Trash) — it
 * exists to make "delete" deliberately slower than an idle click on the
 * three-dot menu, since a project can contain a lot of user work.
 */
import { useEffect, useMemo, useState } from "react";
import { FolderKanban } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/ds/Dialog";
import { Button } from "@/ds/Button";
import { Input } from "@/ds/Input";
import { useDeleteProject, useTreeQuery } from "@/lib/queries";

export interface DeleteProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectPath: string;
  projectName: string;
  /** Called after the backend confirms the delete. */
  onDeleted?: () => void;
}

export function DeleteProjectDialog({
  open,
  onOpenChange,
  projectPath,
  projectName,
  onDeleted,
}: DeleteProjectDialogProps) {
  const [confirmation, setConfirmation] = useState("");
  const [serverError, setServerError] = useState<string | null>(null);
  const deleteProject = useDeleteProject();
  const treeQuery = useTreeQuery();

  // Reset the confirmation field whenever the dialog reopens.
  useEffect(() => {
    if (open) {
      setConfirmation("");
      setServerError(null);
    }
  }, [open]);

  const project = useMemo(
    () =>
      treeQuery.data?.projects.find((p) => p.path === projectPath),
    [treeQuery.data, projectPath],
  );

  // Exact-case match — "Foo" ≠ "foo" ≠ "Foo ". Users have to type the
  // name as shown, which makes accidental deletes meaningfully harder.
  const confirmed = confirmation === projectName;
  const disableDelete = !confirmed || deleteProject.isPending;

  function handleDelete() {
    if (disableDelete) return;
    setServerError(null);
    deleteProject.mutate(projectPath, {
      onSuccess: () => {
        onOpenChange(false);
        onDeleted?.();
      },
      onError: (err) => setServerError(extractMessage(err)),
    });
  }

  const actionsCount = project?.actions.length ?? 0;
  const subfoldersCount = project?.subdirectories.length ?? 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setServerError(null);
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Delete <span className="font-mono">{projectName}</span>?
          </DialogTitle>
          <DialogDescription>
            This project and everything in it will be moved to Trash. You can
            restore it later from the Trash page.
          </DialogDescription>
        </DialogHeader>

        {actionsCount > 0 || subfoldersCount > 0 ? (
          <div className="flex items-center gap-2 rounded-md border border-border-subtle bg-bg-elevated/50 px-3 py-2 text-xs text-fg-secondary">
            <FolderKanban className="h-3.5 w-3.5 text-fg-muted" strokeWidth={1.75} />
            <span>
              {actionsCount > 0
                ? `${actionsCount} open action${actionsCount === 1 ? "" : "s"}`
                : null}
              {actionsCount > 0 && subfoldersCount > 0 ? " · " : null}
              {subfoldersCount > 0
                ? `${subfoldersCount} subfolder${subfoldersCount === 1 ? "" : "s"}`
                : null}
              {" will be moved."}
            </span>
          </div>
        ) : null}

        <div className="mt-4 flex flex-col gap-1.5">
          <label
            htmlFor="delete-project-confirmation"
            className="text-xs text-fg-secondary"
          >
            Type <span className="font-mono text-fg-primary">{projectName}</span>{" "}
            to confirm.
          </label>
          <Input
            id="delete-project-confirmation"
            autoFocus
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            placeholder={projectName}
            aria-label="Type the project name to confirm deletion"
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        {serverError ? (
          <p role="alert" className="mt-2 text-xs text-danger">
            {serverError}
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
            variant="danger"
            size="md"
            type="button"
            onClick={handleDelete}
            disabled={disableDelete}
          >
            {deleteProject.isPending ? "Deleting…" : "Delete project"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
