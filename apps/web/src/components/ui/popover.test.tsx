import { afterEach, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

afterEach(cleanup);

test("a popover has its own surface, so what is behind it does not show through", () => {
  render(
    <Popover defaultOpen>
      <PopoverTrigger>Open</PopoverTrigger>
      <PopoverContent>Inside</PopoverContent>
    </Popover>,
  );
  const { classList } = screen.getByText("Inside");
  for (const surface of ["bg-popover", "rounded-lg", "shadow-md", "ring-1"]) {
    expect(classList.contains(surface)).toBe(true);
  }
});
