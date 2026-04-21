import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { mockIPC } from "@tauri-apps/api/mocks";
import type { ReactNode } from "react";
import { ProjectPage } from "./Project";
import { RouteContext, type RouteState } from "@/shell/routing";

function wrap(children: ReactNode, navigate = vi.fn()) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  const state: RouteState = { page: "project", projectPath: "/v/Projects/P" };
  return (
    <QueryClientProvider client={client}>
      <RouteContext.Provider value={{ state, navigate }}>{children}</RouteContext.Provider>
    </QueryClientProvider>
  );
}

const emptyTree = {
  captures: [],
  someday: [],
  trash: [],
};

const emptyFolder = { files: [], folders: [] };

describe("ProjectPage", () => {
  it("shows empty actions state and creates an action, then navigates to editor", async () => {
    const creates: Array<Record<string, unknown>> = [];
    const navigate = vi.fn();

    mockIPC((cmd, args) => {
      if (cmd === "list_tree") {
        return {
          ...emptyTree,
          projects: [
            { name: "P", path: "/v/Projects/P", actions: [], subdirectories: [] },
          ],
        };
      }
      if (cmd === "list_folder") {
        return emptyFolder;
      }
      if (cmd === "create_action") {
        creates.push(args as Record<string, unknown>);
        return {
          path: "/v/Projects/P/Actions/new.md",
          title: "",
          preview: "",
          createdAt: "2026-04-21T00:00:00Z",
          tags: [],
        };
      }
      throw new Error(`unexpected ${cmd}`);
    });

    render(wrap(<ProjectPage projectPath="/v/Projects/P" />, navigate));

    expect(await screen.findByText("No actions yet")).toBeInTheDocument();

    // Header "New action" button is the first in the DOM.
    const buttons = screen.getAllByRole("button", { name: /New action/ });
    await userEvent.setup().click(buttons[0]);

    await waitFor(() => expect(creates).toHaveLength(1));
    expect(creates[0]).toEqual({ projectPath: "/v/Projects/P" });
    expect(navigate).toHaveBeenCalledWith({
      page: "editor",
      notePath: "/v/Projects/P/Actions/new.md",
      returnTo: "home",
    });
  });

  it("lists existing actions and navigates to editor on click", async () => {
    const navigate = vi.fn();
    mockIPC((cmd) => {
      if (cmd === "list_tree") {
        return {
          ...emptyTree,
          projects: [
            {
              name: "P",
              path: "/v/Projects/P",
              actions: [
                {
                  path: "/v/Projects/P/Actions/a.md",
                  title: "First step",
                  preview: "Do the thing",
                  createdAt: "2026-04-21T00:00:00Z",
                  tags: [],
                },
              ],
              subdirectories: [],
            },
          ],
        };
      }
      if (cmd === "list_folder") return emptyFolder;
      throw new Error(`unexpected ${cmd}`);
    });

    render(wrap(<ProjectPage projectPath="/v/Projects/P" />, navigate));

    const row = await screen.findByText("First step");
    await userEvent.setup().click(row);

    expect(navigate).toHaveBeenCalledWith({
      page: "editor",
      notePath: "/v/Projects/P/Actions/a.md",
      returnTo: "home",
    });
  });

  it("shows not-found state when the project path isn't in the tree", async () => {
    mockIPC((cmd) => {
      if (cmd === "list_tree") {
        return { ...emptyTree, projects: [] };
      }
      throw new Error(`unexpected ${cmd}`);
    });

    render(wrap(<ProjectPage projectPath="/v/Projects/Ghost" />));

    expect(await screen.findByText("Project not found")).toBeInTheDocument();
  });

  it("docs browser lists project docs and hides Actions/assets at the root", async () => {
    mockIPC((cmd) => {
      if (cmd === "list_tree") {
        return {
          ...emptyTree,
          projects: [
            {
              name: "P",
              path: "/v/Projects/P",
              actions: [],
              subdirectories: ["Research"],
            },
          ],
        };
      }
      if (cmd === "list_folder") {
        return {
          files: [
            {
              path: "/v/Projects/P/overview.md",
              title: "Overview",
              preview: "The plan",
              createdAt: "2026-04-21T00:00:00Z",
              tags: [],
            },
          ],
          folders: [
            { name: "Actions", path: "/v/Projects/P/Actions" },
            { name: "assets", path: "/v/Projects/P/assets" },
            { name: "Research", path: "/v/Projects/P/Research" },
          ],
        };
      }
      throw new Error(`unexpected ${cmd}`);
    });

    render(wrap(<ProjectPage projectPath="/v/Projects/P" />));

    // File visible.
    expect(await screen.findByText("Overview")).toBeInTheDocument();
    // Research folder visible.
    expect(screen.getByText("Research")).toBeInTheDocument();
    // Actions and assets suppressed at the root — no button with those names
    // in the docs browser. (Actions still appears as the empty-state section
    // title above, but that's a heading, not a button.)
    expect(screen.queryByRole("button", { name: /^Actions$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^assets$/ })).not.toBeInTheDocument();
  });

  it("clicking a folder descends into it and the breadcrumb reflects the path", async () => {
    const calls: string[] = [];
    mockIPC((cmd, args) => {
      if (cmd === "list_tree") {
        return {
          ...emptyTree,
          projects: [
            {
              name: "P",
              path: "/v/Projects/P",
              actions: [],
              subdirectories: ["Research"],
            },
          ],
        };
      }
      if (cmd === "list_folder") {
        const typed = args as { path: string };
        calls.push(typed.path);
        if (typed.path === "/v/Projects/P") {
          return {
            files: [],
            folders: [{ name: "Research", path: "/v/Projects/P/Research" }],
          };
        }
        if (typed.path === "/v/Projects/P/Research") {
          return {
            files: [
              {
                path: "/v/Projects/P/Research/notes.md",
                title: "Research notes",
                preview: "",
                createdAt: "2026-04-21T00:00:00Z",
                tags: [],
              },
            ],
            folders: [],
          };
        }
        return emptyFolder;
      }
      throw new Error(`unexpected ${cmd}`);
    });

    render(wrap(<ProjectPage projectPath="/v/Projects/P" />));
    const user = userEvent.setup();

    await screen.findByText("Research");
    await user.click(screen.getByRole("button", { name: /^Research/ }));

    // Nested content rendered.
    expect(await screen.findByText("Research notes")).toBeInTheDocument();
    // Breadcrumb now shows P > Research.
    expect(await screen.findByRole("button", { name: /^Research$/ })).toBeInTheDocument();

    // Click the project-root breadcrumb to go back.
    await user.click(screen.getByRole("button", { name: /^P$/ }));
    await waitFor(() => expect(calls).toContain("/v/Projects/P/Research"));
    await waitFor(() => expect(calls.at(-1)).toBe("/v/Projects/P"));
  });
});
