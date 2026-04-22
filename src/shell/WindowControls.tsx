import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Copy, Minus, Square, X } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Minimize / maximize / close trio drawn by Cairn itself. Used in place of the
 * OS default title-bar chrome (decorations are disabled in tauri.conf.json).
 * Buttons are flush to the top-right corner, full-height, no radius, and are
 * kept out of the tab order — matching native chrome conventions.
 */
const CHROME_BUTTON = cn(
  "inline-flex h-9 w-11 items-center justify-center",
  "text-fg-secondary outline-none",
  "transition-colors duration-fast ease-swift",
);

export function WindowControls() {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    const w = getCurrentWindow();
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    void (async () => {
      try {
        const initial = await w.isMaximized();
        if (!cancelled) setIsMaximized(initial);
        const u = await w.onResized(async () => {
          const v = await w.isMaximized();
          if (!cancelled) setIsMaximized(v);
        });
        if (cancelled) u();
        else unlisten = u;
      } catch {
        // In non-Tauri contexts (e.g. tests that don't mock) the window API
        // may be unavailable; fall back to the default "not maximized" state.
      }
    })();

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  return (
    <div className="flex h-full items-stretch" aria-label="Window controls">
      <button
        type="button"
        tabIndex={-1}
        aria-label="Minimize"
        className={cn(CHROME_BUTTON, "hover:bg-bg-elevated hover:text-fg-primary")}
        onClick={() => void getCurrentWindow().minimize()}
      >
        <Minus size={14} strokeWidth={1.5} />
      </button>
      <button
        type="button"
        tabIndex={-1}
        aria-label={isMaximized ? "Restore" : "Maximize"}
        className={cn(CHROME_BUTTON, "hover:bg-bg-elevated hover:text-fg-primary")}
        onClick={() => void getCurrentWindow().toggleMaximize()}
      >
        {isMaximized ? (
          <Copy size={12} strokeWidth={1.5} />
        ) : (
          <Square size={12} strokeWidth={1.5} />
        )}
      </button>
      <button
        type="button"
        tabIndex={-1}
        aria-label="Close"
        className={cn(CHROME_BUTTON, "hover:bg-danger hover:text-fg-primary")}
        onClick={() => void getCurrentWindow().close()}
      >
        <X size={14} strokeWidth={1.5} />
      </button>
    </div>
  );
}
