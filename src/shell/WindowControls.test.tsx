import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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

import { WindowControls } from "./WindowControls";

describe("WindowControls", () => {
  beforeEach(() => {
    windowMock.minimize.mockReset().mockResolvedValue(undefined);
    windowMock.toggleMaximize.mockReset().mockResolvedValue(undefined);
    windowMock.close.mockReset().mockResolvedValue(undefined);
    windowMock.isMaximized.mockReset().mockResolvedValue(false);
    windowMock.onResized.mockReset().mockResolvedValue(() => {});
  });

  it("renders the three chrome buttons with aria labels", () => {
    render(<WindowControls />);
    expect(screen.getByRole("button", { name: "Minimize" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Maximize" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
  });

  it("clicking minimize calls window.minimize once", async () => {
    render(<WindowControls />);
    await userEvent.click(screen.getByRole("button", { name: "Minimize" }));
    expect(windowMock.minimize).toHaveBeenCalledTimes(1);
  });

  it("clicking maximize calls window.toggleMaximize once", async () => {
    render(<WindowControls />);
    await userEvent.click(screen.getByRole("button", { name: "Maximize" }));
    expect(windowMock.toggleMaximize).toHaveBeenCalledTimes(1);
  });

  it("clicking close calls window.close once", async () => {
    render(<WindowControls />);
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(windowMock.close).toHaveBeenCalledTimes(1);
  });

  it("center button reads 'Restore' when window is already maximized", async () => {
    windowMock.isMaximized.mockResolvedValue(true);
    render(<WindowControls />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Restore" })).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: "Maximize" })).toBeNull();
  });

  it("keeps chrome buttons out of the tab order (tabIndex=-1)", () => {
    render(<WindowControls />);
    for (const label of ["Minimize", "Maximize", "Close"]) {
      expect(screen.getByRole("button", { name: label })).toHaveAttribute(
        "tabindex",
        "-1",
      );
    }
  });

  it("swallows errors from getCurrentWindow so it renders outside Tauri", async () => {
    windowMock.isMaximized.mockRejectedValueOnce(new Error("no tauri"));
    render(<WindowControls />);
    // Renders without throwing; center button falls back to Maximize.
    expect(screen.getByRole("button", { name: "Maximize" })).toBeInTheDocument();
  });
});
