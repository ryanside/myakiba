import { afterEach, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import type { Order } from "@myakiba/contracts/orders/types";
import { OrderSummary } from "./order-summary";

afterEach(cleanup);

const order: Order = {
  orderId: "order",
  title: "Order",
  shop: "Shop",
  releaseDate: null,
  shippingMethod: "EMS",
  orderDate: null,
  paymentDate: null,
  shippingDate: null,
  collectionDate: null,
  status: "Owned",
  paid: true,
  total: 0,
  shippingFee: 0,
  taxes: 0,
  duties: 0,
  tariffs: 0,
  miscFees: 0,
  notes: "",
  itemCount: 0,
  images: [],
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
};

function summary(fields: Partial<Order> = {}) {
  return render(
    <OrderSummary
      order={{ ...order, ...fields }}
      isLoading={false}
      currency="USD"
      locale="en-US"
      dateFormat="MM/DD/YYYY"
    />,
  );
}

const dates = () =>
  [...document.querySelectorAll("dt")].map(
    (term) => `${term.textContent} ${term.nextElementSibling?.textContent ?? ""}`,
  );

const steps = () =>
  ["Ordered", "Shipped", "Owned", "Pending", "—"].filter((text) => screen.queryByText(text));

test("an Order with no dates lists none and draws no steps", () => {
  summary();
  expect({ dates: dates(), steps: steps() }).toEqual({ dates: [], steps: [] });
});

test("an Order lists only the dates entered, in the order they happen", () => {
  summary({ status: "Owned", orderDate: "2026-01-02", collectionDate: "2026-03-04" });
  expect({ dates: dates(), steps: steps() }).toEqual({
    dates: ["Order Date 01/02/2026", "Collection Date 03/04/2026"],
    steps: [],
  });
});

test("an Order with every date lists all four", () => {
  summary({
    orderDate: "2026-01-02",
    paymentDate: "2026-01-05",
    shippingDate: "2026-02-03",
    collectionDate: "2026-03-04",
  });
  expect(dates()).toEqual([
    "Order Date 01/02/2026",
    "Payment Date 01/05/2026",
    "Shipping Date 02/03/2026",
    "Collection Date 03/04/2026",
  ]);
});

test("a Shipped Order with no Shipping Date shows no Pending step", () => {
  summary({ status: "Shipped", paid: false, orderDate: "2026-01-02" });
  expect({ dates: dates(), steps: steps() }).toEqual({
    dates: ["Order Date 01/02/2026"],
    steps: [],
  });
});
