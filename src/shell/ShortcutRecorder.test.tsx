import { describe, it, expect, vi } from "vitest";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  ShortcutRecorder,
  acceleratorFromEvent,
  normalizeAcceleratorKey,
} from "./ShortcutRecorder";

describe("normalizeAcceleratorKey", () => {
  it("uppercases letters", () => {
    expect(normalizeAcceleratorKey("k")).toBe("K");
    expect(normalizeAcceleratorKey("Z")).toBe("Z");
  });

  it("passes digits through", () => {
    expect(normalizeAcceleratorKey("3")).toBe("3");
  });

  it("maps space and arrow keys", () => {
    expect(normalizeAcceleratorKey(" ")).toBe("Space");
    expect(normalizeAcceleratorKey("ArrowUp")).toBe("Up");
  });

  it("accepts F1-F24", () => {
    expect(normalizeAcceleratorKey("F5")).toBe("F5");
    expect(normalizeAcceleratorKey("F24")).toBe("F24");
  });

  it("rejects bare modifiers", () => {
    expect(normalizeAcceleratorKey("Control")).toBeNull();
    expect(normalizeAcceleratorKey("Shift")).toBeNull();
    expect(normalizeAcceleratorKey("Meta")).toBeNull();
  });
});

describe("acceleratorFromEvent", () => {
  function ev(partial: Partial<KeyboardEvent>) {
    return partial as unknown as ReactKeyboardEvent<HTMLElement>;
  }

  it("combines ctrl+shift+letter into CommandOrControl+Shift+<letter>", () => {
    expect(
      acceleratorFromEvent(ev({ key: "k", ctrlKey: true, shiftKey: true })),
    ).toBe("CommandOrControl+Shift+K");
  });

  it("treats meta the same as ctrl", () => {
    expect(acceleratorFromEvent(ev({ key: "j", metaKey: true }))).toBe(
      "CommandOrControl+J",
    );
  });

  it("rejects a key without any modifier", () => {
    expect(acceleratorFromEvent(ev({ key: "k" }))).toBeNull();
  });

  it("rejects a plain modifier keypress (e.g. user hit Shift only)", () => {
    expect(acceleratorFromEvent(ev({ key: "Shift", shiftKey: true }))).toBeNull();
  });

  it("orders parts as CommandOrControl, Alt, Shift, Key", () => {
    expect(
      acceleratorFromEvent(
        ev({ key: "n", ctrlKey: true, altKey: true, shiftKey: true }),
      ),
    ).toBe("CommandOrControl+Alt+Shift+N");
  });
});

describe("ShortcutRecorder", () => {
  it("formats the stored accelerator for display", () => {
    render(
      <ShortcutRecorder
        value="CommandOrControl+Shift+N"
        defaultValue="CommandOrControl+Shift+N"
        onChange={() => undefined}
      />,
    );
    const button = screen.getByRole("button", { name: "Record shortcut" });
    expect(button.textContent).toContain("Ctrl / ⌘");
    expect(button.textContent).toContain("Shift");
    expect(button.textContent).toContain("N");
  });

  it("captures a new shortcut on keydown", async () => {
    const onChange = vi.fn();
    render(
      <ShortcutRecorder
        value="CommandOrControl+Shift+N"
        defaultValue="CommandOrControl+Shift+N"
        onChange={onChange}
      />,
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Record shortcut" }));
    await user.keyboard("{Control>}{Shift>}j{/Shift}{/Control}");

    expect(onChange).toHaveBeenCalledWith("CommandOrControl+Shift+J");
  });

  it("Escape cancels record mode without calling onChange", async () => {
    const onChange = vi.fn();
    render(
      <ShortcutRecorder
        value="CommandOrControl+Shift+N"
        defaultValue="CommandOrControl+Shift+N"
        onChange={onChange}
      />,
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Record shortcut" }));
    await user.keyboard("{Escape}");

    expect(onChange).not.toHaveBeenCalled();
  });

  it("reset button restores the default value", async () => {
    const onChange = vi.fn();
    render(
      <ShortcutRecorder
        value="CommandOrControl+Alt+J"
        defaultValue="CommandOrControl+Shift+N"
        onChange={onChange}
      />,
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Reset shortcut to default" }));
    expect(onChange).toHaveBeenCalledWith("CommandOrControl+Shift+N");
  });

  it("reset button is disabled when current value equals default", () => {
    render(
      <ShortcutRecorder
        value="CommandOrControl+Shift+N"
        defaultValue="CommandOrControl+Shift+N"
        onChange={() => undefined}
      />,
    );
    expect(screen.getByRole("button", { name: "Reset shortcut to default" })).toBeDisabled();
  });

  it("renders an error message when provided", () => {
    render(
      <ShortcutRecorder
        value="CommandOrControl+Shift+N"
        defaultValue="CommandOrControl+Shift+N"
        onChange={() => undefined}
        error="Already taken"
      />,
    );
    expect(screen.getByRole("alert").textContent).toBe("Already taken");
  });
});
