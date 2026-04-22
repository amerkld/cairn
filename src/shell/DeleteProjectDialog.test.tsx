import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { mockIPC } from "@tauri-apps/api/mocks";
import type { ReactNode } from "react";
import { DeleteProjectDialog } from "./DeleteProjectDialog";

function wrap(children: ReactNode) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const emptyTree = {
  captures: [],
  someday: [],
  trash: [],
};

const alpha = {
  name: "Alpha",
  path: "/v/Projects/Alpha",
  actions: [
    {
      path: "/v/Projects/Alpha/Actions/a.md",
      title: "Do thing",
      preview: "",
      createdAt: "2026-04-21T00:00:00Z",
      tags: [],
    },
  ],
  subdirectories: ["Research"],
};

describe("DeleteProjectDialog", () => {
  it("keeps Delete disabled until the typed name matches exactly", async () => {
    mockIPC((cmd) => {
      if (cmd === "list_tree") return { ...emptyTree, projects: [alpha] };
      throw new Error(`unexpected ${cmd}`);
    });

    render(
      wrap(
        <DeleteProjectDialog
          open
          onOpenChange={vi.fn()}
          projectPath={alpha.path}
          projectName={alpha.name}
        />,
      ),
    );

    const deleteBtn = await screen.findByRole("button", {
      name: /Delete project/,
    });
    expect(deleteBtn).toBeDisabled();

    const input = screen.getByLabelText(/Type the project name to confirm/);
    const user = userEvent.setup();

    // Close-but-not-exact — case difference should still block.
    await user.type(input, "alpha");
    expect(deleteBtn).toBeDisabled();

    // Exact match → enabled.
    await user.clear(input);
    await user.type(input, "Alpha");
    expect(deleteBtn).toBeEnabled();
  });

  it("shows an action + subfolder summary when the project has them", async () => {
    mockIPC((cmd) => {
      if (cmd === "list_tree") return { ...emptyTree, projects: [alpha] };
      throw new Error(`unexpected ${cmd}`);
    });

    render(
      wrap(
        <DeleteProjectDialog
          open
          onOpenChange={vi.fn()}
          projectPath={alpha.path}
          projectName={alpha.name}
        />,
      ),
    );

    expect(await screen.findByText(/1 open action/)).toBeInTheDocument();
    expect(screen.getByText(/1 subfolder/)).toBeInTheDocument();
  });

  it("calls delete_project on confirmation and fires onDeleted", async () => {
    const deletes: Array<Record<string, unknown>> = [];
    mockIPC((cmd, args) => {
      if (cmd === "list_tree") return { ...emptyTree, projects: [alpha] };
      if (cmd === "delete_project") {
        deletes.push(args as Record<string, unknown>);
        return null;
      }
      throw new Error(`unexpected ${cmd}`);
    });

    const onOpenChange = vi.fn();
    const onDeleted = vi.fn();
    render(
      wrap(
        <DeleteProjectDialog
          open
          onOpenChange={onOpenChange}
          projectPath={alpha.path}
          projectName={alpha.name}
          onDeleted={onDeleted}
        />,
      ),
    );

    const user = userEvent.setup();
    const input = await screen.findByLabelText(
      /Type the project name to confirm/,
    );
    await user.type(input, alpha.name);
    await user.click(screen.getByRole("button", { name: /Delete project/ }));

    await waitFor(() => expect(deletes).toHaveLength(1));
    expect(deletes[0]).toEqual({ path: alpha.path });
    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
