import { describe, it, expect } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { mockIPC } from "@tauri-apps/api/mocks";
import type { ReactNode } from "react";
import { TagManagerDialog } from "./TagManagerDialog";

function wrap(children: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("TagManagerDialog", () => {
  it("shows an empty state when there are no tags", async () => {
    mockIPC((cmd) => {
      if (cmd === "list_tags") return [];
      throw new Error(`unexpected ${cmd}`);
    });
    render(wrap(<TagManagerDialog open={true} onOpenChange={() => undefined} />));
    expect(await screen.findByText("No tags yet")).toBeInTheDocument();
  });

  it("lists tags with usage counts", async () => {
    mockIPC((cmd) => {
      if (cmd === "list_tags") {
        return [
          { label: "work", color: "#fac775", count: 4, declared: true },
          { label: "ideas", color: null, count: 2, declared: false },
        ];
      }
      throw new Error(`unexpected ${cmd}`);
    });
    render(wrap(<TagManagerDialog open={true} onOpenChange={() => undefined} />));

    expect(await screen.findByText("work")).toBeInTheDocument();
    expect(screen.getByText("ideas")).toBeInTheDocument();
    expect(screen.getByText(/4 notes/)).toBeInTheDocument();
    expect(screen.getByText(/ad-hoc/)).toBeInTheDocument();
  });

  it("renames a tag and surfaces the rewrite count", async () => {
    const calls: Array<Record<string, unknown>> = [];
    mockIPC((cmd, args) => {
      if (cmd === "list_tags") {
        return [{ label: "draft", color: null, count: 3, declared: true }];
      }
      if (cmd === "rename_tag") {
        calls.push(args as Record<string, unknown>);
        return 3;
      }
      throw new Error(`unexpected ${cmd}`);
    });
    render(wrap(<TagManagerDialog open={true} onOpenChange={() => undefined} />));
    const user = userEvent.setup();

    await screen.findByText("draft");
    await user.click(screen.getByRole("button", { name: /Rename draft/ }));
    const input = await screen.findByLabelText("Rename tag draft");
    await user.clear(input);
    await user.type(input, "wip");
    await user.click(screen.getByRole("button", { name: "Rename" }));

    await waitFor(() =>
      expect(calls).toEqual([{ old: "draft", new: "wip" }]),
    );
  });

  it("deletes a tag with a confirm step", async () => {
    const calls: string[] = [];
    mockIPC((cmd, args) => {
      if (cmd === "list_tags") {
        return [{ label: "gone", color: null, count: 2, declared: true }];
      }
      if (cmd === "delete_tag") {
        const typed = args as { label: string };
        calls.push(typed.label);
        return 2;
      }
      throw new Error(`unexpected ${cmd}`);
    });
    render(wrap(<TagManagerDialog open={true} onOpenChange={() => undefined} />));
    const user = userEvent.setup();

    await screen.findByText("gone");
    await user.click(screen.getByRole("button", { name: /Delete gone/ }));
    // Confirm step shows the actual "Delete" action button.
    await user.click(await screen.findByRole("button", { name: /^Delete$/ }));

    await waitFor(() => expect(calls).toEqual(["gone"]));
  });

  it("sets a color from the palette", async () => {
    const calls: Array<Record<string, unknown>> = [];
    mockIPC((cmd, args) => {
      if (cmd === "list_tags") {
        return [{ label: "urgent", color: null, count: 1, declared: false }];
      }
      if (cmd === "set_tag_color") {
        calls.push(args as Record<string, unknown>);
        return null;
      }
      throw new Error(`unexpected ${cmd}`);
    });
    render(wrap(<TagManagerDialog open={true} onOpenChange={() => undefined} />));
    const user = userEvent.setup();

    await screen.findByText("urgent");
    await user.click(screen.getByRole("button", { name: /Set color/ }));
    await user.click(await screen.findByRole("menuitem", { name: /Rose/ }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toEqual({ label: "urgent", color: "#d88c9a" });
  });
});
