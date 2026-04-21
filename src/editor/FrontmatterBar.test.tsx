import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FrontmatterBar } from "./FrontmatterBar";
import type { Frontmatter } from "@/lib/invoke";

describe("FrontmatterBar", () => {
  it("renders title placeholder when none is set", () => {
    render(
      <FrontmatterBar
        frontmatter={{}}
        onChange={() => undefined}
        showDeadline={false}
      />,
    );
    expect(screen.getByPlaceholderText("Untitled")).toBeInTheDocument();
  });

  it("editing the title emits an updated frontmatter object", async () => {
    const onChange = vi.fn<(fm: Frontmatter) => void>();
    render(
      <FrontmatterBar
        frontmatter={{ title: "" }}
        onChange={onChange}
        showDeadline={false}
      />,
    );

    const input = screen.getByLabelText("Note title");
    await userEvent.setup().type(input, "H");

    expect(onChange).toHaveBeenCalled();
    const last = onChange.mock.calls.at(-1)?.[0];
    expect(last?.title).toBe("H");
  });

  it("adding a tag via Enter commits and clears the draft", async () => {
    const onChange = vi.fn<(fm: Frontmatter) => void>();
    render(
      <FrontmatterBar
        frontmatter={{ tags: [] }}
        onChange={onChange}
        showDeadline={false}
      />,
    );

    const input = screen.getByLabelText("Add tag");
    await userEvent.setup().type(input, "work{Enter}");

    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ tags: ["work"] }),
    );
  });

  it("strips a leading # from tag input", async () => {
    const onChange = vi.fn<(fm: Frontmatter) => void>();
    render(
      <FrontmatterBar
        frontmatter={{ tags: [] }}
        onChange={onChange}
        showDeadline={false}
      />,
    );

    await userEvent.setup().type(screen.getByLabelText("Add tag"), "#urgent{Enter}");
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ tags: ["urgent"] }),
    );
  });

  it("ignores duplicate tags", async () => {
    const onChange = vi.fn<(fm: Frontmatter) => void>();
    render(
      <FrontmatterBar
        frontmatter={{ tags: ["work"] }}
        onChange={onChange}
        showDeadline={false}
      />,
    );

    await userEvent.setup().type(screen.getByLabelText("Add tag"), "work{Enter}");
    expect(onChange).not.toHaveBeenCalledWith(
      expect.objectContaining({ tags: ["work", "work"] }),
    );
  });

  it("removing a tag emits the updated list", async () => {
    const onChange = vi.fn<(fm: Frontmatter) => void>();
    render(
      <FrontmatterBar
        frontmatter={{ tags: ["work", "urgent"] }}
        onChange={onChange}
        showDeadline={false}
      />,
    );

    await userEvent.setup().click(screen.getByRole("button", { name: /Remove tag work/ }));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ tags: ["urgent"] }),
    );
  });

  it("shows deadline field only when showDeadline is true", () => {
    const { rerender } = render(
      <FrontmatterBar
        frontmatter={{}}
        onChange={() => undefined}
        showDeadline={false}
      />,
    );
    expect(screen.queryByLabelText("Deadline")).not.toBeInTheDocument();

    rerender(
      <FrontmatterBar
        frontmatter={{}}
        onChange={() => undefined}
        showDeadline={true}
      />,
    );
    expect(screen.getByLabelText("Deadline")).toBeInTheDocument();
  });
});
