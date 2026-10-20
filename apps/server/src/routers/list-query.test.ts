import { describe, expect, test } from "bun:test";
import { collectionQuerySchema } from "./collection/model";
import { ordersQuerySchema } from "./orders/model";

describe.each([
  ["orders", ordersQuerySchema],
  ["collection", collectionQuerySchema],
])("%s list query", (_, schema) => {
  test("fills the page fields when the query omits them", () => {
    expect(schema.parse({})).toMatchObject({
      limit: 24,
      offset: 0,
      sort: "createdAt",
      order: "desc",
    });
  });

  test("coerces page fields from query strings", () => {
    expect(schema.parse({ limit: "100", offset: "48", sort: "shop", order: "asc" })).toMatchObject({
      limit: 100,
      offset: 48,
      sort: "shop",
      order: "asc",
    });
  });

  test.each([
    { limit: "0" },
    { limit: "101" },
    { limit: "2.5" },
    { offset: "-1" },
    { sort: "nope" },
    { order: "up" },
  ])("rejects %o", (query) => {
    expect(schema.safeParse(query).success).toBe(false);
  });
});
