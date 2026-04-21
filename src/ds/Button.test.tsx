import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button } from "./Button";

describe("Button", () => {
  it("renders with default secondary variant", () => {
    render(<Button>Click</Button>);
    const btn = screen.getByRole("button", { name: "Click" });
    expect(btn).toBeInTheDocument();
    expect(btn.className).toContain("border-border-subtle");
  });

  it("applies primary variant classes", () => {
    render(<Button variant="primary">Go</Button>);
    expect(screen.getByRole("button").className).toContain("bg-accent");
  });

  it("fires onClick", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Fire</Button>);
    await user.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("does not fire when disabled", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Button onClick={onClick} disabled>
        Disabled
      </Button>,
    );
    await user.click(screen.getByRole("button"));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("forwards as child when asChild is set", () => {
    render(
      <Button asChild>
        <a href="/home">Home</a>
      </Button>,
    );
    const link = screen.getByRole("link", { name: "Home" });
    expect(link).toHaveAttribute("href", "/home");
    expect(link.className).toContain("rounded");
  });
});
