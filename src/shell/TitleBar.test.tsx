import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const windowMock = vi.hoisted(() => ({
  minimize: vi.fn(),
  toggleMaximize: vi.fn(),
  close: vi.fn(),
  isMaximized: vi.fn(),
  onResized: vi.fn(),
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => windowMock,
}));

import { TitleBar } from "./TitleBar";

describe("TitleBar", () => {
  beforeEach(() => {
    windowMock.minimize.mockReset().mockResolvedValue(undefined);
    windowMock.toggleMaximize.mockReset().mockResolvedValue(undefined);
    windowMock.close.mockReset().mockResolvedValue(undefined);
    windowMock.isMaximized.mockReset().mockResolvedValue(false);
    windowMock.onResized.mockReset().mockResolvedValue(() => {});
  });

  it("shows the app name, separator, and vault name in the left cluster", () => {
    render(<TitleBar vaultName="My Vault" />);
    expect(screen.getByText("Cairn")).toBeInTheDocument();
    expect(screen.getByText("·")).toBeInTheDocument();
    expect(screen.getByText("My Vault")).toBeInTheDocument();
  });

  it("does not display the legacy 'Phase 1' dev label", () => {
    render(<TitleBar vaultName="My Vault" />);
    expect(screen.queryByText(/phase\s*1/i)).toBeNull();
  });

  it("renders the themed window control buttons on the right", () => {
    render(<TitleBar vaultName="My Vault" />);
    expect(screen.getByRole("button", { name: "Minimize" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Maximize" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
  });

  it("double-clicking the drag region toggles maximize", async () => {
    render(<TitleBar vaultName="My Vault" />);
    await userEvent.dblClick(screen.getByText("My Vault"));
    expect(windowMock.toggleMaximize).toHaveBeenCalledTimes(1);
  });
});
