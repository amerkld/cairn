import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { mockIPC } from "@tauri-apps/api/mocks";
import type { ReactNode } from "react";
import { Home } from "./Home";
import { RouteContext, type RouteState } from "@/shell/routing";

function wrap(children: ReactNode, navigate = vi.fn()) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  const state: RouteState = { page: "home" };
  return (
    <QueryClientProvider client={client}>
      <RouteContext.Provider value={{ state, navigate }}>{children}</RouteContext.Provider>
    </QueryClientProvider>
  );
}

const emptyAction = (overrides: Record<string, unknown> = {}) => ({
  projectName: "P",
  projectPath: "/v/Projects/P",
  action: {
    path: "/v/Projects/P/Actions/a.md",
    title: "Action A",
    preview: "",
    createdAt: "2026-04-21T00:00:00Z",
    tags: [],
    remindAt: null,
    deadline: null,
    ...overrides,
  },
});

describe("Home page", () => {
  it("shows empty state when no actions are present", async () => {
    mockIPC((cmd) => {
      if (cmd === "list_home_actions") return [];
      throw new Error(`unexpected ${cmd}`);
    });

    render(wrap(<Home />));
    expect(await screen.findByText("Your home is quiet")).toBeInTheDocument();
  });

  it("renders actions grouped by project", async () => {
    mockIPC((cmd) => {
      if (cmd === "list_home_actions") {
        return [
          emptyAction({ title: "A1" }),
          {
            ...emptyAction({ title: "A2" }),
            action: {
              path: "/v/Projects/P/Actions/a2.md",
              title: "A2",
              preview: "",
              createdAt: "2026-04-21T00:00:00Z",
              tags: [],
            },
          },
          {
            projectName: "Q",
            projectPath: "/v/Projects/Q",
            action: {
              path: "/v/Projects/Q/Actions/b.md",
              title: "B1",
              preview: "",
              createdAt: "2026-04-21T00:00:00Z",
              tags: [],
            },
          },
        ];
      }
      throw new Error(`unexpected ${cmd}`);
    });

    render(wrap(<Home />));

    expect(await screen.findByText("A1")).toBeInTheDocument();
    expect(screen.getByText("A2")).toBeInTheDocument();
    expect(screen.getByText("B1")).toBeInTheDocument();
    // Project group headers (uppercased via CSS — check the text in the DOM).
    expect(screen.getByText(/^P$/)).toBeInTheDocument();
    expect(screen.getByText(/^Q$/)).toBeInTheDocument();
  });

  it("completing an action opens the dialog and submits with note", async () => {
    const completed: Array<Record<string, unknown>> = [];
    mockIPC((cmd, args) => {
      if (cmd === "list_home_actions") {
        return [emptyAction({ title: "Ship it" })];
      }
      if (cmd === "complete_action") {
        completed.push(args as Record<string, unknown>);
        return "/v/Projects/P/Actions/Archive/a.md";
      }
      throw new Error(`unexpected ${cmd}`);
    });

    render(wrap(<Home />));
    const user = userEvent.setup();

    await screen.findByText("Ship it");
    // The action row's complete button has aria-label "Complete action".
    await user.click(screen.getByRole("button", { name: "Complete action" }));

    // Dialog appears; fill note and submit.
    const note = await screen.findByLabelText("Completion note");
    await user.type(note, "felt great");
    await user.click(screen.getByRole("button", { name: /Mark complete/ }));

    await waitFor(() => expect(completed).toHaveLength(1));
    expect(completed[0]).toMatchObject({
      path: "/v/Projects/P/Actions/a.md",
      note: "felt great",
    });
  });

  it("completing without a note omits the note arg entirely", async () => {
    const completed: Array<Record<string, unknown>> = [];
    mockIPC((cmd, args) => {
      if (cmd === "list_home_actions") {
        return [emptyAction({ title: "Skip note" })];
      }
      if (cmd === "complete_action") {
        completed.push(args as Record<string, unknown>);
        return "/v/Projects/P/Actions/Archive/a.md";
      }
      throw new Error(`unexpected ${cmd}`);
    });

    render(wrap(<Home />));
    const user = userEvent.setup();

    await screen.findByText("Skip note");
    await user.click(screen.getByRole("button", { name: "Complete action" }));
    await screen.findByLabelText("Completion note");
    await user.click(screen.getByRole("button", { name: /Mark complete/ }));

    await waitFor(() => expect(completed).toHaveLength(1));
    // No `note` property should have been sent.
    expect(completed[0]).toEqual({ path: "/v/Projects/P/Actions/a.md" });
  });

  it("clicking an action title navigates to the editor", async () => {
    const navigate = vi.fn();
    mockIPC((cmd) => {
      if (cmd === "list_home_actions") return [emptyAction({ title: "Open me" })];
      throw new Error(`unexpected ${cmd}`);
    });

    render(wrap(<Home />, navigate));
    const user = userEvent.setup();

    const title = await screen.findByText("Open me");
    await user.click(title);

    expect(navigate).toHaveBeenCalledWith({
      page: "editor",
      notePath: "/v/Projects/P/Actions/a.md",
      returnTo: { page: "home" },
    });
  });

  it("actions with a past remindAt appear in the Due section", async () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    const future = new Date(Date.now() + 24 * 60 * 60_000).toISOString();
    mockIPC((cmd) => {
      if (cmd === "list_home_actions") {
        return [
          emptyAction({
            path: "/v/Projects/P/Actions/due.md",
            title: "Due now",
            remindAt: past,
          }),
          emptyAction({
            path: "/v/Projects/P/Actions/later.md",
            title: "Due later",
            remindAt: future,
          }),
        ];
      }
      throw new Error(`unexpected ${cmd}`);
    });

    render(wrap(<Home />));
    await screen.findByText("Due now");

    // The Due section's own heading count badge should read 1.
    const dueHeading = screen.getByRole("heading", { name: "Due" });
    const dueSection = dueHeading.closest("section");
    expect(dueSection).not.toBeNull();
    const { getByText: inDue } = (await import("@testing-library/react")).within(
      dueSection as HTMLElement,
    );
    expect(inDue("Due now")).toBeInTheDocument();
  });

  it("actions with a deadline today-or-earlier appear in the Due section", async () => {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, "0");
    const d = String(today.getDate()).padStart(2, "0");
    const todayYmd = `${y}-${m}-${d}`;

    mockIPC((cmd) => {
      if (cmd === "list_home_actions") {
        return [
          emptyAction({
            path: "/v/Projects/P/Actions/ship.md",
            title: "Ship today",
            deadline: todayYmd,
          }),
        ];
      }
      throw new Error(`unexpected ${cmd}`);
    });

    render(wrap(<Home />));
    await screen.findByText("Ship today");

    const dueHeading = screen.getByRole("heading", { name: "Due" });
    const dueSection = dueHeading.closest("section");
    const { within } = await import("@testing-library/react");
    expect(within(dueSection as HTMLElement).getByText("Ship today")).toBeInTheDocument();
  });
});
