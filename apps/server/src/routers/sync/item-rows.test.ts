import { expect, test } from "bun:test";
import type { JobData, PricedCsvItem } from "@myakiba/contracts/sync/schema";
import { fetchedItemRows } from "./item-rows";
import { prepareCsvItems } from "./csv";
import { buildRetryJobData } from "./retry";

const item = { id: "item-1", externalId: 1, title: "", releaseId: null, releaseDate: null };
const row: PricedCsvItem = {
  collectionId: "collection-1",
  itemExternalId: 1,
  orderId: "order-1",
  status: "Ordered",
  count: 1,
  score: "",
  payment_date: null,
  shipping_date: null,
  collecting_date: null,
  price: "10.00",
  priceMinorUnits: 1000,
  shop: "Shop",
  shipping_method: "n/a",
  note: "CSV",
  orderDate: null,
};
const payload = (csvRow: PricedCsvItem): JobData => ({
  type: "csv",
  warnings: [],
  payloadVersion: 3,
  userId: "user-1",
  syncSessionId: "session-1",
  items: [csvRow],
  itemsToInsert: [],
  ordersToInsert: [],
});

test("CSV completion keeps an empty Item title", () => {
  expect(fetchedItemRows(payload(row), item).orders).toMatchObject([{ title: "" }]);
});

test("CSV completion creates an Order for an Owned row with an orderId", () => {
  expect(fetchedItemRows(payload({ ...row, status: "Owned" }), item).orders).toMatchObject([
    { id: "order-1", status: "Ordered" },
  ]);
});

test("in-request CSV creates Orders only for Ordered rows and falls back from an empty title", () => {
  expect(prepareCsvItems([row], [item], "user-1").orderItems).toMatchObject([
    { title: "Order order-1" },
  ]);
  expect(prepareCsvItems([{ ...row, status: "Owned" }], [item], "user-1").orderItems).toEqual([]);
});

test("CSV retry of an existing Item keeps the in-request Order mapping", () => {
  const ordered = buildRetryJobData(payload(row), new Set([1]), [item]);
  const owned = buildRetryJobData(payload({ ...row, status: "Owned" }), new Set([1]), [item]);
  expect(ordered.type === "csv" && ordered.ordersToInsert).toMatchObject([
    { title: "Order order-1" },
  ]);
  expect(owned.type === "csv" && owned.ordersToInsert).toEqual([]);
});

test("in-request CSV imports an invalid price as zero", () => {
  expect(
    prepareCsvItems([{ ...row, price: "12,50", priceMinorUnits: 0 }], [item], "user-1")
      .collectionItems,
  ).toMatchObject([{ price: 0 }]);
});

test("fetched CSV imports an invalid price as zero", () => {
  expect(
    fetchedItemRows(payload({ ...row, price: "1.2.3", priceMinorUnits: 0 }), item).collectionItems,
  ).toMatchObject([{ price: 0 }]);
});
