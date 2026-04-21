/**
 * Attach app-wide keyboard shortcuts. Mount once near the root inside a
 * vault-active context.
 *
 *   Ctrl/Cmd+N  → create a new capture and navigate to Captures
 *   Ctrl/Cmd+K  → toggle the command palette (always wins — "global")
 *   ?           → open the keyboard shortcuts sheet
 *
 * If you add a shortcut here, also add a row to `ShortcutsSheet` so it's
 * discoverable.
 */
import { useEffect, useState } from "react";
import { useCreateCapture } from "@/lib/queries";
import { useRoute } from "./routing";
import { CommandPalette } from "./CommandPalette";
import { ShortcutsSheet } from "./ShortcutsSheet";

export function GlobalShortcuts() {
  const createCapture = useCreateCapture();
  const route = useRoute();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const mod = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();

      // Ctrl/Cmd+K is always the palette — even when typing in a field.
      if (mod && key === "k") {
        event.preventDefault();
        setPaletteOpen((prev) => !prev);
        return;
      }

      // Remaining shortcuts skip when the user is typing in a form control.
      const target = event.target as HTMLElement | null;
      if (target && isEditableTarget(target)) return;

      if (mod && key === "n") {
        event.preventDefault();
        createCapture.mutate(undefined, {
          onSuccess: () => {
            route.navigate({ page: "captures" });
          },
        });
        return;
      }

      // `?` (Shift+/) opens the shortcuts sheet. No modifier required.
      if (!mod && event.key === "?") {
        event.preventDefault();
        setShortcutsOpen((prev) => !prev);
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [createCapture, route]);

  return (
    <>
      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        onOpenShortcuts={() => setShortcutsOpen(true)}
      />
      <ShortcutsSheet open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </>
  );
}

function isEditableTarget(el: HTMLElement): boolean {
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  return false;
}
