import { afterEach, expect, test } from "bun:test";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Result } from "better-result";
import { InlineCurrencyCell } from "./inline-currency-cell";

afterEach(cleanup);

const PAST_SAFE_INTEGER = "90071992547409.92";

function renderCell() {
  const writes: number[] = [];
  render(
    <InlineCurrencyCell
      value={1000}
      currency="USD"
      locale="en-US"
      onSubmit={async (amount) => {
        writes.push(amount);
        return Result.ok();
      }}
    />,
  );
  return writes;
}

function enter(amount: string) {
  act(() => screen.getByRole("button", { name: "$10.00" }).click());
  const input = screen.getByRole("textbox");
  fireEvent.change(input, { target: { value: amount } });
  fireEvent.keyDown(input, { key: "Enter" });
}

test("an amount that reads saves and leaves edit mode", async () => {
  const writes = renderCell();
  enter("12.50");

  await waitFor(() => expect(writes).toEqual([1250]));
  expect(screen.queryByRole("textbox")).toBeNull();
});

test("an amount too large to save keeps the cell editing and marked invalid", async () => {
  const writes = renderCell();
  enter(PAST_SAFE_INTEGER);

  expect(await screen.findByText("Enter an amount like 1,234.50")).toBeTruthy();
  expect(screen.getByRole("textbox").getAttribute("aria-invalid")).toBe("true");
  expect(writes).toEqual([]);
});
