/**
 * Settings / About dialog. Holds the vault's user-adjustable preferences
 * (currently just editor layout) alongside the About surface with the
 * vault path and a pointer to the keyboard shortcuts.
 *
 * Preference rows use `SettingRow` (label + description + control),
 * distinct from the info-only `Row` used by About/Vault sections.
 */
import { useState, type ReactNode } from "react";
import { Copy, Check, Keyboard, ExternalLink } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/ds/Dialog";
import { Button } from "@/ds/Button";
import { Switch } from "@/ds/Switch";
import { cn } from "@/lib/cn";
import { useEditorPreferences } from "@/lib/editor-preferences";
import {
  DEFAULT_QUICK_CAPTURE_SHORTCUT,
  type VaultSummary,
} from "@/lib/invoke";
import {
  usePreferencesQuery,
  useSetCloseToTray,
  useSetQuickCaptureShortcut,
} from "@/lib/queries";
import { CairnLogo } from "./CairnLogo";
import { ShortcutRecorder } from "./ShortcutRecorder";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vault: VaultSummary;
  onOpenShortcuts: () => void;
}

const APP_VERSION = "0.1.0";
const AUTHOR_NAME = "amer";
const AUTHOR_URL = "https://x.com/amerkld";

export function SettingsDialog({
  open,
  onOpenChange,
  vault,
  onOpenShortcuts,
}: SettingsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0">
        <DialogHeader className="border-b border-border-subtle px-5 pb-4 pt-5">
          <DialogTitle className="flex items-center gap-2">
            <CairnLogo size={16} />
            Cairn
          </DialogTitle>
          <DialogDescription>
            Local-first notes, knowledge, and GTD.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col divide-y divide-border-subtle/60">
          <Section title="Vault">
            <Row label="Name" value={vault.name} />
            <Row label="Path" value={vault.path} copyable mono />
          </Section>

          <Section title="General">
            <CloseToTrayRow />
          </Section>

          <Section title="Editor">
            <EditorFullWidthRow />
          </Section>

          <Section title="Shortcuts">
            <QuickCaptureShortcutRow />
          </Section>

          <Section title="About">
            <Row label="Version" value={APP_VERSION} />
            <AuthorRow />
          </Section>

          <Section title="Help">
            <div className="flex flex-col gap-2 pt-2">
              <Button
                variant="secondary"
                size="md"
                onClick={() => {
                  onOpenChange(false);
                  onOpenShortcuts();
                }}
                className="gap-2"
              >
                <Keyboard className="h-4 w-4 text-fg-muted" strokeWidth={1.75} />
                Keyboard shortcuts
              </Button>
            </div>
          </Section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2 px-5 py-4">
      <h3 className="text-2xs font-medium uppercase tracking-wider text-fg-muted">
        {title}
      </h3>
      <div className="flex flex-col gap-1">{children}</div>
    </section>
  );
}

function SettingRow({
  label,
  description,
  control,
  htmlFor,
}: {
  label: string;
  description?: string;
  control: ReactNode;
  /** When the control is a labellable element, ties the <label> to it. */
  htmlFor?: string;
}) {
  return (
    <div className="flex items-start gap-3 py-1.5">
      <div className="min-w-0 flex-1">
        <label
          htmlFor={htmlFor}
          className="block text-sm text-fg-primary"
        >
          {label}
        </label>
        {description ? (
          <p className="mt-0.5 text-xs text-fg-muted">{description}</p>
        ) : null}
      </div>
      <div className="shrink-0 pt-0.5">{control}</div>
    </div>
  );
}

function AuthorRow() {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className="w-20 shrink-0 text-2xs uppercase tracking-wider text-fg-muted">
        Author
      </span>
      <button
        type="button"
        onClick={() => {
          // Opens in the user's default browser via tauri-plugin-opener.
          // Failure is intentionally ignored — the author row is cosmetic.
          void openUrl(AUTHOR_URL).catch(() => undefined);
        }}
        className={cn(
          "group inline-flex min-w-0 flex-1 items-center gap-1.5 text-left text-sm",
          "text-fg-primary transition-colors duration-fast ease-swift",
          "hover:text-accent focus-visible:outline-none focus-visible:text-accent",
        )}
        aria-label={`Open ${AUTHOR_NAME} on X (opens in browser)`}
      >
        <span className="truncate">{AUTHOR_NAME}</span>
        <ExternalLink
          className="h-3 w-3 shrink-0 text-fg-muted transition-colors duration-fast ease-swift group-hover:text-accent"
          strokeWidth={1.75}
        />
      </button>
    </div>
  );
}

