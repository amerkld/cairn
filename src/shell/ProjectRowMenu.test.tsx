import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProjectRowMenu } from "./ProjectRowMenu";

describe("ProjectRowMenu", () => {
  it("opens the menu and dispatches Rename", async () => {
    const onRename = vi.fn();
    const onDelete = vi.fn();
    render(
      <ProjectRowMenu
        projectName="Alpha"
        onRename={onRename}
        onDelete={onDelete}
      />,
    );
    const user = userEvent.setup();

    await user.click(
      screen.getByRole("button", { name: /More actions for Alpha/ }),
    );
    await user.click(await screen.findByText("Rename…"));

    expect(onRename).toHaveBeenCalledTimes(1);
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("opens the menu and dispatches Delete", async () => {
    const onRename = vi.fn();
    const onDelete = vi.fn();
    render(
      <ProjectRowMenu
        projectName="Alpha"
        onRename={onRename}
        onDelete={onDelete}
      />,
    );
    const user = userEvent.setup();

    await user.click(
      screen.getByRole("button", { name: /More actions for Alpha/ }),
    );
    await user.click(await screen.findByText("Delete…"));

    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onRename).not.toHaveBeenCalled();
  });

  it("with stopPropagation, trigger clicks do not bubble to the parent", async () => {
    const parentClick = vi.fn();
    render(
      // Parent wraps the menu — a click on the trigger must not reach the
      // parent, otherwise the sidebar row's navigation handler would fire
      // at the same time as opening the menu.
      <div onClick={parentClick}>
        <ProjectRowMenu
          projectName="Alpha"
          onRename={vi.fn()}
          onDelete={vi.fn()}
          stopPropagation
        />
      </div>,
    );
    const user = userEvent.setup();

    await user.click(
      screen.getByRole("button", { name: /More actions for Alpha/ }),
    );

    expect(parentClick).not.toHaveBeenCalled();
  });
});
