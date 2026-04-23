import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockIPC } from "@tauri-apps/api/mocks";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SettingsDialog } from "./SettingsDialog";
import { EditorPreferencesProvider } from "@/lib/editor-preferences";

// The provider writes to `document.documentElement.dataset.editorWidth`.
// Reset it between tests so leftover state from one test doesn't leak into
// the next through JSDOM's shared document.
afterEach(() => {
  delete document.documentElement.dataset.editorWidth;
});

const vault = {
  path: "/home/amer/brain",
  name: "Brain",
  lastOpenedAt: "2026-04-21T00:00:00Z",
};

type IpcHandler = (cmd: string, args: Record<string, unknown>) => unknown;

function renderDialog(
  {
    onOpenChange = () => undefined,
    onOpenShortcuts = () => undefined,
  }: {
    onOpenChange?: (open: boolean) => void;
    onOpenShortcuts?: () => void;
  } = {},
  ipc?: IpcHandler,
) {
  const defaults: IpcHandler = (cmd) => {
    if (cmd === "get_editor_full_width") return false;
    if (cmd === "set_editor_full_width") return null;
    if (cmd === "get_preferences")
      return {
        quickCaptureShortcut: "CommandOrControl+Shift+N",
        closeToTray: true,
        trayHintShown: false,
      };
    if (cmd === "set_quick_capture_shortcut") return null;
    if (cmd === "set_close_to_tray") return null;
    throw new Error(`unexpected IPC: ${cmd}`);
  };
  mockIPC((cmd, args) => (ipc ?? defaults)(cmd, args as Record<string, unknown>));

  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={client}>
      <EditorPreferencesProvider>
        <SettingsDialog
          open={true}
          onOpenChange={onOpenChange}
          vault={vault}
          onOpenShortcuts={onOpenShortcuts}
        />
      </EditorPreferencesProvider>
    </QueryClientProvider>,
  );
}

