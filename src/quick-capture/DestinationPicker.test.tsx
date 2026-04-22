import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  DestinationPicker,
  CAPTURES_DESTINATION,
  destinationLabel,
} from "./DestinationPicker";
import type { Project } from "@/lib/invoke";

const projects: Project[] = [
  {
    name: "Alpha",
    path: "/v/Projects/Alpha",
    actions: [],
    subdirectories: ["Research", "Archive"],
  },
  {
    name: "Beta",
    path: "/v/Projects/Beta",
    actions: [],
    subdirectories: [],
  },
];

describe("destinationLabel", () => {
  it("labels captures, actions, and subdirectories distinctly", () => {
    expect(destinationLabel(CAPTURES_DESTINATION)).toBe("Captures");
    expect(
      destinationLabel({
        kind: "action",
        projectPath: "/v/Projects/Alpha",
        projectName: "Alpha",
      }),
    ).toBe("Alpha · Actions");
    expect(
      destinationLabel({
        kind: "subdirectory",
        projectPath: "/v/Projects/Alpha",
        projectName: "Alpha",
        subdir: "Research",
      }),
    ).toBe("Alpha · Research");
  });
});

describe("DestinationPicker", () => {
  it("shows the current destination label on the trigger", () => {
    render(
      <DestinationPicker
        value={CAPTURES_DESTINATION}
        onChange={() => undefined}
        projects={projects}
      />,
    );
    expect(
      screen.getByRole("button", { expanded: false }).textContent,
    ).toContain("Captures");
  });

  it("opens the panel on click and shows all destinations", async () => {
    render(
      <DestinationPicker
        value={CAPTURES_DESTINATION}
        onChange={() => undefined}
        projects={projects}
      />,
    );
    await userEvent.setup().click(screen.getByRole("button", { expanded: false }));
    // Captures + Alpha:Actions + Alpha:Research + Alpha:Archive + Beta:Actions = 5
    expect(screen.getAllByRole("option")).toHaveLength(5);
  });

  it("filters by project name", async () => {
    render(
      <DestinationPicker
        value={CAPTURES_DESTINATION}
        onChange={() => undefined}
        projects={projects}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { expanded: false }));
    await user.type(screen.getByLabelText("Filter destinations"), "beta");
    expect(screen.getAllByRole("option")).toHaveLength(1);
    expect(screen.getByRole("option").textContent).toContain("Beta");
  });

  it("Enter picks the highlighted destination", async () => {
    const onChange = vi.fn();
    render(
      <DestinationPicker
        value={CAPTURES_DESTINATION}
        onChange={onChange}
        projects={projects}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { expanded: false }));
    // Default cursor is index 0 (Captures). Arrow down to Alpha · Actions.
    await user.keyboard("{ArrowDown}{Enter}");
    expect(onChange).toHaveBeenCalledWith({
      kind: "action",
      projectPath: "/v/Projects/Alpha",
      projectName: "Alpha",
    });
  });

  it("ArrowDown wraps around at the end of the list", async () => {
    const onChange = vi.fn();
    render(
      <DestinationPicker
        value={CAPTURES_DESTINATION}
        onChange={onChange}
        projects={projects}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { expanded: false }));
    // 5 rows; 5 down arrows should wrap back to row 0 (Captures).
    await user.keyboard("{ArrowDown>5/}{Enter}");
    expect(onChange).toHaveBeenCalledWith(CAPTURES_DESTINATION);
  });

  it("Escape closes the panel without choosing", async () => {
    const onChange = vi.fn();
    render(
      <DestinationPicker
        value={CAPTURES_DESTINATION}
        onChange={onChange}
        projects={projects}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { expanded: false }));
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });
});
