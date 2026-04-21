import { forwardRef, type HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

const badgeVariants = cva(
  [
    "inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5",
    "text-2xs font-medium leading-none",
    "border",
  ],
  {
    variants: {
      tone: {
        neutral:
          "border-border-subtle bg-bg-elevated text-fg-secondary",
        accent:
          "border-accent-muted/40 bg-accent-muted/20 text-accent",
        danger: "border-danger/30 bg-danger/10 text-danger",
      },
    },
    defaultVariants: {
      tone: "neutral",
    },
  },
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, tone, ...props }, ref) => (
    <span ref={ref} className={cn(badgeVariants({ tone }), className)} {...props} />
  ),
);
Badge.displayName = "Badge";
