import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { mockIPC } from "@tauri-apps/api/mocks";
import { useState, type ReactNode } from "react";
import { CommandPalette } from "./CommandPalette";
import { RouteContext, type RouteState } from "./routing";

function wrap(children: ReactNode, navigate = vi.fn()) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  const state: RouteState = { page: "home" };
  return (
    <QueryClientProvider client={client}>
      <RouteContext.Provider value={{ state, navigate }}>{children}</RouteContext.Provider>
    </QueryClientProvider>
  );
}

function Harness({
  navigate = vi.fn(),
  initialOpen = true,
}: {
  navigate?: ReturnType<typeof vi.fn>;
  initialOpen?: boolean;
}) {
  const [open, setOpen] = useState(initialOpen);
  return wrap(<CommandPalette open={open} onOpenChange={setOpen} />, navigate);
}

describe("CommandPalette", () => {
  it("renders navigation entries even before any search query", async () => {
    mockIPC((cmd) => {
      if (cmd === "list_tree") {
        return { captures: [], someday: [], projects: [], trash: [] };
      }
      throw new Error(`unexpected ${cmd}`);
    });

    render(<Harness />);
    // cmdk items carry role="option"; match by visible text content.
    expect(await screen.findByRole("option", { name: /Home/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Captures/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Someday/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Trash/ })).toBeInTheDocument();
  });

  it("selecting a nav entry navigates to that page", async () => {
    const navigate = vi.fn();
    mockIPC((cmd) => {
      if (cmd === "list_tree") {
        return { captures: [], someday: [], projects: [], trash: [] };
      }
      throw new Error(`unexpected ${cmd}`);
    });

    render(<Harness navigate={navigate} />);
    const user = userEvent.setup();
    const captures = await screen.findByRole("option", { name: /Captures/ });
    await user.click(captures);

    expect(navigate).toHaveBeenCalledWith({ page: "captures" });
  });

  it("typed query fires search_notes and shows search results", async () => {
    const searchCalls: string[] = [];
    mockIPC((cmd, args) => {
      if (cmd === "list_tree") {
        return { captures: [], someday: [], projects: [], trash: [] };
      }
      if (cmd === "search_notes") {
        const typed = args as { query: string };
        searchCalls.push(typed.query);
        return [
          {
            path: "/v/Captures/ship.md",
            title: "Ship idea",
            snippet: "…ship the thing…",
            titleMatch: true,
          },
        ];
      }
      throw new Error(`unexpected ${cmd}`);
    });

    render(<Harness />);
    const user = userEvent.setup();
    const input = await screen.findByPlaceholderText(/Search notes/);
    await user.type(input, "ship");

    await waitFor(() => expect(searchCalls).toContain("ship"));
    expect(await screen.findByText("Ship idea")).toBeInTheDocument();
    expect(screen.getByText(/ship the thing/)).toBeInTheDocument();
  });

  it("selecting a search hit navigates to the editor", async () => {
    const navigate = vi.fn();
    mockIPC((cmd) => {
      if (cmd === "list_tree") {
        return { captures: [], someday: [], projects: [], trash: [] };
      }
      if (cmd === "search_notes") {
        return [
          {
            path: "/v/Captures/notes.md",
            title: "Notes",
            snippet: "body",
            titleMatch: true,
          },
        ];
      }
      throw new Error(`unexpected ${cmd}`);
    });

    render(<Harness navigate={navigate} />);
    const user = userEvent.setup();
    const input = await screen.findByPlaceholderText(/Search notes/);
    await user.type(input, "notes");

    await user.click(await screen.findByText("Notes"));
    expect(navigate).toHaveBeenCalledWith({
      page: "editor",
      notePath: "/v/Captures/notes.md",
      returnTo: { page: "home" },
    });
  });
});
