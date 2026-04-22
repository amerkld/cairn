import { describe, it, expect } from "vitest";
import { createRef } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Textarea } from "./Textarea";

describe("Textarea", () => {
  it("renders with placeholder and default rows", () => {
    render(<Textarea placeholder="Body" />);
    const el = screen.getByPlaceholderText("Body");
    expect(el).toBeInTheDocument();
    expect(el).toHaveAttribute("rows", "3");
  });

  it("forwards ref to the underlying <textarea>", () => {
    const ref = createRef<HTMLTextAreaElement>();
    render(<Textarea ref={ref} aria-label="ref-target" />);
    expect(ref.current?.tagName).toBe("TEXTAREA");
  });

  it("applies token-based styling", () => {
    render(<Textarea aria-label="styled" />);
    const el = screen.getByLabelText("styled");
    expect(el.className).toContain("border-border-subtle");
    expect(el.className).toContain("bg-bg-base");
    expect(el.className).toContain("resize-none");
  });

  it("accepts user typing", async () => {
    const user = userEvent.setup();
    render(<Textarea aria-label="compose" />);
    const el = screen.getByLabelText("compose") as HTMLTextAreaElement;
    await user.click(el);
    await user.keyboard("hello there");
    expect(el.value).toBe("hello there");
  });
});
