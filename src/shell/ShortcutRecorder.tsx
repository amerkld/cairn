/**
 * Click-to-record keyboard shortcut input. While focused, captures the next
 * modifier + key combo and returns a Tauri accelerator string like
 * "CommandOrControl+Shift+N".
 *
 * Design choices:
 *  - At least one modifier is required — a bare letter isn't a valid global
 *    shortcut on any desktop OS, and silently accepting one would set up a
 *    binding that fights the in-app keyboard.
 *  - Ctrl and Cmd collapse to the cross-platform `CommandOrControl` so the
 *    same stored accelerator works on macOS and Windows/Linux.
 *  - Esc cancels (exit record mode without changing value).
 *  - Reset button restores `defaultValue`.
 */
import { useRef, useState, type KeyboardEvent } from "react";
import { RotateCcw } from "lucide-react";
import { cn } from "@/lib/cn";

export interface ShortcutRecorderProps {
  value: string;
  onChange: (next: string) => void;
  /** Accelerator to restore when the reset button is clicked. */
  defaultValue: string;
  disabled?: boolean;
  /** Optional error message; displayed below the input when non-null. */
  error?: string | null;
  /** Accessible label; set when the surrounding row has no <label>. */
  "aria-label"?: string;
}

const MODIFIER_KEYS = new Set(["Control", "Meta", "Shift", "Alt", "AltGraph"]);

/**
 * Map a browser `KeyboardEvent.key` to the Tauri accelerator key token.
 * Returns `null` for inputs that can't be part of an accelerator (unknown
 * characters, bare modifiers). See:
 * https://docs.rs/tauri-plugin-global-shortcut/latest
 */
export function normalizeAcceleratorKey(key: string): string | null {
  if (MODIFIER_KEYS.has(key)) return null;
  if (/^[a-zA-Z]$/.test(key)) return key.toUpperCase();
  if (/^[0-9]$/.test(key)) return key;
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(key)) return key;
  const named: Record<string, string> = {
    " ": "Space",
    Space: "Space",
    ArrowUp: "Up",
    ArrowDown: "Down",
    ArrowLeft: "Left",
    ArrowRight: "Right",
    Enter: "Enter",
    Tab: "Tab",
    Backspace: "Backspace",
    Delete: "Delete",
    Insert: "Insert",
    Home: "Home",
    End: "End",
    PageUp: "PageUp",
    PageDown: "PageDown",
    "-": "Minus",
    "=": "Equal",
    "[": "BracketLeft",
    "]": "BracketRight",
    ";": "Semicolon",
    "'": "Quote",
    ",": "Comma",
    ".": "Period",
    "/": "Slash",
    "\\": "Backslash",
    "`": "Backquote",
  };
  return named[key] ?? null;
}

export function acceleratorFromEvent(e: KeyboardEvent<HTMLElement>): string | null {
  const key = normalizeAcceleratorKey(e.key);
  if (!key) return null;
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push("CommandOrControl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  // Require at least one modifier — a bare letter would collide with typing.
  if (parts.length === 0) return null;
  parts.push(key);
  return parts.join("+");
}

/**
 * Render a stored accelerator as human-friendly chunks. The raw form is what
 * we persist and send to Tauri; this is just for display.
 */
function formatAccelerator(acc: string): string {
  if (!acc) return "";
  return acc
    .split("+")
    .map((part) => {
      if (part === "CommandOrControl") return "Ctrl / ⌘";
      if (part === "Command" || part === "Cmd") return "⌘";
      if (part === "Control" || part === "Ctrl") return "Ctrl";
      if (part === "Alt" || part === "Option") return "Alt";
      if (part === "Shift") return "Shift";
      return part;
    })
    .join(" + ");
}

export function ShortcutRecorder({
  value,
  onChange,
  defaultValue,
  disabled,
  error,
  "aria-label": ariaLabel,
}: ShortcutRecorderProps) {
  const [recording, setRecording] = useState(false);
  const inputRef = useRef<HTMLButtonElement | null>(null);

  function handleKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (!recording) return;
    if (e.key === "Escape") {
      e.preventDefault();
      setRecording(false);
      inputRef.current?.blur();
      return;
    }
    // Prevent these from bubbling to app-level shortcuts while recording.
    e.preventDefault();
    e.stopPropagation();

    const acc = acceleratorFromEvent(e);
    if (!acc) return; // Not a valid combo yet; keep recording.
    onChange(acc);
    setRecording(false);
    inputRef.current?.blur();
  }

  function handleReset() {
    if (disabled) return;
    if (value !== defaultValue) onChange(defaultValue);
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1.5">
        <button
          ref={inputRef}
          type="button"
          aria-label={ariaLabel ?? "Record shortcut"}
          aria-pressed={recording}
          disabled={disabled}
          onClick={() => setRecording(true)}
          onFocus={() => setRecording(true)}
          onBlur={() => setRecording(false)}
          onKeyDown={handleKeyDown}
          className={cn(
            "inline-flex h-8 min-w-[9rem] items-center justify-center rounded border px-2.5",
            "font-mono text-xs tracking-wide",
            "transition-colors duration-fast ease-swift",
            recording
              ? "border-accent bg-bg-base text-fg-primary"
              : "border-border-subtle bg-bg-base text-fg-primary hover:border-border-strong",
            "focus:border-accent focus:outline-none",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
        >
          {recording ? (
            <span className="text-fg-muted">Press keys…</span>
          ) : value ? (
            formatAccelerator(value)
          ) : (
            <span className="text-fg-muted">Unset</span>
          )}
        </button>
        <button
          type="button"
          aria-label="Reset shortcut to default"
          onClick={handleReset}
          disabled={disabled || value === defaultValue}
          className={cn(
            "inline-flex h-8 w-8 items-center justify-center rounded",
            "text-fg-muted transition-colors duration-fast ease-swift",
            "hover:bg-bg-elevated hover:text-fg-primary",
            "disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-fg-muted",
          )}
        >
          <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.75} />
        </button>
      </div>
      {error ? (
        <p role="alert" className="text-2xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
