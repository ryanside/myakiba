import { expect, expectTypeOf, test } from "bun:test";
import type { ItemFill } from "../collection/fill";
import { ORDER_CASCADE_OPTIONS } from "./constants";
import { fillOrdersBodySchema } from "./fill";
import type { OrderFill } from "./fill";
import type { CascadeOption } from "./schema";

test("an Order fills its Paid and exactly the Cascade to Items fields, with the values a Collection Item fill takes", () => {
  expectTypeOf<OrderFill["field"]>().toEqualTypeOf<"paid" | CascadeOption>();
  expectTypeOf<Exclude<OrderFill, { field: "paid" }>>().toEqualTypeOf<
    Extract<ItemFill, { field: CascadeOption }>
  >();
});

const FILLS = [
  { field: "paid", value: false },
  { field: "status", value: "Owned" },
  { field: "shop", value: "" },
  { field: "orderDate", value: "2026-01-05" },
  { field: "paymentDate", value: null },
  { field: "shippingDate", value: "2026-02-01" },
  { field: "collectionDate", value: null },
  { field: "shippingMethod", value: "SAL" },
] as const satisfies readonly OrderFill[];

test("Paid and every Cascade to Items field have an Order fill", () => {
  expect(FILLS.map(({ field }) => field)).toEqual(["paid", ...ORDER_CASCADE_OPTIONS]);
});

test.each(FILLS)("a $field fill parses as sent", (fill) => {
  expect(fillOrdersBodySchema.parse({ orderIds: ["o-1"], fill })).toEqual({
    orderIds: ["o-1"],
    fill,
  });
});

test.each([
  ["a field an Order has no fill for", { orderIds: ["o-1"], fill: { field: "price", value: 1 } }],
  ["an Order's own field", { orderIds: ["o-1"], fill: { field: "title", value: "x" } }],
  [
    "Cascade to Items options",
    { orderIds: ["o-1"], fill: { field: "paid", value: true }, cascadeOptions: [] },
  ],
  ["an extra key in the fill", { orderIds: ["o-1"], fill: { field: "paid", value: true, x: 1 } }],
  [
    "a value of another field's type",
    { orderIds: ["o-1"], fill: { field: "status", value: true } },
  ],
  ["Collection Item ids", { ids: ["c-1"], fill: { field: "paid", value: true } }],
])("a body with %s is refused", (_, body) => {
  expect(fillOrdersBodySchema.safeParse(body).success).toBe(false);
});
