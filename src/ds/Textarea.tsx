import { forwardRef, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, rows = 3, ...props }, ref) => (
    <textarea
      ref={ref}
      rows={rows}
      className={cn(
        "w-full resize-none rounded border border-border-subtle bg-bg-base px-2.5 py-2",
        "text-sm leading-relaxed text-fg-primary placeholder:text-fg-muted",
        "transition-colors duration-fast ease-swift",
        "hover:border-border-strong",
        "focus:border-accent focus:outline-none",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";
