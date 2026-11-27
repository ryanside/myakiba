import { expect, test } from "bun:test";
import { orderSearchSortSchema } from "../search/schema";

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
