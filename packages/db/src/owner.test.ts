import { expect, test } from "bun:test";
import { entry, entry_to_item, item } from "./schema/figure";

type LinkInsert = typeof entry_to_item.$inferInsert;

test("an Item, Item Entry or link insert without an owner does not compile", () => {
  const ownerless = [
    // @ts-expect-error An Item needs its owner.
    [item, { title: "Item" } satisfies typeof item.$inferInsert],
    // @ts-expect-error An Item Entry needs its owner.
    [entry, { category: "Characters", name: "Entry" } satisfies typeof entry.$inferInsert],
    // @ts-expect-error An Item Entry link needs its owner.
    [entry_to_item, { entryId: "entry", itemId: "item" } satisfies LinkInsert],
  ] as const;
  expect(ownerless.map(([table]) => table.ownerId.notNull)).toEqual([true, true, true]);
});
