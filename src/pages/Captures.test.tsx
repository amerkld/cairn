import { describe, it, expect } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { mockIPC } from "@tauri-apps/api/mocks";
import type { ReactNode } from "react";
import { Captures } from "./Captures";
import type { NoteRef, Tree } from "@/lib/invoke";

function wrap(children: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const emptyTree = (): Tree => ({
  captures: [],
  someday: [],
  projects: [],
  trash: [],
});

const capture = (overrides: Partial<NoteRef> = {}): NoteRef => ({
  path: "/v/Captures/a.md",
  title: "Quick thought",
  preview: "Something I want to remember later.",
  createdAt: "2026-04-20T12:00:00Z",
  tags: [],
  ...overrides,
});

const project = (overrides: Partial<import("@/lib/invoke").Project> = {}) => ({
  name: "Writing",
  path: "/v/Projects/Writing",
  actions: [],
  subdirectories: [],
  ...overrides,
});

describe("Captures page", () => {
  it("shows empty state with 'Create your first capture' CTA when no captures", async () => {
    mockIPC((cmd) => {
      if (cmd === "list_tree") return emptyTree();
      throw new Error(`unexpected: ${cmd}`);
    });

    render(wrap(<Captures />));

    expect(await screen.findByText("Captures is empty")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Create your first capture/ }),
    ).toBeInTheDocument();
  });

  it("renders a grid of capture cards with title, preview, and relative time", async () => {
    mockIPC((cmd) => {
      if (cmd === "list_tree") {
        return {
          ...emptyTree(),
          captures: [
            capture({ title: "Write notes", preview: "Body goes here" }),
            capture({
              path: "/v/Captures/b.md",
              title: "Second",
              preview: "Another",
            }),
          ],
        };
      }
      throw new Error(`unexpected: ${cmd}`);
    });

    render(wrap(<Captures />));

    expect(await screen.findByText("Write notes")).toBeInTheDocument();
    expect(screen.getByText("Body goes here")).toBeInTheDocument();
    expect(screen.getByText("Second")).toBeInTheDocument();
    // Badge shows count
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("clicking 'New capture' calls create_capture and refetches the tree", async () => {
    let listCalls = 0;
    const creates: Array<Record<string, unknown>> = [];

    mockIPC((cmd, args) => {
      if (cmd === "list_tree") {
        listCalls += 1;
        return emptyTree();
      }
      if (cmd === "create_capture") {
        creates.push((args as Record<string, unknown>) ?? {});
        return capture({ path: "/v/Captures/new.md" });
      }
      throw new Error(`unexpected: ${cmd}`);
    });

    render(wrap(<Captures />));

    // Wait for initial fetch to settle so the CTA is visible.
    await screen.findByText("Captures is empty");
    const initialCalls = listCalls;

    const button = await screen.findByRole("button", {
      name: /Create your first capture/,
    });
    await userEvent.setup().click(button);

    await waitFor(() => expect(creates).toHaveLength(1));
    await waitFor(() => expect(listCalls).toBeGreaterThan(initialCalls));
  });

  it("Move to Someday menu item calls move_note with target 'someday'", async () => {
    const moves: Array<Record<string, unknown>> = [];

    mockIPC((cmd, args) => {
      if (cmd === "list_tree") {
        return {
          ...emptyTree(),
          captures: [capture({ path: "/v/Captures/a.md", title: "Note A" })],
        };
      }
      if (cmd === "move_note") {
        moves.push(args as Record<string, unknown>);
        return "/v/Someday/a.md";
      }
      throw new Error(`unexpected: ${cmd}`);
    });

    render(wrap(<Captures />));
    const user = userEvent.setup();

    await screen.findByText("Note A");
    await user.click(screen.getByRole("button", { name: /More actions/ }));
    await user.click(await screen.findByRole("menuitem", { name: /Move to Someday/ }));

    await waitFor(() =>
      expect(moves).toEqual([{ src: "/v/Captures/a.md", target: "someday" }]),
    );
  });

  it("opens the Move-to-project dialog with an empty-state prompt when no projects exist", async () => {
    mockIPC((cmd) => {
      if (cmd === "list_tree") {
        return {
          ...emptyTree(),
          captures: [capture({ path: "/v/Captures/a.md", title: "Note A" })],
        };
      }
      throw new Error(`unexpected: ${cmd}`);
    });

    render(wrap(<Captures />));
    const user = userEvent.setup();
    await screen.findByText("Note A");
    await user.click(screen.getByRole("button", { name: /More actions/ }));
    await user.click(await screen.findByRole("menuitem", { name: /Move to project/ }));

    expect(
      await screen.findByText(/No projects yet\. Type a name to create one\./),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Move to project" })).toBeInTheDocument();
  });

  it("picking a project then 'Project root' moves the capture to the project root", async () => {
    const moves: Array<Record<string, unknown>> = [];
    mockIPC((cmd, args) => {
      if (cmd === "list_tree") {
        return {
          ...emptyTree(),
          captures: [capture({ path: "/v/Captures/a.md", title: "Note A" })],
          projects: [project()],
        };
      }
      if (cmd === "move_note") {
        moves.push(args as Record<string, unknown>);
        return "/v/Projects/Writing/a.md";
      }
      throw new Error(`unexpected: ${cmd}`);
    });

    render(wrap(<Captures />));
    const user = userEvent.setup();

    await screen.findByText("Note A");
    await user.click(screen.getByRole("button", { name: /More actions/ }));
    await user.click(await screen.findByRole("menuitem", { name: /Move to project/ }));
    // Step 1: pick Writing.
    await user.click(await screen.findByRole("option", { name: /Writing/ }));
    // Step 2: Project root is the default selection; just click Move.
    await user.click(screen.getByRole("button", { name: /^Move$/ }));

    await waitFor(() =>
      expect(moves).toEqual([
        { src: "/v/Captures/a.md", target: "Projects/Writing" },
      ]),
    );
  });

  it("picking a project then 'Actions' moves into the project's Actions dir", async () => {
    const moves: Array<Record<string, unknown>> = [];
    mockIPC((cmd, args) => {
      if (cmd === "list_tree") {
        return {
          ...emptyTree(),
          captures: [capture({ path: "/v/Captures/a.md", title: "Note A" })],
          projects: [project()],
        };
      }
      if (cmd === "move_note") {
        moves.push(args as Record<string, unknown>);
        return "/v/Projects/Writing/Actions/a.md";
      }
      throw new Error(`unexpected: ${cmd}`);
    });

    render(wrap(<Captures />));
    const user = userEvent.setup();

    await screen.findByText("Note A");
    await user.click(screen.getByRole("button", { name: /More actions/ }));
    await user.click(await screen.findByRole("menuitem", { name: /Move to project/ }));
    await user.click(await screen.findByRole("option", { name: /Writing/ }));
    await user.click(screen.getByRole("radio", { name: /Actions/ }));
    await user.click(screen.getByRole("button", { name: /^Move$/ }));

    await waitFor(() =>
      expect(moves).toEqual([
        { src: "/v/Captures/a.md", target: "Projects/Writing/Actions" },
      ]),
    );
  });

  it("picking a project then typing a subdirectory moves into that folder", async () => {
    const moves: Array<Record<string, unknown>> = [];
    mockIPC((cmd, args) => {
      if (cmd === "list_tree") {
        return {
          ...emptyTree(),
          captures: [capture({ path: "/v/Captures/a.md", title: "Note A" })],
          projects: [
            project({ subdirectories: ["research"] }),
          ],
        };
      }
      if (cmd === "move_note") {
        moves.push(args as Record<string, unknown>);
        return "/v/Projects/Writing/research/a.md";
      }
      throw new Error(`unexpected: ${cmd}`);
    });

    render(wrap(<Captures />));
    const user = userEvent.setup();

    await screen.findByText("Note A");
    await user.click(screen.getByRole("button", { name: /More actions/ }));
    await user.click(await screen.findByRole("menuitem", { name: /Move to project/ }));
    await user.click(await screen.findByRole("option", { name: /Writing/ }));
    await user.click(screen.getByRole("radio", { name: /Subdirectory/ }));
    // Click the existing-subdir chip to fill the field.
    await user.click(screen.getByRole("button", { name: "research" }));
    await user.click(screen.getByRole("button", { name: /^Move$/ }));

    await waitFor(() =>
      expect(moves).toEqual([
        { src: "/v/Captures/a.md", target: "Projects/Writing/research" },
      ]),
    );
  });

  it("typing a new project name shows 'Create' and advances to destination step on click", async () => {
    const creates: string[] = [];
    const moves: Array<Record<string, unknown>> = [];
    mockIPC((cmd, args) => {
      if (cmd === "list_tree") {
        return {
          ...emptyTree(),
          captures: [capture({ path: "/v/Captures/a.md", title: "Note A" })],
        };
      }
      if (cmd === "create_project") {
        const typed = args as { name: string };
        creates.push(typed.name);
        return "/v/Projects/" + typed.name;
      }
      if (cmd === "move_note") {
        moves.push(args as Record<string, unknown>);
        return "/v/Projects/Writing/a.md";
      }
      throw new Error(`unexpected: ${cmd}`);
    });

    render(wrap(<Captures />));
    const user = userEvent.setup();

    await screen.findByText("Note A");
    await user.click(screen.getByRole("button", { name: /More actions/ }));
    await user.click(await screen.findByRole("menuitem", { name: /Move to project/ }));

    const search = await screen.findByLabelText("Search projects");
    await user.type(search, "Writing");
    await user.click(await screen.findByRole("option", { name: /Create project/ }));

    await waitFor(() => expect(creates).toEqual(["Writing"]));
    // We're now on step 2 — click Move to finish.
    await user.click(await screen.findByRole("button", { name: /^Move$/ }));

    await waitFor(() =>
      expect(moves).toEqual([
        { src: "/v/Captures/a.md", target: "Projects/Writing" },
      ]),
    );
  });
});
