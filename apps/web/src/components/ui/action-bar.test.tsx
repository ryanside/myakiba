import { afterEach, expect, test } from "bun:test";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { ActionBar, ActionBarGroup, ActionBarItem } from "./action-bar";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

afterEach(cleanup);

test("a bar wider than half a phone's screen stays on the screen", () => {
  render(<ActionBar open>Three actions</ActionBar>);
  const classes = screen.getByRole("toolbar").className.split(/\s+/u);
  // A fixed box starting at 50% is only given the other half of the screen, unless it takes its own
  // width. Then only the cap keeps it on screen, and it wraps what no longer fits.
  expect(classes).toContain("w-max");
  expect(classes).toContain("max-w-[calc(100vw-1.5rem)]");
  expect(classes).toContain("flex-wrap");
});

test("a group of actions wraps inside the bar, so its last one stays on a phone's screen", () => {
  render(
    <ActionBar open>
      <ActionBarGroup data-testid="group">Three actions</ActionBarGroup>
    </ActionBar>,
  );
  const classes = screen.getByTestId("group").className.split(/\s+/u);
  expect(classes).toContain("flex-wrap");
  expect(classes).toContain("max-w-full");
});

function BarWithPopup() {
  const [open, setOpen] = useState(true);
  return (
    <ActionBar open={open} onOpenChange={setOpen}>
      <ActionBarGroup>
        <Popover>
          <PopoverTrigger
            render={
              <ActionBarItem onSelect={(event) => event.preventDefault()}>Fill</ActionBarItem>
            }
          />
          <PopoverContent aria-label="Fill all">One value for every row</PopoverContent>
        </Popover>
      </ActionBarGroup>
    </ActionBar>
  );
}

test("Escape closes the bar when none of its items has a popup open", async () => {
  render(<BarWithPopup />);
  await userEvent.setup().keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("toolbar")).toBeNull());
});

test("Escape closes an item's open popup before the bar, even with focus outside the popup", async () => {
  render(<BarWithPopup />);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Fill" }));
  await screen.findByRole("dialog", { name: "Fill all" });
  act(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });

  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "Fill all" })).toBeNull());
  expect(screen.getByRole("toolbar")).toBeDefined();

  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("toolbar")).toBeNull());
});
