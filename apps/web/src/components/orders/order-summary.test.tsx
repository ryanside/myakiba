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
  payment: "paid",
  total: 0,
  unpaidCosts: 0,
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

test("an Owned order without dates shows three completed undated steps: Ordered, Shipped, Owned", () => {
  summary();
  expect(screen.queryByText("Pending")).toBeNull();
  expect(screen.getAllByText("—")).toHaveLength(3);
  expect(["Ordered", "Shipped", "Owned"].map((step) => screen.getAllByText(step).length)).toEqual([
    1, 1, 1,
  ]);
});

test("only future undated steps show Pending", () => {
  summary({ status: "Ordered", paid: false, payment: "unpaid" });
  expect(screen.getAllByText("Pending")).toHaveLength(2);
  expect(screen.getAllByText("—")).toHaveLength(1);
});

test("a recorded timeline date stays visible", () => {
  summary({ orderDate: "2026-01-02" });
  expect(screen.getByText("01/02/2026")).not.toBeNull();
});

test("payment shows apart from the steps, with the Payment Date when there is one", () => {
  summary({ status: "Shipped", paid: true, payment: "partly", paymentDate: "2026-02-03" });
  expect(screen.getByText("Partly paid")).not.toBeNull();
  expect(screen.getByText("02/03/2026")).not.toBeNull();
  expect(screen.getAllByText("Pending")).toHaveLength(1);
});

test("an unpaid order says so with no date", () => {
  summary({ status: "Ordered", paid: false, payment: "unpaid" });
  expect(screen.getByText("Unpaid")).not.toBeNull();
});

const unpaidCostsRow = () => screen.queryByText("Unpaid Costs")?.parentElement?.textContent ?? null;

test("a Partly paid order shows its Unpaid Costs under the Total", () => {
  summary({ paid: true, payment: "partly", total: 3000, unpaidCosts: 1200 });
  expect(unpaidCostsRow()).toBe("Unpaid Costs$12.00");
});

test.each([
  [
    "an unpaid order, whose Total is what it owes",
    { paid: false, payment: "unpaid", unpaidCosts: 3000 },
  ],
  ["a paid order", { paid: true, payment: "paid", unpaidCosts: 0 }],
  ["a Partly paid order that owes nothing", { paid: false, payment: "partly", unpaidCosts: 0 }],
] as const)("%s shows no Unpaid Costs row", (_name, fields) => {
  summary({ ...fields, total: 3000 });
  expect(unpaidCostsRow()).toBeNull();
});
