import { expect, test } from "bun:test";
import type { JobData, NormalizedInternalCsvItem } from "@myakiba/contracts/sync/schema";
import { fetchedItemRows } from "./item-rows";

const item = { id: "item-1", externalId: 1, title: "", releaseId: null, releaseDate: null };
const row: NormalizedInternalCsvItem = {
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
  shop: "Shop",
  shipping_method: "n/a",
  note: "CSV",
  orderDate: null,
};
const payload = (csvRow: NormalizedInternalCsvItem): JobData => ({
  type: "csv",
  payloadVersion: 3,
  userId: "user-1",
  syncSessionId: "session-1",
  items: [csvRow],
  itemsToInsert: [],
  ordersToInsert: [],
});

test("CSV completion uses the worker's fallback Order title", () => {
  expect(fetchedItemRows(payload(row), item).orders).toMatchObject([{ title: "Order order-1" }]);
});

test("CSV completion creates Orders only for Ordered rows", () => {
  expect(fetchedItemRows(payload({ ...row, status: "Owned" }), item).orders).toEqual([]);
});
