import { afterEach, expect, mock, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Result } from "better-result";
import type { ReactNode } from "react";
import type { ItemCollectionEntry, ItemDetail } from "./types";

const realRouter = await import("@tanstack/react-router");
await mock.module("@tanstack/react-router", () => ({
  ...realRouter,
  Link: ({ children }: { readonly children: ReactNode }) => <a href="#order">{children}</a>,
}));

const { CollectionItemCard } = await import("./collection-item-card");

afterEach(cleanup);

const item: ItemDetail = {
  id: "item-alpha",
  externalId: 1,
  source: "mfc",
  title: "Alpha Figure",
  mfcTitle: null,
  numbering: null,
  category: "Prepainted",
  version: [],
  scale: "1/7",
  height: null,
  width: null,
  depth: null,
  image: null,
  createdAt: new Date("2026-10-01T00:00:00.000Z"),
  updatedAt: new Date("2026-10-01T00:00:00.000Z"),
  releases: [],
  entries: [],
};

const entry = (fields: Partial<ItemCollectionEntry>): ItemCollectionEntry => ({
  id: "collection-alpha",
  itemId: "item-alpha",
  orderId: "order-alpha",
  status: "Shipped",
  count: 1,
  releaseId: null,
  score: "0.0",
  price: 1000,
  shop: "",
  orderDate: "2026-01-02",
  paymentDate: null,
  shippingDate: "2026-02-03",
  collectionDate: null,
  shippingMethod: "n/a",
  tags: [],
  condition: "New",
  notes: "",
  createdAt: new Date("2026-01-02T00:00:00.000Z"),
  updatedAt: new Date("2026-01-02T00:00:00.000Z"),
  ...fields,
});

function card(collectionItem: ItemCollectionEntry) {
  const saved = async () => Result.ok();
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <CollectionItemCard
        collectionItem={collectionItem}
        item={item}
        externalId={1}
        relatedOrder={undefined}
        currency="USD"
        locale="en-US"
        dateFormat="MM/DD/YYYY"
        onEdit={saved}
        onDelete={saved}
        onMoveToExisting={saved}
        onMoveToNew={saved}
        isOrderActionPending={false}
      />
    </QueryClientProvider>,
  );
}

const steps = () =>
  [...document.querySelectorAll('[data-slot="timeline-title"]')].map((title) => title.textContent);

test("the steps are Ordered, Shipped and Owned, with no Paid or Unpaid badge and no Payment line without a Payment Date", () => {
  card(entry({}));

  expect(steps()).toEqual(["Ordered", "Shipped", "Owned"]);
  expect({
    unpaid: screen.queryByText("Unpaid") === null,
    paid: screen.queryByText("Paid") === null,
    payment: screen.queryByText("Payment") === null,
  }).toEqual({ unpaid: true, paid: true, payment: true });
});

test("a Payment Date shows on its own beside the steps, with no Paid badge", () => {
  card(entry({ paymentDate: "2026-01-05" }));
  const payment = screen.getByText("Payment").parentElement;
  if (!payment) throw new Error("no payment line");

  expect(steps()).toEqual(["Ordered", "Shipped", "Owned"]);
  expect(payment.textContent).toBe("Payment01/05/2026");
});
