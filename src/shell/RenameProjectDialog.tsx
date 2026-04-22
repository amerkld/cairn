/**
 * Rename a project. Pre-fills the current name, validates live against
 * the other projects in the tree so the user sees a collision hint before
 * they hit Save rather than after the backend rejects it, and then hands
 * the new path back to the caller so it can update the route.
 *
 * The sidebar and project page both open this same dialog — keeping rename
 * UX consistent with the `NewProjectDialog` pattern used elsewhere.
 */
import { useEffect, useState, type FormEvent } from "react";
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
import { useRenameProject, useTreeQuery } from "@/lib/queries";

export interface RenameProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectPath: string;
  projectName: string;
  /** Called with the new (vault-relative) project path on success. */
  onRenamed?: (newPath: string) => void;
}

export function RenameProjectDialog({
  open,
  onOpenChange,
  projectPath,
  projectName,
  onRenamed,
}: RenameProjectDialogProps) {
  const [name, setName] = useState(projectName);
  const [serverError, setServerError] = useState<string | null>(null);
  const renameProject = useRenameProject();
  const treeQuery = useTreeQuery();

  // Reset the field whenever the dialog opens so each open starts from the
  // current name rather than whatever was last typed.
  useEffect(() => {
    if (open) {
      setName(projectName);
      setServerError(null);
    }
  }, [open, projectName]);

  const trimmed = name.trim();
  const otherNames = (treeQuery.data?.projects ?? [])
    .filter((p) => p.path !== projectPath)
    .map((p) => p.name.toLowerCase());
  const unchanged = trimmed === projectName;
  const collides =
    trimmed.length > 0 && otherNames.includes(trimmed.toLowerCase());

  const validationHint = trimmed.length === 0
    ? "Name is required."
    : collides
    ? `A project named "${trimmed}" already exists.`
    : null;

  const disableSubmit =
    renameProject.isPending || trimmed.length === 0 || unchanged || collides;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (disableSubmit) return;
    setServerError(null);
    renameProject.mutate(
      { oldPath: projectPath, newName: trimmed },
      {
        onSuccess: (newPath) => {
          onOpenChange(false);
          onRenamed?.(newPath);
        },
        onError: (err) => setServerError(extractMessage(err)),
      },
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setServerError(null);
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Rename project</DialogTitle>
            <DialogDescription>
              The folder under{" "}
              <code className="font-mono text-fg-primary">Projects/</code>{" "}
              will be renamed. Notes inside keep their content exactly as-is.
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Project name"
            aria-label="Project name"
            aria-invalid={validationHint != null ? true : undefined}
          />
          {validationHint ? (
            <p className="mt-2 text-xs text-fg-muted">{validationHint}</p>
          ) : null}
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
              variant="primary"
              size="md"
              type="submit"
              disabled={disableSubmit}
            >
              {renameProject.isPending ? "Renaming…" : "Rename"}
            </Button>
          </DialogFooter>
        </form>
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
