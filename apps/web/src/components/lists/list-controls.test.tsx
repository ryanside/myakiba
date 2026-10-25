import { afterEach, expect, test } from "bun:test";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { ListControls } from "./list-controls";

afterEach(cleanup);

const list: ComponentProps<typeof ListControls>["list"] = {
  id: "list-1",
  title: "Figures",
  description: "",
  position: 0,
  images: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function renderControls() {
  render(
    <ListControls
      list={list}
      viewMode="list"
      selected={false}
      active={false}
      onToggleSelection={() => {}}
      onUpdate={async () => {}}
      onDelete={async () => {}}
    >
      {null}
    </ListControls>,
  );
  return userEvent.setup({ delay: null });
}

// A failed expect on an open popup hangs Bun while it prints the React-owned node.
// An open dialog hides the page behind it, so the menu is looked up among hidden nodes too.
const waitForNo = (role: "menu" | "dialog") =>
  waitFor(() => {
    if (screen.queryByRole(role, { hidden: true })) throw new Error(`${role} still open`);
  });

for (const [item, cancel] of [
  ["Edit", "Cancel"],
  ["Delete", "Cancel"],
] as const) {
  test(`choosing ${item} in a List's actions menu closes the menu behind its dialog`, async () => {
    const user = renderControls();
    const trigger = screen.getByRole("button", { name: "Actions for Figures" });

    await user.click(trigger);
    await user.click(await screen.findByRole("menuitem", { name: item }));

    const dialog = await screen.findByRole("dialog");
    await waitForNo("menu");

    await user.click(within(dialog).getByRole("button", { name: cancel }));
    await waitForNo("dialog");
    await waitFor(() => {
      if (document.activeElement !== trigger) throw new Error("focus did not return to the menu");
    });
    expect(document.activeElement).toBe(trigger);
  });
}

test("editing a List again after cancelling starts from its saved title", async () => {
  const user = renderControls();
  const openEdit = async () => {
    await user.click(screen.getByRole("button", { name: "Actions for Figures" }));
    await user.click(await screen.findByRole("menuitem", { name: "Edit" }));
    return screen.findByRole("dialog");
  };

  const dialog = await openEdit();
  await user.type(within(dialog).getByRole("textbox", { name: "Title" }), " draft");
  await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
  await waitForNo("dialog");

  const reopened = await openEdit();
  expect(within(reopened).getByRole("textbox", { name: "Title" })).toHaveProperty(
    "value",
    "Figures",
  );
});
