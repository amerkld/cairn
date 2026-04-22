import { describe, it, expect } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { mockIPC } from "@tauri-apps/api/mocks";
import type { ReactNode } from "react";
import { QuickCapturePage } from "./QuickCapturePage";

type IpcCall = { cmd: string; args: Record<string, unknown> };

function wrap(children: ReactNode) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const vault = {
  path: "/v",
  name: "Brain",
  lastOpenedAt: "2026-04-21T00:00:00Z",
};

const treeWithProjects = {
  captures: [],
  someday: [],
  trash: [],
  projects: [
    {
      name: "Alpha",
      path: "/v/Projects/Alpha",
      actions: [],
      subdirectories: ["Research"],
    },
  ],
};

function renderQuickCapture(handler: (call: IpcCall) => unknown) {
  const calls: IpcCall[] = [];
  mockIPC((cmd, args) => {
    // Swallow tauri's event-plugin calls — we don't exercise the listen
    // path directly, and leaving these unhandled pollutes tests with
    // unhandled rejections.
    if (cmd === "plugin:event|listen" || cmd === "plugin:event|unlisten") {
      return 1;
    }
    const call: IpcCall = { cmd, args: args as Record<string, unknown> };
    calls.push(call);
    return handler(call);
  });
  render(wrap(<QuickCapturePage />));
  return calls;
}

