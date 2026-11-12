import { afterEach, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import { DatePicker } from "./date-picker";

afterEach(cleanup);

test("a labelled date picker keeps its field name before and after picking a date", () => {
  const field = (value: string | null) => (
    <>
      <label htmlFor="order-date">Order Date</label>
      <DatePicker id="order-date" value={value} />
    </>
  );
  const { rerender } = render(field(null));
  expect(screen.getByRole("button", { name: "Order Date" })).toBeTruthy();

  rerender(field("2026-11-08"));
  expect(screen.getByRole("button", { name: "Order Date" })).toBeTruthy();
  expect(
    screen.getByRole("button", { name: "Order Date", description: "Nov 8, 2026" }),
  ).toBeTruthy();
});

test("an unlabelled date picker keeps its placeholder with the picked date", () => {
  const { rerender } = render(<DatePicker placeholder="From" />);
  expect(screen.getByRole("button", { name: "From" })).toBeTruthy();

  rerender(<DatePicker placeholder="From" value="2026-11-08" />);
  expect(screen.getByRole("button", { name: "From, Nov 8, 2026" })).toBeTruthy();
});

test("each labelled picker describes its own value", () => {
  render(
    <>
      <label htmlFor="payment-date">Payment Date</label>
      <DatePicker id="payment-date" value="2026-11-08" />
      <label htmlFor="shipping-date">Shipping Date</label>
      <DatePicker id="shipping-date" value="2026-11-09" />
    </>,
  );
  expect(
    screen.getByRole("button", { name: "Payment Date", description: "Nov 8, 2026" }),
  ).toBeTruthy();
  expect(
    screen.getByRole("button", { name: "Shipping Date", description: "Nov 9, 2026" }),
  ).toBeTruthy();
});

test("an unlabelled date picker says its placeholder and date once, with no description", () => {
  const { rerender } = render(<DatePicker placeholder="From" />);
  expect(screen.getByRole("button", { name: "From", description: "" })).toBeTruthy();

  rerender(<DatePicker placeholder="From" value="2026-11-08" />);
  expect(screen.getByRole("button", { name: "From, Nov 8, 2026", description: "" })).toBeTruthy();
});
