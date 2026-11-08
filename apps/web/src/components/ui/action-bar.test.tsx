import { afterEach, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import { ActionBar, ActionBarGroup } from "./action-bar";

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