describe("QuickCapturePage", () => {
  it("renders the dialog with title, body, and destination picker when a vault is active", async () => {
    renderQuickCapture(({ cmd }) => {
      if (cmd === "get_active_vault") return vault;
      if (cmd === "list_tree") return treeWithProjects;
      throw new Error(`unexpected: ${cmd}`);
    });

    expect(await screen.findByLabelText("Capture title")).toBeInTheDocument();
    expect(screen.getByLabelText("Capture body")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Save/ })).toBeDisabled();
  });

  it("submits a Captures note with title + body and hides the window", async () => {
    const calls = renderQuickCapture(({ cmd }) => {
      if (cmd === "get_active_vault") return vault;
      if (cmd === "list_tree") return treeWithProjects;
      if (cmd === "create_capture") {
        return {
          path: "/v/Captures/abc.md",
          title: "T",
          preview: "",
          createdAt: null,
          tags: [],
        };
      }
      if (cmd === "hide_quick_capture") return null;
      throw new Error(`unexpected: ${cmd}`);
    });

    const user = userEvent.setup();
    const titleInput = await screen.findByLabelText("Capture title");
    await user.type(titleInput, "Follow up");
    await user.click(screen.getByRole("button", { name: /Save/ }));

    await waitFor(() => {
      const create = calls.find((c) => c.cmd === "create_capture");
      expect(create).toBeDefined();
      expect(create?.args).toMatchObject({ title: "Follow up" });
    });
    await waitFor(() =>
      expect(calls.some((c) => c.cmd === "hide_quick_capture")).toBe(true),
    );
  });

  it("Enter in title submits the capture", async () => {
    const calls = renderQuickCapture(({ cmd }) => {
      if (cmd === "get_active_vault") return vault;
      if (cmd === "list_tree") return treeWithProjects;
      if (cmd === "create_capture") {
        return {
          path: "/v/Captures/x.md",
          title: "",
          preview: "",
          createdAt: null,
          tags: [],
        };
      }
      if (cmd === "hide_quick_capture") return null;
      throw new Error(`unexpected: ${cmd}`);
    });

    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Capture title"), "Call Lena");
    await user.keyboard("{Enter}");

    await waitFor(() =>
      expect(calls.some((c) => c.cmd === "create_capture")).toBe(true),
    );
  });

  it("routes submission to create_action when the destination is a project's Actions", async () => {
    const calls = renderQuickCapture(({ cmd }) => {
      if (cmd === "get_active_vault") return vault;
      if (cmd === "list_tree") return treeWithProjects;
      if (cmd === "create_action") {
        return {
          path: "/v/Projects/Alpha/Actions/x.md",
          title: "",
          preview: "",
          createdAt: null,
          tags: [],
        };
      }
      if (cmd === "hide_quick_capture") return null;
      throw new Error(`unexpected: ${cmd}`);
    });

    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Capture title"), "Ship it");

    // Open destination picker and pick "Alpha · Actions" (first project row).
    await user.click(screen.getByRole("button", { expanded: false }));
    await user.keyboard("{ArrowDown}{Enter}");

    await user.click(screen.getByRole("button", { name: /Save/ }));

    await waitFor(() => {
      const action = calls.find((c) => c.cmd === "create_action");
      expect(action).toBeDefined();
      expect(action?.args).toMatchObject({
        projectPath: "/v/Projects/Alpha",
        title: "Ship it",
      });
    });
  });

  it("routes submission to create_capture + move_note for a project subdirectory", async () => {
    const calls = renderQuickCapture(({ cmd }) => {
      if (cmd === "get_active_vault") return vault;
      if (cmd === "list_tree") return treeWithProjects;
      if (cmd === "create_capture") {
        return {
          path: "/v/Captures/abc.md",
          title: "",
          preview: "",
          createdAt: null,
          tags: [],
        };
      }
      if (cmd === "move_note") return "/v/Projects/Alpha/Research/abc.md";
      if (cmd === "hide_quick_capture") return null;
      throw new Error(`unexpected: ${cmd}`);
    });

    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Capture title"), "Thought");

    // Open picker, navigate to "Alpha · Research" (third row).
    await user.click(screen.getByRole("button", { expanded: false }));
    await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");

    await user.click(screen.getByRole("button", { name: /Save/ }));

    await waitFor(() => {
      expect(calls.some((c) => c.cmd === "create_capture")).toBe(true);
      const move = calls.find((c) => c.cmd === "move_note");
      expect(move).toBeDefined();
      expect(move?.args).toMatchObject({
        src: "/v/Captures/abc.md",
        target: "Projects/Alpha/Research",
      });
    });
  });

  it("Save is disabled when title and body are both empty", async () => {
    renderQuickCapture(({ cmd }) => {
      if (cmd === "get_active_vault") return vault;
      if (cmd === "list_tree") return treeWithProjects;
      throw new Error(`unexpected: ${cmd}`);
    });

    const save = await screen.findByRole("button", { name: /Save/ });
    expect(save).toBeDisabled();
  });

  it("Escape dismisses the window via hide_quick_capture", async () => {
    const calls = renderQuickCapture(({ cmd }) => {
      if (cmd === "get_active_vault") return vault;
      if (cmd === "list_tree") return treeWithProjects;
      if (cmd === "hide_quick_capture") return null;
      throw new Error(`unexpected: ${cmd}`);
    });

    await screen.findByLabelText("Capture title");
    await userEvent.setup().keyboard("{Escape}");

    await waitFor(() =>
      expect(calls.some((c) => c.cmd === "hide_quick_capture")).toBe(true),
    );
  });

  it("shows the no-vault empty state when no vault is active", async () => {
    renderQuickCapture(({ cmd }) => {
      if (cmd === "get_active_vault") return null;
      throw new Error(`unexpected: ${cmd}`);
    });

    expect(await screen.findByText("No vault is open.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Go to Cairn" })).toBeInTheDocument();
  });

  it("Cmd+Enter in the body submits the capture", async () => {
    const calls = renderQuickCapture(({ cmd }) => {
      if (cmd === "get_active_vault") return vault;
      if (cmd === "list_tree") return treeWithProjects;
      if (cmd === "create_capture") {
        return {
          path: "/v/Captures/x.md",
          title: "",
          preview: "",
          createdAt: null,
          tags: [],
        };
      }
      if (cmd === "hide_quick_capture") return null;
      throw new Error(`unexpected: ${cmd}`);
    });

    const user = userEvent.setup();
    const bodyField = (await screen.findByLabelText("Capture body")) as HTMLTextAreaElement;
    await user.click(bodyField);
    await user.type(bodyField, "multi line thought");
    await user.keyboard("{Control>}{Enter}{/Control}");

    await waitFor(() =>
      expect(calls.some((c) => c.cmd === "create_capture")).toBe(true),
    );
  });

  it("surfaces backend errors as an alert", async () => {
    renderQuickCapture(({ cmd }) => {
      if (cmd === "get_active_vault") return vault;
      if (cmd === "list_tree") return treeWithProjects;
      if (cmd === "create_capture") throw new Error("disk full");
      throw new Error(`unexpected: ${cmd}`);
    });

    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Capture title"), "x");
    await user.click(screen.getByRole("button", { name: /Save/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent("disk full");
  });

  it("includes the body in create_capture when the user fills it in", async () => {
    const calls = renderQuickCapture(({ cmd }) => {
      if (cmd === "get_active_vault") return vault;
      if (cmd === "list_tree") return treeWithProjects;
      if (cmd === "create_capture") {
        return {
          path: "/v/Captures/x.md",
          title: "",
          preview: "",
          createdAt: null,
          tags: [],
        };
      }
      if (cmd === "hide_quick_capture") return null;
      throw new Error(`unexpected: ${cmd}`);
    });

    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Capture title"), "Title");
    await user.type(screen.getByLabelText("Capture body"), "some body text");
    await user.click(screen.getByRole("button", { name: /Save/ }));

    await waitFor(() => {
      const create = calls.find((c) => c.cmd === "create_capture");
      expect(create?.args).toMatchObject({
        title: "Title",
        body: "some body text",
      });
    });
  });
});
