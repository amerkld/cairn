import { describe, it, expect } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { mockIPC } from "@tauri-apps/api/mocks";
import type { ReactNode } from "react";
import { TrashPage } from "./Trash";
import { RouteContext, type RouteState } from "@/shell/routing";

function wrap(children: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  const state: RouteState = { page: "trash" };
  return (
    <QueryClientProvider client={client}>
      <RouteContext.Provider value={{ state, navigate: () => undefined }}>
        {children}
      </RouteContext.Provider>
    </QueryClientProvider>
  );
}

describe("TrashPage", () => {
  it("shows empty state and hides the Empty-trash button when there are no entries", async () => {
    mockIPC((cmd) => {
      if (cmd === "list_trash") return [];
      throw new Error(`unexpected ${cmd}`);
    });
    render(wrap(<TrashPage />));
    expect(await screen.findByText("Trash is empty")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Empty trash/ }),
    ).not.toBeInTheDocument();
  });

  it("lists trashed entries with title + original path + relative time", async () => {
    mockIPC((cmd) => {
      if (cmd === "list_trash") {
        return [
          {
            originalPath: "Captures/a.md",
            trashedPath: "/v/.cairn/trash/Captures/a.md",
            title: "Old idea",
            deletedAt: "2026-04-20T00:00:00Z",
          },
          {
            originalPath: "Someday/b.md",
            trashedPath: "/v/.cairn/trash/Someday/b.md",
            title: "Parked thought",
            deletedAt: "2026-04-19T00:00:00Z",
          },
        ];
      }
      throw new Error(`unexpected ${cmd}`);
    });

    render(wrap(<TrashPage />));
    expect(await screen.findByText("Old idea")).toBeInTheDocument();
    expect(screen.getByText("Parked thought")).toBeInTheDocument();
    expect(screen.getByText("Captures/a.md")).toBeInTheDocument();
  });

  it("Restore calls restore_trash for the clicked entry", async () => {
    const calls: Array<Record<string, unknown>> = [];
    mockIPC((cmd, args) => {
      if (cmd === "list_trash") {
        return [
          {
            originalPath: "Captures/a.md",
            trashedPath: "/v/.cairn/trash/Captures/a.md",
            title: "Bring back",
            deletedAt: "2026-04-20T00:00:00Z",
          },
        ];
      }
      if (cmd === "restore_trash") {
        calls.push(args as Record<string, unknown>);
        return "/v/Captures/a.md";
      }
      throw new Error(`unexpected ${cmd}`);
    });

    render(wrap(<TrashPage />));
    const user = userEvent.setup();
    await screen.findByText("Bring back");
    await user.click(screen.getByRole("button", { name: /Restore/ }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toEqual({ trashedPath: "/v/.cairn/trash/Captures/a.md" });
  });

  it("Empty trash requires an explicit confirm step", async () => {
    const calls: number[] = [];
    mockIPC((cmd) => {
      if (cmd === "list_trash") {
        return [
          {
            originalPath: "Captures/a.md",
            trashedPath: "/v/.cairn/trash/Captures/a.md",
            title: "Gone",
            deletedAt: "2026-04-20T00:00:00Z",
          },
        ];
      }
      if (cmd === "empty_trash") {
        calls.push(1);
        return 1;
      }
      throw new Error(`unexpected ${cmd}`);
    });

    render(wrap(<TrashPage />));
    const user = userEvent.setup();
    await screen.findByText("Gone");

    // First click arms; second click confirms.
    await user.click(screen.getByRole("button", { name: /Empty trash/ }));
    await user.click(await screen.findByRole("button", { name: /Yes, delete/ }));

    await waitFor(() => expect(calls).toEqual([1]));
  });
});
