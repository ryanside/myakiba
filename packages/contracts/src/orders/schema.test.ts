import { expect, test } from "bun:test";
import { orderSearchSortSchema } from "../search/schema";
import { searchSchema } from "./schema";

const CUT_FILTERS = {
  unpaidCostsMin: "1",
  unpaidCostsMax: "1",
  orderSpendMin: "1",
  orderSpendMax: "1",
  taxesMin: "1",
  taxesMax: "1",
  dutiesMin: "1",
  dutiesMax: "1",
  tariffsMin: "1",
  tariffsMax: "1",
  miscFeesMin: "1",
  miscFeesMax: "1",
};

test("an Orders URL drops a cut filter and a cut sort and keeps the rest", () => {
  const parsed = searchSchema.parse({
    ...CUT_FILTERS,
    sort: "tariffs",
    order: "asc",
    status: ["Ordered"],
    paid: false,
    shop: ["AmiAmi"],
    orderDateStart: "2026-01-01",
    totalMin: "100",
    shippingFeeMax: "0",
    shipMethod: ["EMS"],
  });

  expect(parsed).toEqual({
    order: "asc",
    status: ["Ordered"],
    paid: false,
    shop: ["AmiAmi"],
    orderDateStart: "2026-01-01",
    totalMin: 100,
    shippingFeeMax: 0,
    shipMethod: ["EMS"],
  });
});

test("an Orders URL keeps a kept sort and still rejects a sort the list never had", () => {
  expect({
    kept: searchSchema.parse({ sort: "shippingFee" }).sort,
    unknown: searchSchema.safeParse({ sort: "nope" }).success,
  }).toEqual({ kept: "shippingFee", unknown: false });
});

test("Orders sort by fourteen keys and none of the cut fees", () => {
  expect(orderSearchSortSchema.options).toEqual([
    "title",
    "shop",
    "orderDate",
    "paymentDate",
    "shippingDate",
    "collectionDate",
    "releaseDate",
    "shippingMethod",
    "total",
    "shippingFee",
    "itemCount",
    "status",
    "paid",
    "createdAt",
  ]);
});
