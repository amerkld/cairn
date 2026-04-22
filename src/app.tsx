import { AppShell } from "./shell/AppShell";
import { GlobalShortcuts } from "./shell/GlobalShortcuts";
import { Home } from "./pages/Home";
import { Captures } from "./pages/Captures";
import { EditorPage } from "./pages/EditorPage";
import { ProjectPage } from "./pages/Project";
import { Someday } from "./pages/Someday";
import { TrashPage } from "./pages/Trash";
import { VaultPicker } from "./pages/VaultPicker";
import { useActiveVaultQuery } from "./lib/queries";
import { EditorPreferencesProvider } from "./lib/editor-preferences";
import type { RouteState } from "./shell/routing";

export function App() {
  const { data: activeVault, isLoading } = useActiveVaultQuery();

  if (isLoading) {
    return <BootSplash />;
  }

  if (!activeVault) {
    return <VaultPicker />;
  }

  return (
    <EditorPreferencesProvider>
      <AppShell vault={activeVault}>
        {(state) => (
          <>
            <GlobalShortcuts />
            <PageFor state={state} />
          </>
        )}
      </AppShell>
    </EditorPreferencesProvider>
  );
}

function PageFor({ state }: { state: RouteState }) {
  switch (state.page) {
    case "home":
      return <Home />;
    case "captures":
      return <Captures />;
    case "someday":
      return <Someday />;
    case "trash":
      return <TrashPage />;
    case "project":
      return <ProjectPage projectPath={state.projectPath} />;
    case "editor":
      return <EditorPage notePath={state.notePath} returnTo={state.returnTo} />;
  }
}

function BootSplash() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Loading Cairn"
      className="flex h-full items-center justify-center bg-bg-base"
    >
      <div className="h-2 w-24 overflow-hidden rounded-full bg-bg-elevated">
        <div className="h-full w-1/2 animate-pulse bg-border-strong" />
      </div>
    </div>
  );
}
