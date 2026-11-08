import { afterEach, expect, spyOn, test } from "bun:test";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Panic, Result } from "better-result";
import { InlineCountCell } from "./inline-count-cell";

const consoleError = spyOn(console, "error").mockImplementation(() => {});

afterEach(() => {
  cleanup();
  consoleError.mockClear();
});

function editTo(count: number) {
  act(() => screen.getByRole("button", { name: "1, edit Count" }).click());
  const input = screen.getByRole("spinbutton");
  fireEvent.change(input, { target: { value: String(count) } });
  fireEvent.keyDown(input, { key: "Enter" });
}

test("a count that saves reports nothing", async () => {
  const saved: number[] = [];
  render(
    <InlineCountCell
      label="Count"
      value={1}
      onSubmit={async (count) => {
        saved.push(count);
        return Result.ok();
      }}
    />,
  );
  editTo(2);

  await waitFor(() => expect(saved).toEqual([2]));
  expect(consoleError).not.toHaveBeenCalled();
});

test("a count submit that rejects is reported as a defect", async () => {
  const rejection = new TypeError("onSubmit is not a function");
  render(<InlineCountCell label="Count" value={1} onSubmit={() => Promise.reject(rejection)} />);
  editTo(2);

  await waitFor(() => expect(consoleError).toHaveBeenCalledTimes(1));
  const [reported] = consoleError.mock.calls[0] ?? [];
  expect(Panic.is(reported) && reported.cause).toBe(rejection);
});
