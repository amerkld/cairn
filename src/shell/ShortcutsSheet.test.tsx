import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ShortcutsSheet } from "./ShortcutsSheet";

describe("ShortcutsSheet", () => {
  it("lists the documented global shortcuts when open", () => {
    render(<ShortcutsSheet open={true} onOpenChange={() => undefined} />);
    expect(screen.getByText("Open command palette")).toBeInTheDocument();
    expect(screen.getByText("New capture")).toBeInTheDocument();
    expect(screen.getByText("Show this shortcuts sheet")).toBeInTheDocument();
  });

  it("groups shortcuts under their section headings", () => {
    render(<ShortcutsSheet open={true} onOpenChange={() => undefined} />);
    expect(screen.getByText("Global")).toBeInTheDocument();
    expect(screen.getByText("Dialogs")).toBeInTheDocument();
    expect(screen.getByText("Lists & palette")).toBeInTheDocument();
  });

  it("is hidden when open is false", () => {
    render(<ShortcutsSheet open={false} onOpenChange={() => undefined} />);
    expect(screen.queryByText("Open command palette")).not.toBeInTheDocument();
  });
});
