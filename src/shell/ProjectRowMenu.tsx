/**
 * Three-dot dropdown shared by the sidebar project list and the project
 * page header. Both entry points offer the same two actions (Rename /
 * Delete), so the menu lives in one place and the callers only differ in
 * how the trigger is revealed — hover-only on the sidebar so the row
 * still feels clean at rest, always visible in the header where space is
 * deliberate.
 */
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/ds/DropdownMenu";
import { cn } from "@/lib/cn";

export type ProjectRowMenuVariant = "hover" | "static";

export interface ProjectRowMenuProps {
  projectName: string;
  onRename: () => void;
  onDelete: () => void;
  /**
   * `hover` fades the trigger in on group-hover (sidebar rows). `static`
   * leaves it fully visible at all times (project page header). Defaults
   * to `static`.
   */
  variant?: ProjectRowMenuVariant;
  /** Stop click events from reaching enclosing buttons (e.g. the sidebar row). */
  stopPropagation?: boolean;
  className?: string;
}

export const ProjectRowMenu = forwardRef<HTMLButtonElement, ProjectRowMenuProps>(
  (
    {
      projectName,
      onRename,
      onDelete,
      variant = "static",
      stopPropagation = false,
      className,
    },
    ref,
  ) => {
    const onTriggerClick: ButtonHTMLAttributes<HTMLButtonElement>["onClick"] = (
      e,
    ) => {
      if (stopPropagation) e.stopPropagation();
    };

    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            ref={ref}
            type="button"
            aria-label={`More actions for ${projectName}`}
            onClick={onTriggerClick}
            className={cn(
              "inline-flex h-6 w-6 items-center justify-center rounded",
              "text-fg-muted",
              "transition-opacity duration-fast ease-swift",
              "hover:bg-bg-elevated hover:text-fg-primary",
              "focus-visible:opacity-100",
              "data-[state=open]:opacity-100",
              variant === "hover"
                ? "opacity-0 group-hover:opacity-100"
                : "opacity-100",
              className,
            )}
          >
            <MoreHorizontal className="h-3.5 w-3.5" strokeWidth={1.75} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={onRename}>
            <Pencil className="h-4 w-4 text-fg-muted" strokeWidth={1.75} />
            Rename…
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={onDelete}
            className="text-danger data-[highlighted]:text-danger"
          >
            <Trash2 className="h-4 w-4 text-danger/80" strokeWidth={1.75} />
            Delete…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  },
);
ProjectRowMenu.displayName = "ProjectRowMenu";
