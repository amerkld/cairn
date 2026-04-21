import { describe, it, expect } from "vitest";
import { render, waitFor, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { mockIPC } from "@tauri-apps/api/mocks";
import { useState, type ReactNode } from "react";
import { GlobalShortcuts } from "./GlobalShortcuts";
import { RouteContext, type RouteState } from "./routing";

function wrap(children: ReactNode, { initial }: { initial?: RouteState } = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  function Harness() {
    const [state, setState] = useState<RouteState>(initial ?? { page: "home" });
    return (
      <QueryClientProvider client={client}>
        <RouteContext.Provider value={{ state, navigate: setState }}>
          <span data-testid="page">{state.page}</span>
          {children}
        </RouteContext.Provider>
      </QueryClientProvider>
    );
  }
  return <Harness />;
}

describe("GlobalShortcuts", () => {
  it("Ctrl+N creates a capture and navigates to Captures", async () => {
    const creates: number[] = [];
    mockIPC((cmd) => {
      if (cmd === "create_capture") {
        creates.push(1);
        return {
          path: "/v/Captures/x.md",
          title: "New",
          preview: "",
          createdAt: "2026-04-21T00:00:00Z",
          tags: [],
          remindAt: null,
          deadline: null,
        };
      }
      if (cmd === "list_tree") {
        return { captures: [], someday: [], projects: [], trash: [] };
      }
      throw new Error(`unexpected: ${cmd}`);
    });

    render(wrap(<GlobalShortcuts />));

    await userEvent.setup().keyboard("{Control>}n{/Control}");

    await waitFor(() => expect(creates).toHaveLength(1));
    expect(screen.getByTestId("page").textContent).toBe("captures");
  });

  it("Ctrl+N does not fire when the user is typing in an input", async () => {
    const creates: number[] = [];
    mockIPC((cmd) => {
      if (cmd === "create_capture") {
        creates.push(1);
        return { path: "", title: "", preview: "", createdAt: null, tags: [] };
      }
      if (cmd === "list_tree") {
        return { captures: [], someday: [], projects: [], trash: [] };
      }
      throw new Error(`unexpected: ${cmd}`);
    });

    render(
      wrap(
        <>
          <GlobalShortcuts />
          <input aria-label="search" />
        </>,
      ),
    );

    const user = userEvent.setup();
    const input = screen.getByLabelText("search");
    await user.click(input);
    await user.keyboard("{Control>}n{/Control}");

    expect(creates).toHaveLength(0);
  });

  it("unrelated modifier combinations are ignored", async () => {
    const creates: number[] = [];
    mockIPC((cmd) => {
      if (cmd === "create_capture") {
        creates.push(1);
        return { path: "", title: "", preview: "", createdAt: null, tags: [] };
      }
      if (cmd === "list_tree") {
        return { captures: [], someday: [], projects: [], trash: [] };
      }
      throw new Error(`unexpected: ${cmd}`);
    });

    render(wrap(<GlobalShortcuts />));

    await userEvent.setup().keyboard("{Control>}j{/Control}"); // not bound
    await userEvent.setup().keyboard("n"); // no modifier

    expect(creates).toHaveLength(0);
  });

  it("'?' opens the keyboard shortcuts sheet", async () => {
    mockIPC((cmd) => {
      if (cmd === "list_tree") {
        return { captures: [], someday: [], projects: [], trash: [] };
      }
      throw new Error(`unexpected: ${cmd}`);
    });

    render(wrap(<GlobalShortcuts />));
    await userEvent.setup().keyboard("?");
    expect(await screen.findByText("Open command palette")).toBeInTheDocument();
  });
});
