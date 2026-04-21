import { useMemo } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { Clock, FolderOpen, Plus, X } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Button } from "@/ds/Button";
import { cn } from "@/lib/cn";
import { useForgetVault, useOpenVault, useVaultsQuery } from "@/lib/queries";
import type { VaultSummary } from "@/lib/invoke";

export function VaultPicker() {
  const vaultsQuery = useVaultsQuery();
  const openVault = useOpenVault();
  const forgetVault = useForgetVault();

  const vaults = useMemo(() => vaultsQuery.data ?? [], [vaultsQuery.data]);

  async function pickAndOpen() {
    const selected = await openDialog({
      directory: true,
      multiple: false,
      title: "Choose a folder to use as your vault",
    });
    if (typeof selected !== "string" || selected.length === 0) return;
    openVault.mutate(selected);
  }

  return (
    <div className="flex h-full items-center justify-center bg-bg-base px-6 py-10">
      <div className="flex w-full max-w-lg flex-col gap-10">
        <header className="flex flex-col items-center gap-4 text-center">
          <CairnMark />
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-tight text-fg-primary">
              Welcome to Cairn
            </h1>
            <p className="text-sm text-fg-secondary">
              Pick a folder to use as your vault. Cairn will set up a{" "}
              <code className="rounded-sm bg-bg-elevated px-1 py-0.5 font-mono text-xs text-fg-primary">
                .cairn
              </code>{" "}
              directory inside it for config and leave the rest for you.
            </p>
          </div>
        </header>

        <div className="flex flex-col gap-3">
          <Button
            variant="primary"
            size="lg"
            onClick={pickAndOpen}
            disabled={openVault.isPending}
            className="h-11 justify-start gap-3 px-4"
          >
            <FolderOpen className="h-4 w-4" strokeWidth={1.75} />
            <span className="flex-1 text-left">
              {openVault.isPending ? "Opening…" : "Open a folder as vault"}
            </span>
            <Plus className="h-4 w-4 opacity-60" strokeWidth={1.75} />
          </Button>
          {openVault.isError ? (
            <OpenError message={extractMessage(openVault.error)} />
          ) : null}
        </div>

        {vaults.length > 0 ? (
          <section
            aria-labelledby="recent-heading"
            className="flex flex-col gap-3"
          >
            <div className="flex items-center gap-2">
              <Clock className="h-3.5 w-3.5 text-fg-muted" strokeWidth={1.75} />
              <h2
                id="recent-heading"
                className="text-2xs font-medium uppercase tracking-wider text-fg-muted"
              >
                Recent vaults
              </h2>
            </div>
            <ul className="flex flex-col gap-1.5">
              {vaults.map((vault) => (
                <RecentVaultRow
                  key={vault.path}
                  vault={vault}
                  onOpen={() => openVault.mutate(vault.path)}
                  onForget={() => forgetVault.mutate(vault.path)}
                  disabled={openVault.isPending}
                />
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </div>
  );
}

function RecentVaultRow({
  vault,
  onOpen,
  onForget,
  disabled,
}: {
  vault: VaultSummary;
  onOpen: () => void;
  onForget: () => void;
  disabled: boolean;
}) {
  const subtitle = vault.lastOpenedAt
    ? `Opened ${formatDistanceToNow(new Date(vault.lastOpenedAt), { addSuffix: true })}`
    : "Never opened";

  return (
    <li>
      <div
        className={cn(
          "group flex items-center gap-3 rounded border border-border-subtle",
          "bg-bg-surface px-3 py-2.5",
          "transition-colors duration-fast ease-swift",
          "hover:border-border-strong",
        )}
      >
        <button
          type="button"
          onClick={onOpen}
          disabled={disabled}
          className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left disabled:cursor-not-allowed"
          aria-label={`Open vault ${vault.name}`}
        >
          <span className="truncate text-sm font-medium text-fg-primary">{vault.name}</span>
          <span className="flex min-w-0 items-center gap-2 text-xs text-fg-muted">
            <span className="truncate font-mono">{vault.path}</span>
            <span aria-hidden>·</span>
            <span className="shrink-0">{subtitle}</span>
          </span>
        </button>
        <button
          type="button"
          onClick={onForget}
          aria-label={`Forget ${vault.name}`}
          className={cn(
            "h-7 w-7 shrink-0 rounded text-fg-muted",
            "opacity-0 transition-opacity duration-fast ease-swift",
            "hover:bg-bg-elevated hover:text-fg-primary",
            "group-hover:opacity-100 focus-visible:opacity-100",
            "inline-flex items-center justify-center",
          )}
        >
          <X className="h-3.5 w-3.5" strokeWidth={1.75} />
        </button>
      </div>
    </li>
  );
}

function OpenError({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="rounded border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger"
    >
      {message}
    </div>
  );
}

function extractMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    const m = (error as { message: unknown }).message;
    if (typeof m === "string") return m;
  }
  if (error instanceof Error) return error.message;
  return "Couldn't open that folder.";
}

function CairnMark() {
  return (
    <svg
      width="44"
      height="44"
      viewBox="0 0 44 44"
      aria-hidden="true"
      className="text-accent"
    >
      <circle cx="22" cy="32" r="6.5" fill="currentColor" />
      <circle cx="22" cy="20" r="5" fill="currentColor" opacity="0.72" />
      <circle cx="22" cy="10" r="3.5" fill="currentColor" opacity="0.48" />
    </svg>
  );
}
