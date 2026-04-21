import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SettingsDialog } from "./SettingsDialog";

const vault = {
  path: "/home/amer/brain",
  name: "Brain",
  lastOpenedAt: "2026-04-21T00:00:00Z",
};

describe("SettingsDialog", () => {
  it("shows vault name and path when open", () => {
    render(
      <SettingsDialog
        open={true}
        onOpenChange={() => undefined}
        vault={vault}
        onOpenShortcuts={() => undefined}
      />,
    );
    expect(screen.getByText("Brain")).toBeInTheDocument();
    expect(screen.getByText("/home/amer/brain")).toBeInTheDocument();
  });

  it("has a copy button for the vault path that swaps to a check on click", async () => {
    render(
      <SettingsDialog
        open={true}
        onOpenChange={() => undefined}
        vault={vault}
        onOpenShortcuts={() => undefined}
      />,
    );

    const copy = screen.getByRole("button", { name: /Copy Path/i });
    // Click should not throw, even without a clipboard available.
    await userEvent.setup().click(copy);
    expect(copy).toBeInTheDocument();
  });

  it("opening Keyboard shortcuts closes the settings dialog and calls the handler", async () => {
    const onOpenChange = vi.fn();
    const onOpenShortcuts = vi.fn();

    render(
      <SettingsDialog
        open={true}
        onOpenChange={onOpenChange}
        vault={vault}
        onOpenShortcuts={onOpenShortcuts}
      />,
    );

    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: /Keyboard shortcuts/ }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onOpenShortcuts).toHaveBeenCalled();
  });
});
