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

const dates = () =>
  [...document.querySelectorAll("dt")].map(
    (term) => `${term.textContent} ${term.nextElementSibling?.textContent ?? ""}`,
  );

const steps = () =>
  ["Ordered", "Shipped", "Owned"].filter((text) =>
    screen.queryAllByText(text).some((element) => !element.closest('[data-slot="badge"]')),
  );

test("a card with no dates lists none and draws no steps", () => {
  card(entry({ status: "Owned", orderDate: null, shippingDate: null }));

  expect({ dates: dates(), steps: steps() }).toEqual({ dates: [], steps: [] });
});

test("an Owned card with only an Order Date lists that date and no steps", () => {
  card(entry({ status: "Owned", shippingDate: null }));

  expect({ dates: dates(), steps: steps() }).toEqual({
    dates: ["Order Date 01/02/2026"],
    steps: [],
  });
});

test("a card with every date lists all four, with no Paid or Unpaid badge", () => {
  card(entry({ paymentDate: "2026-01-05", collectionDate: "2026-03-04" }));

  expect({
    dates: dates(),
    steps: steps(),
    unpaid: screen.queryByText("Unpaid") === null,
    paid: screen.queryByText("Paid") === null,
  }).toEqual({
    dates: [
      "Order Date 01/02/2026",
      "Payment Date 01/05/2026",
      "Shipping Date 02/03/2026",
      "Collection Date 03/04/2026",
    ],
    steps: [],
    unpaid: true,
    paid: true,
  });
});
