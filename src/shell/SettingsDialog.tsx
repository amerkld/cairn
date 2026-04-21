/**
 * Settings / About dialog. Phase 1 is intentionally lean: the app doesn't
 * have user-adjustable settings yet, so this is mostly an About surface
 * with the vault path (copy-able) and a pointer to the keyboard shortcuts.
 *
 * When actual settings land (theme, default vault on launch, etc.), they
 * belong here — new sections above About, following the same layout.
 */
import { useState, type ReactNode } from "react";
import { Copy, Check, Keyboard } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/ds/Dialog";
import { Button } from "@/ds/Button";
import { cn } from "@/lib/cn";
import type { VaultSummary } from "@/lib/invoke";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vault: VaultSummary;
  onOpenShortcuts: () => void;
}

const APP_VERSION = "0.1.0";
const APP_PHASE = "Phase 1";

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
            <CairnMark />
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

          <Section title="About">
            <Row label="Version" value={`${APP_VERSION} · ${APP_PHASE}`} />
            <Row label="Spec" value="specs/SPEC_0.md" mono />
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

function CairnMark() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden className="text-accent">
      <circle cx="8" cy="12" r="2.2" fill="currentColor" />
      <circle cx="8" cy="7.5" r="1.7" fill="currentColor" opacity="0.75" />
      <circle cx="8" cy="3.5" r="1.2" fill="currentColor" opacity="0.5" />
    </svg>
  );
}

