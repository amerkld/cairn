import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { mockIPC } from "@tauri-apps/api/mocks";
import type { ReactNode } from "react";
import { VaultPicker } from "./VaultPicker";

const openDialogMock = vi.fn();
vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: (...args: unknown[]) => openDialogMock(...args),
}));

function wrap(children: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  openDialogMock.mockReset();
});

describe("VaultPicker", () => {
  it("shows empty state when no recent vaults", async () => {
    mockIPC((cmd) => {
      if (cmd === "list_vaults") return [];
      throw new Error(`unexpected command ${cmd}`);
    });

    render(wrap(<VaultPicker />));

    expect(await screen.findByRole("heading", { name: "Welcome to Cairn" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Open a folder as vault/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Recent vaults/i)).not.toBeInTheDocument();
  });

  it("lists recent vaults from the registry, newest first", async () => {
    mockIPC((cmd) => {
      if (cmd === "list_vaults") {
        return [
          {
            path: "/home/amer/brain",
            name: "Brain",
            lastOpenedAt: "2026-04-20T12:00:00Z",
          },
          {
            path: "/home/amer/work",
            name: "Work",
            lastOpenedAt: "2026-04-18T12:00:00Z",
          },
        ];
      }
      throw new Error(`unexpected command ${cmd}`);
    });

    render(wrap(<VaultPicker />));

    const brain = await screen.findByRole("button", { name: /Open vault Brain/i });
    const work = screen.getByRole("button", { name: /Open vault Work/i });
    expect(brain).toBeInTheDocument();
    expect(work).toBeInTheDocument();
    expect(screen.getByText("Recent vaults")).toBeInTheDocument();
  });

  it("clicking a recent vault calls open_vault with its path", async () => {
    const opened: string[] = [];
    mockIPC((cmd, args) => {
      if (cmd === "list_vaults") {
        return [
          { path: "/p/a", name: "A", lastOpenedAt: "2026-04-20T12:00:00Z" },
        ];
      }
      if (cmd === "open_vault") {
        const typed = args as { path: string };
        opened.push(typed.path);
        return { path: typed.path, name: "A", lastOpenedAt: "2026-04-21T00:00:00Z" };
      }
      throw new Error(`unexpected command ${cmd}`);
    });

    render(wrap(<VaultPicker />));
    const btn = await screen.findByRole("button", { name: /Open vault A/i });
    await userEvent.setup().click(btn);

    await waitFor(() => expect(opened).toEqual(["/p/a"]));
  });

  it("the primary button opens the native dialog and invokes open_vault on selection", async () => {
    openDialogMock.mockResolvedValueOnce("/picked/path");
    const opened: string[] = [];
    mockIPC((cmd, args) => {
      if (cmd === "list_vaults") return [];
      if (cmd === "open_vault") {
        const typed = args as { path: string };
        opened.push(typed.path);
        return {
          path: typed.path,
          name: "Picked",
          lastOpenedAt: "2026-04-21T00:00:00Z",
        };
      }
      throw new Error(`unexpected command ${cmd}`);
    });

    render(wrap(<VaultPicker />));
    const btn = await screen.findByRole("button", { name: /Open a folder as vault/i });
    await userEvent.setup().click(btn);

    expect(openDialogMock).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(opened).toEqual(["/picked/path"]));
  });

  it("cancelling the native dialog does NOT call open_vault", async () => {
    openDialogMock.mockResolvedValueOnce(null);
    const opens = vi.fn();
    mockIPC((cmd, args) => {
      if (cmd === "list_vaults") return [];
      if (cmd === "open_vault") {
        opens(args);
        return {};
      }
      throw new Error(`unexpected command ${cmd}`);
    });

    render(wrap(<VaultPicker />));
    await userEvent
      .setup()
      .click(await screen.findByRole("button", { name: /Open a folder as vault/i }));

    expect(openDialogMock).toHaveBeenCalledTimes(1);
    expect(opens).not.toHaveBeenCalled();
  });

  it("forget button removes a vault from the list", async () => {
    const forgotten: string[] = [];
    let vaults = [
      { path: "/p/a", name: "A", lastOpenedAt: "2026-04-20T12:00:00Z" },
    ];

    mockIPC((cmd, args) => {
      if (cmd === "list_vaults") return vaults;
      if (cmd === "forget_vault") {
        const typed = args as { path: string };
        forgotten.push(typed.path);
        vaults = vaults.filter((v) => v.path !== typed.path);
        return null;
      }
      throw new Error(`unexpected command ${cmd}`);
    });

    render(wrap(<VaultPicker />));
    const forget = await screen.findByRole("button", { name: /Forget A/i });
    await userEvent.setup().click(forget);

    await waitFor(() => expect(forgotten).toEqual(["/p/a"]));
  });
});