describe("SettingsDialog", () => {
  it("shows vault name and path when open", async () => {
    renderDialog();
    expect(screen.getByText("Brain")).toBeInTheDocument();
    expect(screen.getByText("/home/amer/brain")).toBeInTheDocument();
    // Wait for the preferences provider to finish hydrating so the state
    // update from its async effect doesn't land outside act().
    const toggle = await screen.findByRole("switch", { name: "Full-width editor" });
    await waitFor(() => expect(toggle).not.toBeDisabled());
  });

  it("has a copy button for the vault path that swaps to a check on click", async () => {
    renderDialog();

    const copy = screen.getByRole("button", { name: /Copy Path/i });
    await userEvent.setup().click(copy);
    expect(copy).toBeInTheDocument();
    // Wait for preferences hydration before letting the test unmount.
    await waitFor(() =>
      expect(
        screen.getByRole("switch", { name: "Full-width editor" }),
      ).not.toBeDisabled(),
    );
  });

  it("opening Keyboard shortcuts closes the settings dialog and calls the handler", async () => {
    const onOpenChange = vi.fn();
    const onOpenShortcuts = vi.fn();

    renderDialog({ onOpenChange, onOpenShortcuts });

    // Wait for hydration first so the click doesn't race with the provider's
    // async state update.
    await waitFor(() =>
      expect(
        screen.getByRole("switch", { name: "Full-width editor" }),
      ).not.toBeDisabled(),
    );

    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: /Keyboard shortcuts/ }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onOpenShortcuts).toHaveBeenCalled();
  });

  it("renders the full-width editor switch reflecting the vault's saved value", async () => {
    renderDialog({}, (cmd) => {
      if (cmd === "get_editor_full_width") return true;
      if (cmd === "set_editor_full_width") return null;
      if (cmd === "get_preferences")
        return {
          quickCaptureShortcut: "CommandOrControl+Shift+N",
          closeToTray: true,
          trayHintShown: false,
        };
      if (cmd === "set_quick_capture_shortcut") return null;
      if (cmd === "set_close_to_tray") return null;
      throw new Error(`unexpected: ${cmd}`);
    });

    const toggle = await screen.findByRole("switch", { name: "Full-width editor" });
    await waitFor(() => expect(toggle).toHaveAttribute("aria-checked", "true"));
  });

  it("toggling the switch calls set_editor_full_width with the new value", async () => {
    const calls: Array<{ cmd: string; args: Record<string, unknown> }> = [];
    renderDialog({}, (cmd, args) => {
      calls.push({ cmd, args });
      if (cmd === "get_editor_full_width") return false;
      if (cmd === "set_editor_full_width") return null;
      if (cmd === "get_preferences")
        return {
          quickCaptureShortcut: "CommandOrControl+Shift+N",
          closeToTray: true,
          trayHintShown: false,
        };
      if (cmd === "set_quick_capture_shortcut") return null;
      if (cmd === "set_close_to_tray") return null;
      throw new Error(`unexpected: ${cmd}`);
    });

    const toggle = await screen.findByRole("switch", { name: "Full-width editor" });
    // Wait for hydration to complete (disabled until the initial fetch resolves).
    await waitFor(() => expect(toggle).not.toBeDisabled());

    await userEvent.setup().click(toggle);

    await waitFor(() => {
      const setCall = calls.find((c) => c.cmd === "set_editor_full_width");
      expect(setCall).toBeDefined();
      expect(setCall?.args).toEqual({ value: true });
    });
  });

  it("clicking the author row invokes tauri-plugin-opener with the X profile URL", async () => {
    const openCalls: Array<{ cmd: string; args: Record<string, unknown> }> = [];
    renderDialog({}, (cmd, args) => {
      if (cmd === "get_editor_full_width") return false;
      if (cmd === "set_editor_full_width") return null;
      if (cmd === "get_preferences")
        return {
          quickCaptureShortcut: "CommandOrControl+Shift+N",
          closeToTray: true,
          trayHintShown: false,
        };
      if (cmd === "set_quick_capture_shortcut") return null;
      if (cmd === "set_close_to_tray") return null;
      // tauri-plugin-opener invokes `plugin:opener|open_url` under the hood.
      if (cmd === "plugin:opener|open_url") {
        openCalls.push({ cmd, args });
        return null;
      }
      throw new Error(`unexpected: ${cmd}`);
    });

    // Wait for preferences hydration so the dialog is fully interactive.
    await waitFor(() =>
      expect(
        screen.getByRole("switch", { name: "Full-width editor" }),
      ).not.toBeDisabled(),
    );

    const authorButton = screen.getByRole("button", {
      name: /Open amer on X/,
    });
    await userEvent.setup().click(authorButton);

    await waitFor(() => {
      expect(openCalls).toHaveLength(1);
      expect(openCalls[0]?.args).toMatchObject({ url: "https://x.com/amerkld" });
    });
  });

  it("flips the document root's data-editor-width attribute when toggled on", async () => {
    renderDialog({}, (cmd) => {
      if (cmd === "get_editor_full_width") return false;
      if (cmd === "set_editor_full_width") return null;
      if (cmd === "get_preferences")
        return {
          quickCaptureShortcut: "CommandOrControl+Shift+N",
          closeToTray: true,
          trayHintShown: false,
        };
      if (cmd === "set_quick_capture_shortcut") return null;
      if (cmd === "set_close_to_tray") return null;
      throw new Error(`unexpected: ${cmd}`);
    });

    const toggle = await screen.findByRole("switch", { name: "Full-width editor" });
    await waitFor(() => expect(toggle).not.toBeDisabled());

    await userEvent.setup().click(toggle);

    await waitFor(() =>
      expect(document.documentElement.dataset.editorWidth).toBe("full"),
    );
  });

  it("renders the Shortcuts section with the current Quick Capture binding", async () => {
    renderDialog();

    const recorder = await screen.findByRole("button", {
      name: "Quick capture shortcut",
    });
    await waitFor(() => expect(recorder.textContent).toContain("Ctrl / ⌘"));
    expect(recorder.textContent).toContain("Shift");
    expect(recorder.textContent).toContain("N");
  });

  it("recording a new shortcut calls set_quick_capture_shortcut with the accelerator", async () => {
    const calls: Array<{ cmd: string; args: Record<string, unknown> }> = [];
    renderDialog({}, (cmd, args) => {
      calls.push({ cmd, args });
      if (cmd === "get_editor_full_width") return false;
      if (cmd === "set_editor_full_width") return null;
      if (cmd === "get_preferences")
        return {
          quickCaptureShortcut: "CommandOrControl+Shift+N",
          closeToTray: true,
          trayHintShown: false,
        };
      if (cmd === "set_quick_capture_shortcut") return null;
      if (cmd === "set_close_to_tray") return null;
      throw new Error(`unexpected: ${cmd}`);
    });

    const user = userEvent.setup();
    const recorder = await screen.findByRole("button", {
      name: "Quick capture shortcut",
    });
    await user.click(recorder);
    await user.keyboard("{Control>}{Shift>}j{/Shift}{/Control}");

    await waitFor(() => {
      const set = calls.find((c) => c.cmd === "set_quick_capture_shortcut");
      expect(set).toBeDefined();
      expect(set?.args).toMatchObject({ accelerator: "CommandOrControl+Shift+J" });
    });
  });

  it("renders the close-to-tray switch reflecting the saved preference", async () => {
    renderDialog({}, (cmd) => {
      if (cmd === "get_editor_full_width") return false;
      if (cmd === "set_editor_full_width") return null;
      if (cmd === "get_preferences")
        return {
          quickCaptureShortcut: "CommandOrControl+Shift+N",
          closeToTray: false,
          trayHintShown: true,
        };
      if (cmd === "set_quick_capture_shortcut") return null;
      if (cmd === "set_close_to_tray") return null;
      throw new Error(`unexpected: ${cmd}`);
    });

    const toggle = await screen.findByRole("switch", {
      name: "Close to system tray",
    });
    await waitFor(() =>
      expect(toggle).toHaveAttribute("aria-checked", "false"),
    );
  });

  it("toggling close-to-tray calls set_close_to_tray with the new value", async () => {
    const calls: Array<{ cmd: string; args: Record<string, unknown> }> = [];
    renderDialog({}, (cmd, args) => {
      calls.push({ cmd, args });
      if (cmd === "get_editor_full_width") return false;
      if (cmd === "set_editor_full_width") return null;
      if (cmd === "get_preferences")
        return {
          quickCaptureShortcut: "CommandOrControl+Shift+N",
          closeToTray: true,
          trayHintShown: false,
        };
      if (cmd === "set_quick_capture_shortcut") return null;
      if (cmd === "set_close_to_tray") return null;
      throw new Error(`unexpected: ${cmd}`);
    });

    const toggle = await screen.findByRole("switch", {
      name: "Close to system tray",
    });
    await waitFor(() => expect(toggle).not.toBeDisabled());
    await userEvent.setup().click(toggle);

    await waitFor(() => {
      const setCall = calls.find((c) => c.cmd === "set_close_to_tray");
      expect(setCall).toBeDefined();
      expect(setCall?.args).toEqual({ enabled: false });
    });
  });

  it("surfaces an error when set_quick_capture_shortcut rejects", async () => {
    renderDialog({}, (cmd) => {
      if (cmd === "get_editor_full_width") return false;
      if (cmd === "set_editor_full_width") return null;
      if (cmd === "get_preferences")
        return { quickCaptureShortcut: "CommandOrControl+Shift+N" };
      if (cmd === "set_quick_capture_shortcut") {
        throw new Error("Already claimed by the OS");
      }
      throw new Error(`unexpected: ${cmd}`);
    });

    const user = userEvent.setup();
    const recorder = await screen.findByRole("button", {
      name: "Quick capture shortcut",
    });
    await user.click(recorder);
    await user.keyboard("{Control>}{Shift>}j{/Shift}{/Control}");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Already claimed by the OS",
    );
  });
});
