import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { mockIPC } from "@tauri-apps/api/mocks";
import type { ReactNode } from "react";
import { EditorPage } from "./EditorPage";
import { RouteContext, type RouteState } from "@/shell/routing";

// CodeMirror 6 relies on browser layout measurement that jsdom doesn't
// fully provide; stub the Editor component with a plain textarea that
// surfaces the same `onChange` / `onBlur` / `onImagePaste` hooks. What we
// actually want to test here is the page's behavior around the editor,
// not CM6 itself.
// Expose the paste handler so tests can trigger it without going through
// jsdom's flaky clipboard/event synthesis.
declare global {
  interface Window {
    __testPasteImage?: (file: File) => Promise<string | null | undefined>;
  }
}

vi.mock("@/editor/Editor", () => ({
  Editor: (props: {
    initialBody: string;
    resetKey: string;
    onChange: (v: string) => void;
    onBlur?: () => void;
    onImagePaste?: (f: File) => Promise<string | null>;
  }) => {
    // Register paste hook for test access. Re-registered on every render so
    // the latest `onImagePaste` closure is used.
    if (typeof window !== "undefined") {
      window.__testPasteImage = (f) => props.onImagePaste?.(f) ?? Promise.resolve(null);
    }
    return (
      <textarea
        data-testid="mock-editor"
        // Controlled via `value` so programmatic updates to `initialBody` are
        // visible after the note resolves.
        value={props.initialBody}
        onChange={(e) => props.onChange(e.target.value)}
        onBlur={() => props.onBlur?.()}
        data-reset-key={props.resetKey}
      />
    );
  },
}));

function wrap(children: ReactNode, navigate = vi.fn()) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  const state: RouteState = {
    page: "editor",
    notePath: "/v/a.md",
    returnTo: { page: "captures" },
  };
  return (
    <QueryClientProvider client={client}>
      <RouteContext.Provider value={{ state, navigate }}>{children}</RouteContext.Provider>
    </QueryClientProvider>
  );
}

