/**
 * Accessible on/off toggle — `role="switch"` so assistive tech reports it
 * as a two-state control rather than a button.
 *
 * Controlled via `checked` + `onCheckedChange`; we don't track internal
 * state so callers remain the single source of truth (mirrors the pattern
 * Radix uses and keeps this component stateless-by-design).
 *
 * Colors come from design tokens: `--accent` on, `--bg-elevated` off, with
 * the focus ring riding the same `--accent` so it matches the rest of the app.
 */
import { forwardRef, type ButtonHTMLAttributes, type KeyboardEvent } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

const switchRoot = cva(
  [
    "relative inline-flex shrink-0 cursor-pointer items-center rounded-full",
    "border border-border-subtle",
    "transition-colors duration-fast ease-swift",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base",
    "disabled:cursor-not-allowed disabled:opacity-50",
    "data-[state=checked]:bg-accent data-[state=unchecked]:bg-bg-elevated",
  ],
  {
    variants: {
      size: {
        sm: "h-4 w-7",
        md: "h-5 w-9",
      },
    },
    defaultVariants: {
      size: "md",
    },
  },
);

const switchThumb = cva(
  [
    "pointer-events-none block rounded-full bg-fg-primary shadow-sm",
    "transition-transform duration-fast ease-swift",
  ],
  {
    variants: {
      size: {
        sm: "h-3 w-3 data-[state=checked]:translate-x-3 data-[state=unchecked]:translate-x-0.5",
        md: "h-4 w-4 data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0.5",
      },
    },
    defaultVariants: {
      size: "md",
    },
  },
);

export interface SwitchProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onChange">,
    VariantProps<typeof switchRoot> {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

export const Switch = forwardRef<HTMLButtonElement, SwitchProps>(
  ({ className, size, checked, onCheckedChange, disabled, onKeyDown, ...props }, ref) => {
    const state = checked ? "checked" : "unchecked";

    function handleKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
      onKeyDown?.(e);
      if (e.defaultPrevented || disabled) return;
      // Space is the native activation key for a switch; Enter is supported
      // so the toggle behaves consistently with buttons elsewhere in the app.
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        onCheckedChange(!checked);
      }
    }

    return (
      <button
        ref={ref}
        type="button"
        role="switch"
        aria-checked={checked}
        data-state={state}
        disabled={disabled}
        onClick={() => onCheckedChange(!checked)}
        onKeyDown={handleKeyDown}
        className={cn(switchRoot({ size }), className)}
        {...props}
      >
        <span data-state={state} className={cn(switchThumb({ size }))} />
      </button>
    );
  },
);
Switch.displayName = "Switch";
