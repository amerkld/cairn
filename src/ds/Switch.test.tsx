import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Switch } from "./Switch";

describe("Switch", () => {
  it("renders as a switch with the correct aria-checked state", () => {
    render(
      <Switch aria-label="Wide" checked={false} onCheckedChange={() => undefined} />,
    );
    const el = screen.getByRole("switch", { name: "Wide" });
    expect(el).toHaveAttribute("aria-checked", "false");
    expect(el).toHaveAttribute("data-state", "unchecked");
  });

  it("reflects checked=true via aria-checked and data-state", () => {
    render(
      <Switch aria-label="Wide" checked onCheckedChange={() => undefined} />,
    );
    const el = screen.getByRole("switch", { name: "Wide" });
    expect(el).toHaveAttribute("aria-checked", "true");
    expect(el).toHaveAttribute("data-state", "checked");
  });

  it("fires onCheckedChange with the next value on click", async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    render(
      <Switch aria-label="Wide" checked={false} onCheckedChange={onCheckedChange} />,
    );
    await user.click(screen.getByRole("switch"));
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it("toggles on Space key", async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    render(
      <Switch aria-label="Wide" checked={false} onCheckedChange={onCheckedChange} />,
    );
    screen.getByRole("switch").focus();
    await user.keyboard(" ");
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it("toggles on Enter key", async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    render(
      <Switch aria-label="Wide" checked onCheckedChange={onCheckedChange} />,
    );
    screen.getByRole("switch").focus();
    await user.keyboard("{Enter}");
    expect(onCheckedChange).toHaveBeenCalledWith(false);
  });

  it("does not fire when disabled", async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    render(
      <Switch
        aria-label="Wide"
        checked={false}
        onCheckedChange={onCheckedChange}
        disabled
      />,
    );
    await user.click(screen.getByRole("switch"));
    expect(onCheckedChange).not.toHaveBeenCalled();
  });
});
