import { useState, type ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { RouteContext, type RouteState } from "./routing";
import { ReminderToasts } from "./ReminderToasts";
import { TitleBar } from "./TitleBar";
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
