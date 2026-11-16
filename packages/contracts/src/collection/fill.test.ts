import { expect, expectTypeOf, test } from "bun:test";
import { COLLECTION_FIELD } from "./fields";
import { fillItemsBodySchema } from "./fill";
import type { ItemFill } from "./fill";

const FILLS = [
  { field: "status", value: "Shipped" },
  { field: "paid", value: true },
  { field: "price", value: 0 },
  { field: "count", value: 999 },
  { field: "condition", value: "Pre-Owned" },
  { field: "shop", value: "" },
  { field: "orderDate", value: "2026-01-05" },
  { field: "paymentDate", value: null },
  { field: "shippingDate", value: "2026-02-01" },
  { field: "collectionDate", value: null },
  { field: "shippingMethod", value: "EMS" },
  { field: "score", value: "9.5" },
  { field: "tags", value: ["shelf", "boxed"] },
  { field: "notes", value: "" },
] as const satisfies readonly ItemFill[];

test("every field but the release has a fill", () => {
  expectTypeOf<ItemFill["field"]>().toEqualTypeOf<
    Exclude<keyof typeof COLLECTION_FIELD, "releaseId">
  >();
  const filled: readonly string[] = FILLS.map(({ field }) => field);
  expect(filled.toSorted()).toEqual(
    Object.keys(COLLECTION_FIELD)
      .filter((field) => field !== "releaseId")
      .toSorted(),
  );
});

test.each(FILLS)("a $field fill parses as sent", (fill) => {
  expect(fillItemsBodySchema.parse({ ids: ["c-1"], fill })).toEqual({ ids: ["c-1"], fill });
});

test("a shop fill is trimmed, as an edit's shop is", () => {
  expect(
    fillItemsBodySchema.parse({ ids: ["c-1"], fill: { field: "shop", value: " AmiAmi " } }).fill,
  ).toEqual({ field: "shop", value: "AmiAmi" });
});

test.each([
  ["an extra key in the body", { ids: ["c-1"], fill: { field: "paid", value: true }, userId: "u" }],
  ["an extra key in the fill", { ids: ["c-1"], fill: { field: "paid", value: true, id: "c-2" } }],
  ["a value of another field's type", { ids: ["c-1"], fill: { field: "paid", value: "Owned" } }],
  ["a release fill", { ids: ["c-1"], fill: { field: "releaseId", value: null } }],
  ["an unknown field", { ids: ["c-1"], fill: { field: "updatedAt", value: "2026-01-01" } }],
  ["a fill with no value", { ids: ["c-1"], fill: { field: "notes" } }],
  ["a count past the edit's limit", { ids: ["c-1"], fill: { field: "count", value: 1000 } }],
  ["a fractional price", { ids: ["c-1"], fill: { field: "price", value: 1.5 } }],
  ["more tags than an edit takes", { ids: ["c-1"], fill: { field: "tags", value: tags(101) } }],
  ["no ids", { fill: { field: "paid", value: true } }],
])("a body with %s is refused", (_, body) => {
  expect(fillItemsBodySchema.safeParse(body).success).toBe(false);
});

function tags(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `tag-${index}`);
}
