/**
 * The Cairn logo, rendered from the PNG asset in `src/assets/logo.png`.
 * Kept as a tiny shared component so size + alt text are consistent across
 * the title bar, vault picker, and settings dialog.
 */
import logoUrl from "@/assets/logo.png";
import { cn } from "@/lib/cn";

interface CairnLogoProps {
  size?: number;
  className?: string;
}

export function CairnLogo({ size = 14, className }: CairnLogoProps) {
  return (
    <img
      src={logoUrl}
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      draggable={false}
      className={cn("select-none", className)}
      style={{ width: size, height: size }}
    />
  );
}
