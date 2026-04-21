import * as Dd from "@radix-ui/react-dropdown-menu";
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from "react";
import { cn } from "@/lib/cn";

export const DropdownMenu = Dd.Root;
export const DropdownMenuTrigger = Dd.Trigger;
export const DropdownMenuPortal = Dd.Portal;
export const DropdownMenuSub = Dd.Sub;

export const DropdownMenuSubTrigger = forwardRef<
  ElementRef<typeof Dd.SubTrigger>,
  ComponentPropsWithoutRef<typeof Dd.SubTrigger>
>(({ className, children, ...props }, ref) => (
  <Dd.SubTrigger
    ref={ref}
    className={cn(
      "relative flex select-none items-center gap-2 rounded px-2 py-1.5",
      "text-sm text-fg-secondary outline-none",
      "data-[highlighted]:bg-bg-surface data-[highlighted]:text-fg-primary",
      "data-[state=open]:bg-bg-surface data-[state=open]:text-fg-primary",
      "cursor-default",
      className,
    )}
    {...props}
  >
    {children}
  </Dd.SubTrigger>
));
DropdownMenuSubTrigger.displayName = "DropdownMenuSubTrigger";

export const DropdownMenuSubContent = forwardRef<
  ElementRef<typeof Dd.SubContent>,
  ComponentPropsWithoutRef<typeof Dd.SubContent>
>(({ className, ...props }, ref) => (
  <Dd.SubContent
    ref={ref}
    className={cn(
      "z-50 min-w-48 overflow-hidden rounded-md border border-border-subtle",
      "bg-bg-elevated p-1 shadow-elevated",
      className,
    )}
    {...props}
  />
));
DropdownMenuSubContent.displayName = "DropdownMenuSubContent";

export const DropdownMenuContent = forwardRef<
  ElementRef<typeof Dd.Content>,
  ComponentPropsWithoutRef<typeof Dd.Content>
>(({ className, sideOffset = 6, ...props }, ref) => (
  <Dd.Portal>
    <Dd.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        "z-50 min-w-48 overflow-hidden rounded-md border border-border-subtle",
        "bg-bg-elevated p-1 shadow-elevated",
        className,
      )}
      {...props}
    />
  </Dd.Portal>
));
DropdownMenuContent.displayName = "DropdownMenuContent";

export const DropdownMenuItem = forwardRef<
  ElementRef<typeof Dd.Item>,
  ComponentPropsWithoutRef<typeof Dd.Item>
>(({ className, ...props }, ref) => (
  <Dd.Item
    ref={ref}
    className={cn(
      "relative flex select-none items-center gap-2 rounded px-2 py-1.5",
      "text-sm text-fg-secondary outline-none",
      "data-[highlighted]:bg-bg-surface data-[highlighted]:text-fg-primary",
      "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      "cursor-default",
      className,
    )}
    {...props}
  />
));
DropdownMenuItem.displayName = "DropdownMenuItem";

export const DropdownMenuSeparator = forwardRef<
  ElementRef<typeof Dd.Separator>,
  ComponentPropsWithoutRef<typeof Dd.Separator>
>(({ className, ...props }, ref) => (
  <Dd.Separator
    ref={ref}
    className={cn("-mx-1 my-1 h-px bg-border-subtle", className)}
    {...props}
  />
));
DropdownMenuSeparator.displayName = "DropdownMenuSeparator";

export const DropdownMenuLabel = forwardRef<
  ElementRef<typeof Dd.Label>,
  ComponentPropsWithoutRef<typeof Dd.Label>
>(({ className, ...props }, ref) => (
  <Dd.Label
    ref={ref}
    className={cn(
      "px-2 py-1.5 text-2xs font-medium uppercase tracking-wider text-fg-muted",
      className,
    )}
    {...props}
  />
));
DropdownMenuLabel.displayName = "DropdownMenuLabel";
