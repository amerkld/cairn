import * as D from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type ElementRef,
  type HTMLAttributes,
} from "react";
import { cn } from "@/lib/cn";

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogPortal = D.Portal;
export const DialogClose = D.Close;

export const DialogOverlay = forwardRef<
  ElementRef<typeof D.Overlay>,
  ComponentPropsWithoutRef<typeof D.Overlay>
>(({ className, ...props }, ref) => (
  <D.Overlay
    ref={ref}
    className={cn("fixed inset-0 z-40 bg-bg-overlay/70 backdrop-blur-sm", className)}
    {...props}
  />
));
DialogOverlay.displayName = "DialogOverlay";

export const DialogContent = forwardRef<
  ElementRef<typeof D.Content>,
  ComponentPropsWithoutRef<typeof D.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <D.Content
      ref={ref}
      className={cn(
        "fixed left-1/2 top-1/2 z-50 w-[90vw] max-w-md -translate-x-1/2 -translate-y-1/2",
        "rounded-xl border border-border-subtle bg-bg-surface p-5 shadow-elevated",
        "focus:outline-none",
        className,
      )}
      {...props}
    >
      {children}
      <D.Close
        aria-label="Close"
        className={cn(
          "absolute right-3 top-3 inline-flex h-7 w-7 items-center justify-center rounded",
          "text-fg-muted transition-colors duration-fast ease-swift",
          "hover:bg-bg-elevated hover:text-fg-primary",
        )}
      >
        <X className="h-3.5 w-3.5" strokeWidth={1.75} />
      </D.Close>
    </D.Content>
  </DialogPortal>
));
DialogContent.displayName = "DialogContent";

export const DialogHeader = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("mb-4 flex flex-col gap-1", className)} {...props} />
);

export const DialogTitle = forwardRef<
  ElementRef<typeof D.Title>,
  ComponentPropsWithoutRef<typeof D.Title>
>(({ className, ...props }, ref) => (
  <D.Title
    ref={ref}
    className={cn("text-base font-semibold text-fg-primary", className)}
    {...props}
  />
));
DialogTitle.displayName = "DialogTitle";

export const DialogDescription = forwardRef<
  ElementRef<typeof D.Description>,
  ComponentPropsWithoutRef<typeof D.Description>
>(({ className, ...props }, ref) => (
  <D.Description
    ref={ref}
    className={cn("text-sm text-fg-secondary", className)}
    {...props}
  />
));
DialogDescription.displayName = "DialogDescription";

export const DialogFooter = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("mt-5 flex justify-end gap-2", className)} {...props} />
);
