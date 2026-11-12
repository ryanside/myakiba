import { expect, test } from "bun:test";
import { entry, entry_to_item, item } from "./schema/figure";

test("an Item, Item Entry or link insert without an owner does not compile", () => {
  const ownerless = [
    // @ts-expect-error An Item needs its owner.
    { title: "Item" } satisfies typeof item.$inferInsert,
    // @ts-expect-error An Item Entry needs its owner.
    { category: "Characters", name: "Entry" } satisfies typeof entry.$inferInsert,
    // @ts-expect-error An Item Entry link needs its owner.
    { entryId: "entry", itemId: "item" } satisfies typeof entry_to_item.$inferInsert,
  ];
  expect(ownerless.some((row) => "ownerId" in row)).toBe(false);
  expect([item, entry, entry_to_item].map((table) => table.ownerId.notNull)).toEqual([
    true,
    true,
    true,
  ]);
});
