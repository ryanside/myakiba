import { afterEach, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { JustAddedChip } from "./just-added-chip";

afterEach(cleanup);

test("it counts what was added and Show all clears the filter", async () => {
  let cleared = 0;
  render(
    <JustAddedChip
      count={4}
      onShowAll={() => {
        cleared += 1;
      }}
    />,
  );
  expect(screen.getByText(/Showing the 4 items you just added/u)).toBeDefined();
  await userEvent.setup().click(screen.getByRole("button", { name: "Show all" }));
  expect(cleared).toBe(1);
});

test("one item reads in the singular", () => {
  render(<JustAddedChip count={1} onShowAll={() => {}} />);
  expect(screen.getByText(/Showing the item you just added/u)).toBeDefined();
});
