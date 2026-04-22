import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { mockIPC } from "@tauri-apps/api/mocks";
import type { ReactNode } from "react";
import { RenameProjectDialog } from "./RenameProjectDialog";

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
  actions: [],
  subdirectories: [],
};
const beta = {
  name: "Beta",
  path: "/v/Projects/Beta",
  actions: [],
  subdirectories: [],
};

describe("RenameProjectDialog", () => {
  it("disables Save until the name changes to something valid", async () => {
    mockIPC((cmd) => {
      if (cmd === "list_tree") return { ...emptyTree, projects: [alpha, beta] };
      throw new Error(`unexpected ${cmd}`);
    });

    render(
      wrap(
        <RenameProjectDialog
          open
          onOpenChange={vi.fn()}
          projectPath={alpha.path}
          projectName={alpha.name}
        />,
      ),
    );

    const save = await screen.findByRole("button", { name: /Rename$/ });
    // Pre-filled with the current name → unchanged → disabled.
    expect(save).toBeDisabled();

    const input = screen.getByLabelText(/Project name/);

    // Empty → disabled + hint.
    const user = userEvent.setup();
    await user.clear(input);
    expect(save).toBeDisabled();
    expect(screen.getByText(/Name is required/)).toBeInTheDocument();

    // Collision with another project (case-insensitive) → disabled + hint.
    await user.type(input, "BETA");
    expect(save).toBeDisabled();
    expect(
      screen.getByText(/A project named "BETA" already exists/),
    ).toBeInTheDocument();

    // Valid, different name → enabled.
    await user.clear(input);
    await user.type(input, "Gamma");
    expect(save).toBeEnabled();
  });

  it("invokes rename_project and hands the new path to onRenamed", async () => {
    const renames: Array<Record<string, unknown>> = [];
    mockIPC((cmd, args) => {
      if (cmd === "list_tree") return { ...emptyTree, projects: [alpha] };
      if (cmd === "rename_project") {
        renames.push(args as Record<string, unknown>);
        return "/v/Projects/Gamma";
      }
      throw new Error(`unexpected ${cmd}`);
    });

    const onOpenChange = vi.fn();
    const onRenamed = vi.fn();
    render(
      wrap(
        <RenameProjectDialog
          open
          onOpenChange={onOpenChange}
          projectPath={alpha.path}
          projectName={alpha.name}
          onRenamed={onRenamed}
        />,
      ),
    );

    const user = userEvent.setup();
    const input = await screen.findByLabelText(/Project name/);
    await user.clear(input);
    await user.type(input, "Gamma");
    await user.click(screen.getByRole("button", { name: /Rename$/ }));

    await waitFor(() => expect(renames).toHaveLength(1));
    expect(renames[0]).toEqual({
      oldPath: "/v/Projects/Alpha",
      newName: "Gamma",
    });
    await waitFor(() => expect(onRenamed).toHaveBeenCalledWith("/v/Projects/Gamma"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("surfaces a backend error without closing the dialog", async () => {
    mockIPC((cmd) => {
      if (cmd === "list_tree") return { ...emptyTree, projects: [alpha] };
      if (cmd === "rename_project") {
        throw { code: "io", message: "disk on fire" };
      }
      throw new Error(`unexpected ${cmd}`);
    });

    const onOpenChange = vi.fn();
    render(
      wrap(
        <RenameProjectDialog
          open
          onOpenChange={onOpenChange}
          projectPath={alpha.path}
          projectName={alpha.name}
        />,
      ),
    );

    const user = userEvent.setup();
    const input = await screen.findByLabelText(/Project name/);
    await user.clear(input);
    await user.type(input, "Gamma");
    await user.click(screen.getByRole("button", { name: /Rename$/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent("disk on fire");
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
