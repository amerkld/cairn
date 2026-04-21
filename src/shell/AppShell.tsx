import { useState, type ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { RouteContext, type RouteState } from "./routing";
import { ReminderToasts } from "./ReminderToasts";
import type { VaultSummary } from "@/lib/invoke";
import { useVaultEventSubscriptions } from "@/lib/tauri-events";

interface AppShellProps {
  children: (state: RouteState) => ReactNode;
  vault: VaultSummary;
}

export function AppShell({ children, vault }: AppShellProps) {
  const [state, setState] = useState<RouteState>({ page: "home" });
  useVaultEventSubscriptions();

  return (
    <RouteContext.Provider value={{ state, navigate: setState }}>
      <div className="flex h-full flex-col bg-bg-base text-fg-primary">
        <TitleBar vaultName={vault.name} />
        <div className="flex min-h-0 flex-1">
          <Sidebar vault={vault} />
          <main className="min-w-0 flex-1 overflow-hidden">{children(state)}</main>
        </div>
        <ReminderToasts />
      </div>
    </RouteContext.Provider>
  );
}

function TitleBar({ vaultName }: { vaultName: string }) {
  return (
    <div
      className="app-title-bar flex h-9 shrink-0 items-center justify-between border-b border-border-subtle bg-bg-surface px-3"
      aria-label="Application title bar"
    >
      <div className="flex items-center gap-2">
        <CairnMark />
        <span className="text-xs font-medium tracking-wide text-fg-secondary">Cairn</span>
        <span className="text-xs text-fg-muted">·</span>
        <span className="truncate text-xs text-fg-secondary">{vaultName}</span>
      </div>
      <div className="text-2xs uppercase tracking-wider text-fg-muted">Phase 1</div>
    </div>
  );
}

function CairnMark() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      aria-hidden="true"
      className="text-accent"
    >
      <circle cx="8" cy="12" r="2.2" fill="currentColor" />
      <circle cx="8" cy="7.5" r="1.7" fill="currentColor" opacity="0.75" />
      <circle cx="8" cy="3.5" r="1.2" fill="currentColor" opacity="0.5" />
    </svg>
  );
}