function CloseToTrayRow() {
  const prefs = usePreferencesQuery();
  const setCloseToTray = useSetCloseToTray();
  // Default to `true` before the query resolves so the toggle reflects the
  // shipping default instead of momentarily reading as "off".
  const checked = prefs.data?.closeToTray ?? true;
  const loading = prefs.isLoading || setCloseToTray.isPending;

  return (
    <SettingRow
      label="Close to system tray"
      description="Closing the window keeps Cairn running in the tray so Quick Capture stays available. Off: closing exits the app."
      control={
        <Switch
          aria-label="Close to system tray"
          checked={checked}
          disabled={loading}
          onCheckedChange={(next) => {
            // Fire-and-forget: the query cache invalidates on success; any
            // error is surfaced through the mutation's own state. There's no
            // optimistic UI here because the toggle is cheap and the refetch
            // lands almost immediately.
            setCloseToTray.mutate(next);
          }}
        />
      }
    />
  );
}

function EditorFullWidthRow() {
  const { fullWidth, loading, setFullWidth } = useEditorPreferences();
  return (
    <SettingRow
      label="Full-width editor"
      description="Stretch notes from the sidebar to the window edge instead of a centered column."
      control={
        <Switch
          aria-label="Full-width editor"
          checked={fullWidth}
          disabled={loading}
          onCheckedChange={(next) => {
            // Fire-and-forget: the context reverts on error.
            void setFullWidth(next);
          }}
        />
      }
    />
  );
}

function QuickCaptureShortcutRow() {
  const prefs = usePreferencesQuery();
  const setShortcut = useSetQuickCaptureShortcut();
  const [error, setError] = useState<string | null>(null);

  const current =
    prefs.data?.quickCaptureShortcut ?? DEFAULT_QUICK_CAPTURE_SHORTCUT;

  function handleChange(next: string) {
    setError(null);
    setShortcut.mutate(next, {
      onError: (err) => setError(extractMessage(err)),
    });
  }

  return (
    <SettingRow
      label="Quick capture"
      description="System-wide shortcut to open Quick Capture from anywhere while Cairn is running."
      control={
        <ShortcutRecorder
          aria-label="Quick capture shortcut"
          value={current}
          defaultValue={DEFAULT_QUICK_CAPTURE_SHORTCUT}
          onChange={handleChange}
          disabled={prefs.isLoading || setShortcut.isPending}
          error={error}
        />
      }
    />
  );
}

function extractMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    const m = (error as { message: unknown }).message;
    if (typeof m === "string") return m;
  }
  if (error instanceof Error) return error.message;
  return "Could not update the shortcut.";
}

function Row({
  label,
  value,
  copyable,
  mono,
}: {
  label: string;
  value: string;
  copyable?: boolean;
  mono?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  function copy() {
    try {
      navigator.clipboard?.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      // Best-effort — clipboard may not be available in every context.
    }
  }

  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className="w-20 shrink-0 text-2xs uppercase tracking-wider text-fg-muted">
        {label}
      </span>
      <span
        className={cn(
          "min-w-0 flex-1 truncate text-sm text-fg-primary",
          mono && "font-mono text-xs",
        )}
        title={value}
      >
        {value}
      </span>
      {copyable ? (
        <button
          type="button"
          onClick={copy}
          aria-label={`Copy ${label}`}
          className={cn(
            "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded",
            "text-fg-muted transition-colors duration-fast ease-swift",
            "hover:bg-bg-elevated hover:text-fg-primary",
          )}
        >
          {copied ? (
            <Check className="h-3 w-3 text-accent" strokeWidth={2} />
          ) : (
            <Copy className="h-3 w-3" strokeWidth={1.75} />
          )}
        </button>
      ) : null}
    </div>
  );
}


