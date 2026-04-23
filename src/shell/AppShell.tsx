import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { RouteContext, type RouteState } from "./routing";
import { ReminderToasts } from "./ReminderToasts";
import { TitleBar } from "./TitleBar";
import { api, type VaultSummary } from "@/lib/invoke";
import {
  useTrayNavigate,
  useVaultEventSubscriptions,
} from "@/lib/tauri-events";

interface AppShellProps {
  children: (state: RouteState) => ReactNode;
  vault: VaultSummary;
}

export function AppShell({ children, vault }: AppShellProps) {
  const [state, setState] = useState<RouteState>({ page: "home" });
  useVaultEventSubscriptions();

  // Tray-menu → frontend navigation. The Rust side shows/focuses the main
  // window first, then emits `tray:navigate`; we just route.
  useTrayNavigate(
    useCallback((target) => {
      if (target.target === "captures") {
        setState({ page: "captures" });
      } else if (target.target === "project") {
        setState({ page: "project", projectPath: target.path });
      }
    }, []),
  );

  // Record a project visit whenever the route lands on a project, whether
  // from sidebar navigation or a tray deep-link. Fire-and-forget: a transient
  // IPC failure must not block the UI, and the tray menu will just refresh
  // on the next successful visit.
  const projectPath = state.page === "project" ? state.projectPath : null;
  useEffect(() => {
    if (projectPath) {
      void api.recordProjectVisit(projectPath).catch(() => undefined);
    }
  }, [projectPath]);

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