describe("EditorPage", () => {
  it("loads a note and renders its body + title", async () => {
    mockIPC((cmd) => {
      if (cmd === "read_note") {
        return {
          frontmatter: { title: "Hello", tags: [] },
          body: "This is a body.\n",
        };
      }
      throw new Error(`unexpected ${cmd}`);
    });

    render(wrap(<EditorPage notePath="/v/a.md" returnTo={{ page: "captures" }} />));

    const editor = await screen.findByTestId("mock-editor");
    await waitFor(() => expect(editor).toHaveValue("This is a body.\n"));
    expect(screen.getByDisplayValue("Hello")).toBeInTheDocument();
  });

  it("saves to disk when the editor blurs", async () => {
    const writes: Array<Record<string, unknown>> = [];
    mockIPC((cmd, args) => {
      if (cmd === "read_note") {
        return { frontmatter: { title: "", tags: [] }, body: "" };
      }
      if (cmd === "write_note") {
        writes.push((args as Record<string, unknown>) ?? {});
        return null;
      }
      throw new Error(`unexpected ${cmd}`);
    });

    render(wrap(<EditorPage notePath="/v/a.md" returnTo={{ page: "captures" }} />));
    const editor = await screen.findByTestId("mock-editor");
    // Type body, then blur to trigger flushSave.
    fireEvent.change(editor, { target: { value: "Hi" } });
    fireEvent.blur(editor);

    await waitFor(() => expect(writes.length).toBeGreaterThan(0));
    const last = writes.at(-1) as { path: string; note: { body: string } };
    expect(last.path).toBe("/v/a.md");
    expect(last.note.body).toBe("Hi");
  });

  it("autosaves after the debounce window when the body changes", async () => {
    const writes: Array<Record<string, unknown>> = [];
    mockIPC((cmd, args) => {
      if (cmd === "read_note") {
        return { frontmatter: { title: "", tags: [] }, body: "" };
      }
      if (cmd === "write_note") {
        writes.push((args as Record<string, unknown>) ?? {});
        return null;
      }
      throw new Error(`unexpected ${cmd}`);
    });

    render(wrap(<EditorPage notePath="/v/a.md" returnTo={{ page: "captures" }} />));
    const editor = await screen.findByTestId("mock-editor");
    fireEvent.change(editor, { target: { value: "Hi" } });

    // Real-time debounce of 1500ms; allow a little headroom.
    await waitFor(() => expect(writes.length).toBeGreaterThan(0), { timeout: 3000 });
  });

  it("flushes a pending save when the user clicks Back", async () => {
    const writes: Array<Record<string, unknown>> = [];
    const navigate = vi.fn();
    mockIPC((cmd, args) => {
      if (cmd === "read_note") {
        return { frontmatter: { title: "", tags: [] }, body: "" };
      }
      if (cmd === "write_note") {
        writes.push((args as Record<string, unknown>) ?? {});
        return null;
      }
      throw new Error(`unexpected ${cmd}`);
    });

    render(wrap(<EditorPage notePath="/v/a.md" returnTo={{ page: "captures" }} />, navigate));
    const editor = await screen.findByTestId("mock-editor");
    fireEvent.change(editor, { target: { value: "X" } });

    // Click Back before the debounce has elapsed — save should still fire.
    await userEvent.setup().click(screen.getByRole("button", { name: /Back/ }));

    await waitFor(() => expect(writes.length).toBeGreaterThan(0));
    expect(navigate).toHaveBeenCalledWith({ page: "captures" });
  });

  it("returns to the originating project when Back is clicked on a project-opened note", async () => {
    const navigate = vi.fn();
    mockIPC((cmd) => {
      if (cmd === "read_note") {
        return { frontmatter: { title: "", tags: [] }, body: "" };
      }
      if (cmd === "write_note") return null;
      throw new Error(`unexpected ${cmd}`);
    });

    render(
      wrap(
        <EditorPage
          notePath="/v/Proj/a.md"
          returnTo={{ page: "project", projectPath: "/v/Proj" }}
        />,
        navigate,
      ),
    );
    await screen.findByTestId("mock-editor");

    await userEvent.setup().click(screen.getByRole("button", { name: /Back/ }));

    expect(navigate).toHaveBeenCalledWith({
      page: "project",
      projectPath: "/v/Proj",
    });
  });

  it("image paste calls paste_image with the file's extension", async () => {
    const pastes: Array<Record<string, unknown>> = [];
    mockIPC((cmd, args) => {
      if (cmd === "read_note") {
        return { frontmatter: {}, body: "" };
      }
      if (cmd === "paste_image") {
        pastes.push(args as Record<string, unknown>);
        return "assets/abc.png";
      }
      if (cmd === "write_note") return null;
      throw new Error(`unexpected ${cmd}`);
    });

    render(wrap(<EditorPage notePath="/v/a.md" returnTo={{ page: "captures" }} />));
    await screen.findByTestId("mock-editor");

    const file = new File([new Uint8Array([1, 2, 3])], "img.png", { type: "image/png" });
    // Trigger via the test hook the mock registers, so we bypass jsdom's
    // clipboard-event synthesis (which doesn't preserve `clipboardData.items`
    // through React's synthetic events reliably).
    await window.__testPasteImage?.(file);

    await waitFor(() => expect(pastes).toHaveLength(1));
    const args = pastes[0] as { notePath: string; ext: string };
    expect(args.notePath).toBe("/v/a.md");
    expect(args.ext).toBe("png");
  });

  it("shows an error state when read_note fails", async () => {
    mockIPC((cmd) => {
      if (cmd === "read_note") {
        throw new Error("couldn't open");
      }
      throw new Error(`unexpected ${cmd}`);
    });

    render(wrap(<EditorPage notePath="/v/a.md" returnTo={{ page: "captures" }} />));

    expect(await screen.findByText("Couldn't open this note")).toBeInTheDocument();
  });
});
