import { describe, expect, test } from "bun:test";
import { DEFAULT_ORDER_FIELDS, DEFAULT_SHARED } from "./commit-input";
import {
  commitListView,
  commitToastDescription,
  commitToastTitle,
  commitView,
} from "./commit-toast";
import type { CommitOutcome } from "./commit-toast";

const committed = (count: number, ownedIds = true) =>
  Array.from({ length: count }, (_, index) => ({
    itemId: `item-${index}`,
    externalId: 100 + index,
    title: `Title ${index}`,
    image: null,
    collectionId: ownedIds ? `collection-${index}` : null,
  }));

const outcome = (overrides: Partial<CommitOutcome> & Pick<CommitOutcome, "ownership">) => ({
  orderTitle: null,
  wishlist: false,
  lists: [],
  answer: { committed: committed(2), orderId: null, wishlistAdded: 0, listIds: [] },
  ...overrides,
});

const OWNED = { kind: "collection", shared: DEFAULT_SHARED } as const;
const LIST = { id: "list-1", title: "Display shelf" };
const NOT_OWNED = { kind: "none" } as const;

describe("View", () => {
  test("Owned Collection Items open the Collection filtered to them", () => {
    expect(commitView(outcome({ ownership: OWNED })).target).toEqual({
      to: "/collection",
      search: { ids: ["collection-0", "collection-1"] },
    });
  });

  test.each(["Ordered", "Paid", "Shipped"] as const)(
    "%s Collection Items open an Item's page, the one screen that shows them",
    (status) => {
      const ownership = { kind: "collection", shared: { ...DEFAULT_SHARED, status } } as const;
      const one = {
        ownership,
        answer: { committed: committed(1), orderId: null, wishlistAdded: 0, listIds: [] },
      };
      expect(commitView(outcome(one))).toEqual({
        label: "View",
        target: { to: "/item/$externalId", params: { externalId: 100 } },
      });
      expect(commitView(outcome({ ownership }))).toEqual({
        label: "View first item",
        target: { to: "/item/$externalId", params: { externalId: 100 } },
      });
    },
  );

  test("a custom Item opens its own page", () => {
    const answer = {
      committed: committed(1).map((row) => ({ ...row, itemId: "custom-1", externalId: null })),
      orderId: null,
      wishlistAdded: 0,
      listIds: [],
    };
    const ownership = {
      kind: "collection",
      shared: { ...DEFAULT_SHARED, status: "Paid" },
    } as const;
    expect(commitView(outcome({ ownership, answer })).target).toEqual({
      to: "/item/custom/$id",
      params: { id: "custom-1" },
    });
  });

  test("an Order opens that Order", () => {
    const ownership = {
      kind: "order",
      order: { kind: "new", fields: DEFAULT_ORDER_FIELDS },
    } as const;
    const answer = { committed: committed(2), orderId: "order-1", wishlistAdded: 0, listIds: [] };
    expect(commitView(outcome({ ownership, answer })).target).toEqual({
      to: "/orders/$id",
      params: { id: "order-1" },
    });
  });

  test("Not owned opens the Wishlist, else the List, else the Item or the Item Database", () => {
    expect(commitView(outcome({ ownership: NOT_OWNED, wishlist: true })).target).toEqual({
      to: "/wishlist",
    });
    expect(commitView(outcome({ ownership: NOT_OWNED, lists: [LIST] })).target).toEqual({
      to: "/lists/$listId",
      params: { listId: "list-1" },
    });
    expect(
      commitView(outcome({ ownership: NOT_OWNED, lists: [LIST, { id: "l2", title: "B" }] })).target,
    ).toEqual({ to: "/lists" });
    expect(commitView(outcome({ ownership: NOT_OWNED })).target).toEqual({ to: "/items" });
    expect(
      commitView(
        outcome({
          ownership: NOT_OWNED,
          answer: { committed: committed(1), orderId: null, wishlistAdded: 0, listIds: [] },
        }),
      ).target,
    ).toEqual({ to: "/item/$externalId", params: { externalId: 100 } });
  });
});

describe("the list action", () => {
  test("appears beside a View that goes elsewhere", () => {
    expect(commitListView(outcome({ ownership: OWNED, lists: [LIST] }))).toEqual({
      label: "View list",
      target: { to: "/lists/$listId", params: { listId: "list-1" } },
    });
    expect(
      commitListView(outcome({ ownership: NOT_OWNED, wishlist: true, lists: [LIST] }))?.label,
    ).toBe("View list");
  });

  test("is not repeated when View already opens the List", () => {
    expect(commitListView(outcome({ ownership: NOT_OWNED, lists: [LIST] }))).toBeNull();
    expect(commitListView(outcome({ ownership: OWNED }))).toBeNull();
  });
});

test("the description says where else the rows went", () => {
  expect(commitToastDescription(outcome({ ownership: NOT_OWNED, lists: [LIST] }))).toBeUndefined();
  expect(commitToastDescription(outcome({ ownership: OWNED, wishlist: true, lists: [LIST] }))).toBe(
    "Also on your Wishlist and in ‘Display shelf’.",
  );
  expect(
    commitToastDescription(
      outcome({ ownership: { kind: "collection", shared: { ...DEFAULT_SHARED, status: "Paid" } } }),
    ),
  ).toBe("They show on each Item's page until they are Owned.");
});

test("the title says what happened", () => {
  expect(commitToastTitle(outcome({ ownership: OWNED }))).toBe("Added 2 to your collection");
  expect(
    commitToastTitle(
      outcome({
        ownership: { kind: "order", order: { kind: "new", fields: DEFAULT_ORDER_FIELDS } },
        orderTitle: "Spring",
      }),
    ),
  ).toBe("Created order ‘Spring’");
  expect(
    commitToastTitle(
      outcome({
        ownership: { kind: "order", order: { kind: "existing", order: null } },
        orderTitle: "Spring",
      }),
    ),
  ).toBe("Added 2 to ‘Spring’");
  expect(commitToastTitle(outcome({ ownership: NOT_OWNED, wishlist: true, lists: [LIST] }))).toBe(
    "Added 2 to your Wishlist and ‘Display shelf’",
  );
  expect(commitToastTitle(outcome({ ownership: NOT_OWNED }))).toBe(
    "2 items are in the Item Database",
  );
});
