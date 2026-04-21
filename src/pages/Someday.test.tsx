import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { mockIPC } from "@tauri-apps/api/mocks";
import type { ReactNode } from "react";
import { Someday } from "./Someday";
import { RouteContext, type RouteState } from "@/shell/routing";
import type { NoteRef } from "@/lib/invoke";

function wrap(children: ReactNode, navigate = vi.fn()) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  const state: RouteState = { page: "someday" };
  return (
    <QueryClientProvider client={client}>
      <RouteContext.Provider value={{ state, navigate }}>{children}</RouteContext.Provider>
    </QueryClientProvider>
  );
}

const emptyTree = {
  captures: [],
  projects: [],
  trash: [],
};

const parked = (overrides: Partial<NoteRef> = {}): NoteRef => ({
  path: "/v/Someday/a.md",
  title: "Read that book",
  preview: "The one Alice recommended",
  createdAt: "2026-04-20T00:00:00Z",
  tags: [],
  remindAt: null,
  deadline: null,
  ...overrides,
});

describe("Someday page", () => {
  it("shows empty state when no notes are parked", async () => {
    mockIPC((cmd) => {
      if (cmd === "list_tree") return { ...emptyTree, someday: [] };
      throw new Error(`unexpected ${cmd}`);
    });
    render(wrap(<Someday />));
    expect(await screen.findByText("Nothing parked")).toBeInTheDocument();
  });

  it("renders parked notes with titles and previews", async () => {
    mockIPC((cmd) => {
      if (cmd === "list_tree") {
        return {
          ...emptyTree,
          someday: [
            parked({ title: "Learn Rust" }),
            parked({
              path: "/v/Someday/b.md",
              title: "Explore Amsterdam",
              preview: "Trip idea",
            }),
          ],
        };
      }
      throw new Error(`unexpected ${cmd}`);
    });

    render(wrap(<Someday />));
    expect(await screen.findByText("Learn Rust")).toBeInTheDocument();
    expect(screen.getByText("Explore Amsterdam")).toBeInTheDocument();
    expect(screen.getByText("Trip idea")).toBeInTheDocument();
  });

  it("'Remind me → In a week' calls set_remind_at with an ISO timestamp", async () => {
    const calls: Array<{ path: string; remindAt: unknown }> = [];
    mockIPC((cmd, args) => {
      if (cmd === "list_tree") {
        return { ...emptyTree, someday: [parked({ title: "Plan trip" })] };
      }
      if (cmd === "set_remind_at") {
        calls.push(args as { path: string; remindAt: unknown });
        return null;
      }
      throw new Error(`unexpected ${cmd}`);
    });

    render(wrap(<Someday />));
    const user = userEvent.setup();
    await screen.findByText("Plan trip");
    await user.click(screen.getByRole("button", { name: /Remind me/ }));
    await user.click(await screen.findByRole("menuitem", { name: /In a week/ }));

    await waitFor(() => expect(calls).toHaveLength(1));
    const first = calls[0]!;
    expect(first.path).toBe("/v/Someday/a.md");
    // remindAt is an ISO string roughly 7 days in the future.
    expect(typeof first.remindAt).toBe("string");
    const when = new Date(first.remindAt as string).getTime();
    const sevenDaysFromNow = Date.now() + 7 * 24 * 60 * 60 * 1000;
    // Within a day's window — generous since presets anchor to 9am local.
    expect(Math.abs(when - sevenDaysFromNow)).toBeLessThan(24 * 60 * 60 * 1000);
  });

  it("'Clear reminder' sends null for remindAt", async () => {
    const calls: Array<{ path: string; remindAt: unknown }> = [];
    mockIPC((cmd, args) => {
      if (cmd === "list_tree") {
        return {
          ...emptyTree,
          someday: [
            parked({
              title: "Already reminded",
              remindAt: "2027-01-01T09:00:00Z",
            }),
          ],
        };
      }
      if (cmd === "set_remind_at") {
        calls.push(args as { path: string; remindAt: unknown });
        return null;
      }
      throw new Error(`unexpected ${cmd}`);
    });

    render(wrap(<Someday />));
    const user = userEvent.setup();
    await screen.findByText("Already reminded");
    await user.click(screen.getByRole("button", { name: /Change reminder/ }));
    await user.click(await screen.findByRole("menuitem", { name: /Clear reminder/ }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toEqual({ path: "/v/Someday/a.md", remindAt: null });
  });

  it("'New someday' creates a note and navigates to the editor", async () => {
    const navigate = vi.fn();
    const creates: Array<unknown> = [];
    mockIPC((cmd, args) => {
      if (cmd === "list_tree") return { ...emptyTree, someday: [] };
      if (cmd === "create_someday") {
        creates.push(args);
        return {
          path: "/v/Someday/new.md",
          title: "",
          preview: "",
          createdAt: "2026-04-21T00:00:00Z",
          tags: [],
          remindAt: null,
          deadline: null,
        };
      }
      throw new Error(`unexpected ${cmd}`);
    });

    render(wrap(<Someday />, navigate));
    const user = userEvent.setup();
    await screen.findByText("Nothing parked");
    await user.click(screen.getByRole("button", { name: /Park a thought/ }));

    await waitFor(() => expect(creates).toHaveLength(1));
    expect(navigate).toHaveBeenCalledWith({
      page: "editor",
      notePath: "/v/Someday/new.md",
      returnTo: "someday",
    });
  });
});
