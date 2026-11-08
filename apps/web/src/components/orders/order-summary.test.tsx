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

test("an Owned order without dates shows four completed undated steps", () => {
  summary();
  expect(screen.queryByText("Pending")).toBeNull();
  expect(screen.getAllByText("—")).toHaveLength(4);
});

test("only future undated steps show Pending", () => {
  summary({ status: "Paid" });
  expect(screen.getAllByText("Pending")).toHaveLength(2);
  expect(screen.getAllByText("—")).toHaveLength(2);
});

test("a recorded timeline date stays visible", () => {
  summary({ orderDate: "2026-01-02" });
  expect(screen.getByText("01/02/2026")).not.toBeNull();
});
