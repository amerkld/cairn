import { getCurrentWindow } from "@tauri-apps/api/window";
import { CairnLogo } from "./CairnLogo";
import { WindowControls } from "./WindowControls";

/**
 * Cairn-drawn title bar. OS decorations are disabled (see tauri.conf.json), so
 * this bar is the only chrome: the left cluster identifies the app and vault
 * and acts as the drag region, and the right cluster exposes window controls.
 * Double-clicking the left cluster toggles maximize, matching native behavior.
 */
export function TitleBar({ vaultName }: { vaultName: string }) {
  return (
    <div
      className="app-title-bar flex h-9 shrink-0 items-stretch justify-between border-b border-border-subtle bg-bg-surface"
      aria-label="Application title bar"
    >
      <div
        className="flex min-w-0 flex-1 items-center gap-2 pl-3"
        onDoubleClick={() => void getCurrentWindow().toggleMaximize()}
      >
        <CairnLogo size={14} />
        <span className="text-xs font-medium tracking-wide text-fg-secondary">
          Cairn
        </span>
        <span className="text-xs text-fg-muted">·</span>
        <span className="truncate text-xs text-fg-secondary">{vaultName}</span>
      </div>
      <WindowControls />
    </div>
  );
}
