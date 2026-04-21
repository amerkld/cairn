import { describe, it, expect } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { mockIPC } from "@tauri-apps/api/mocks";
import { useState, type ReactNode } from "react";
import { TagFilter } from "./TagFilter";
import type { TagInfo } from "@/lib/invoke";

function wrap(children: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function Harness({ initial = null }: { initial?: string | null }) {
  const [selected, setSelected] = useState<string | null>(initial);
  return (
    <div>
      <TagFilter selected={selected} onSelect={setSelected} />
      <span data-testid="selected">{selected ?? ""}</span>
    </div>
  );
}

const tag = (overrides: Partial<TagInfo> = {}): TagInfo => ({
  label: "work",
  color: null,
  count: 3,
  declared: true,
  ...overrides,
});

describe("TagFilter", () => {
  it("hides the chip list but keeps Manage visible when no tags have usage", async () => {
    mockIPC((cmd) => {
      if (cmd === "list_tags") return [];
      throw new Error(`unexpected ${cmd}`);
    });
    render(wrap(<Harness />));
    expect(await screen.findByText("No tags yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Manage tags/ })).toBeInTheDocument();
  });

  it("shows chips for tags with usage > 0 and hides zero-usage ones by default", async () => {
    mockIPC((cmd) => {
      if (cmd === "list_tags") {
        return [
          tag({ label: "work", count: 4 }),
          tag({ label: "ideas", count: 2, declared: false }),
          tag({ label: "dormant", count: 0 }),
        ];
      }
      throw new Error(`unexpected ${cmd}`);
    });
    render(wrap(<Harness />));
    expect(await screen.findByRole("button", { name: /work/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ideas/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /dormant/ })).not.toBeInTheDocument();
  });

  it("clicking a chip selects it; clicking again clears", async () => {
    mockIPC((cmd) => {
      if (cmd === "list_tags") return [tag({ label: "work", count: 2 })];
      throw new Error(`unexpected ${cmd}`);
    });
    render(wrap(<Harness />));
    const user = userEvent.setup();
    const chip = await screen.findByRole("button", { name: /work/ });

    await user.click(chip);
    expect(screen.getByTestId("selected").textContent).toBe("work");
    // aria-pressed reflects selection.
    expect(chip).toHaveAttribute("aria-pressed", "true");

    await user.click(chip);
    expect(screen.getByTestId("selected").textContent).toBe("");
    expect(chip).toHaveAttribute("aria-pressed", "false");
  });

  it("'Clear' text button appears when a tag is selected", async () => {
    mockIPC((cmd) => {
      if (cmd === "list_tags") return [tag({ label: "work", count: 2 })];
      throw new Error(`unexpected ${cmd}`);
    });
    render(wrap(<Harness initial="work" />));
    const user = userEvent.setup();
    const clear = await screen.findByRole("button", { name: /^Clear$/ });
    await user.click(clear);
    await waitFor(() => expect(screen.getByTestId("selected").textContent).toBe(""));
  });
});
