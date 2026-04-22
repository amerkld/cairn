import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { mockIPC } from "@tauri-apps/api/mocks";
import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { RouteContext, type RouteState } from "./routing";
import type { VaultSummary } from "@/lib/invoke";

function wrap(children: ReactNode, navigate = vi.fn(), state?: RouteState) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  return (
    <QueryClientProvider client={client}>
      <RouteContext.Provider
        value={{ state: state ?? { page: "home" }, navigate }}
      >
        {children}
      </RouteContext.Provider>
    </QueryClientProvider>
  );
}

const vault: VaultSummary = {
  path: "/v",
  name: "My Vault",
  lastOpenedAt: null,
};

const treeWithAlpha = {
  captures: [],
  someday: [],
  trash: [],
  projects: [
    {
      name: "Alpha",
      path: "/v/Projects/Alpha",
      actions: [],
      subdirectories: [],
    },
  ],
};

describe("Sidebar — project row menu", () => {
  it("renders a three-dot trigger on each project row", async () => {
    mockIPC((cmd) => {
      if (cmd === "list_tree") return treeWithAlpha;
      if (cmd === "list_vaults") return [vault];
      throw new Error(`unexpected ${cmd}`);
    });

    render(wrap(<Sidebar vault={vault} />));

    // One trigger per project row.
    expect(
      await screen.findByRole("button", { name: /More actions for Alpha/ }),
    ).toBeInTheDocument();
  });

  it("opening the menu does not navigate to the project", async () => {
    const navigate = vi.fn();
    mockIPC((cmd) => {
      if (cmd === "list_tree") return treeWithAlpha;
      if (cmd === "list_vaults") return [vault];
      throw new Error(`unexpected ${cmd}`);
    });

    render(wrap(<Sidebar vault={vault} />, navigate));
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole("button", { name: /More actions for Alpha/ }),
    );
    // The trigger's stopPropagation prevented the row's navigation button
    // from also firing. The menu itself is opened.
    expect(navigate).not.toHaveBeenCalled();
    expect(await screen.findByText("Rename…")).toBeInTheDocument();
    expect(screen.getByText("Delete…")).toBeInTheDocument();
  });

  it("Rename menu item opens the rename dialog prefilled with the name", async () => {
    mockIPC((cmd) => {
      if (cmd === "list_tree") return treeWithAlpha;
      if (cmd === "list_vaults") return [vault];
      throw new Error(`unexpected ${cmd}`);
    });

    render(wrap(<Sidebar vault={vault} />));
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole("button", { name: /More actions for Alpha/ }),
    );
    await user.click(await screen.findByText("Rename…"));

    const input = await screen.findByLabelText(/Project name/);
    expect(input).toHaveValue("Alpha");
  });

  it("NewProjectDialog disables Create on collision with an existing project", async () => {
    const creates: Array<Record<string, unknown>> = [];
    mockIPC((cmd, args) => {
      if (cmd === "list_tree") return treeWithAlpha;
      if (cmd === "list_vaults") return [vault];
      if (cmd === "create_project") {
        creates.push(args as Record<string, unknown>);
        return "/v/Projects/created";
      }
      throw new Error(`unexpected ${cmd}`);
    });

    render(wrap(<Sidebar vault={vault} />));
    const user = userEvent.setup();

    // Open the create dialog via the "+" button.
    await user.click(
      await screen.findByRole("button", { name: /^New project$/ }),
    );

    const create = await screen.findByRole("button", {
      name: /Create project/,
    });
    // Empty → disabled.
    expect(create).toBeDisabled();

    const input = screen.getByLabelText(/Project name/);
    // Case-insensitive collision → disabled + hint.
    await user.type(input, "alpha");
    expect(create).toBeDisabled();
    expect(
      screen.getByText(/A project named "alpha" already exists/),
    ).toBeInTheDocument();

    // Attempting to submit anyway must not invoke create_project.
    await user.keyboard("{Enter}");
    await new Promise((r) => setTimeout(r, 20));
    expect(creates).toHaveLength(0);

    // Typing a fresh, non-colliding name re-enables the button.
    await user.clear(input);
    await user.type(input, "Gamma");
    expect(create).toBeEnabled();
  });

  it("Delete menu item opens the delete dialog", async () => {
    mockIPC((cmd) => {
      if (cmd === "list_tree") return treeWithAlpha;
      if (cmd === "list_vaults") return [vault];
      throw new Error(`unexpected ${cmd}`);
    });

    render(wrap(<Sidebar vault={vault} />));
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole("button", { name: /More actions for Alpha/ }),
    );
    await user.click(await screen.findByText("Delete…"));

    // Title with project name visible in the dialog.
    expect(
      await screen.findByRole("heading", { name: /Delete Alpha/ }),
    ).toBeInTheDocument();
    // Delete button is disabled until the user types the name.
    expect(
      screen.getByRole("button", { name: /Delete project/ }),
    ).toBeDisabled();
  });
});
