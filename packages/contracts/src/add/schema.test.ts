import { describe, expect, test } from "bun:test";
import {
  MAX_ADD_ROWS,
  MAX_COMMIT_LISTS,
  MAX_PICK_STORE_BYTES,
  MFC_SETTINGS_URL,
  MFC_SIGN_IN_URL,
  PICK_TTL_MS,
  mfcItemUrl,
  mfcPictureUrl,
  mfcSearchUrl,
} from "./constants";
import {
  addCommitResponseSchema,
  addCommitSchema,
  addItemSchema,
  addItemsQuerySchema,
  addItemsResponseSchema,
  addOwnershipSchema,
  releasePriceDefault,
} from "./schema";

const COMMIT_ID = "0b6f3f8e-7d1c-4a55-9d3e-2f6b8c1a4e77";

const shared = {
  status: "Owned",
  shop: "AmiAmi",
  orderDate: null,
  paymentDate: null,
  shippingDate: null,
  collectionDate: "2026-10-01",
  shippingMethod: "EMS",
  condition: "New",
  count: 1,
} as const;

const newOrder = {
  title: "Order · Rem + 1 more",
  status: "Ordered",
  shop: "AmiAmi",
  orderDate: "2026-10-01",
  releaseDate: null,
  paymentDate: null,
  shippingDate: null,
  collectionDate: null,
  shippingMethod: "n/a",
  shippingFee: 0,
  taxes: 0,
  duties: 0,
  tariffs: 0,
  miscFees: 0,
  notes: "",
} as const;

const bareRow = (itemId: string) => ({ itemId, price: null });

type Json =
  | string
  | number
  | boolean
  | null
  | undefined
  | readonly Json[]
  | { readonly [key: string]: Json };

function commit(overrides: { readonly [key: string]: Json } = {}) {
  return {
    commitId: COMMIT_ID,
    rows: [bareRow("item-1")],
    ownership: { kind: "collection", shared },
    wishlist: false,
    ...overrides,
  };
}

const ids = (count: number) => Array.from({ length: count }, (_, index) => `item-${index}`);

describe("an Add commit", () => {
  test("to the Collection carries row details and names no Lists by default", () => {
    const parsed = addCommitSchema.parse(
      commit({
        rows: [
          {
            itemId: "item-1",
            price: 1200,
            count: 2,
            condition: "Pre-Owned",
            score: "9.5",
            tags: ["shelf"],
            notes: "boxed",
            shop: "Mandarake",
            collectionDate: null,
          },
        ],
      }),
    );

    expect(parsed.listIds).toEqual([]);
    expect(parsed.rows[0]?.score).toBe("9.5");
  });

  test.each([
    ["a new Order", { kind: "order", order: { kind: "new", fields: newOrder } }],
    ["an existing Order", { kind: "order", order: { kind: "existing", orderId: "order-1" } }],
  ])("to %s is accepted", (_, ownership) => {
    expect(addCommitSchema.safeParse(commit({ ownership })).success).toBe(true);
  });

  test("not owned, with only the Wishlist or only a List, is accepted", () => {
    const none = { ownership: { kind: "none" }, rows: [bareRow("item-1"), bareRow("item-2")] };

    expect(addCommitSchema.safeParse(commit({ ...none, wishlist: true })).success).toBe(true);
    expect(addCommitSchema.safeParse(commit({ ...none, listIds: ["list-1"] })).success).toBe(true);
  });

  test("not owned and going nowhere is refused", () => {
    const parsed = addCommitSchema.safeParse(commit({ ownership: { kind: "none" } }));

    expect(parsed.error?.issues.map((issue) => issue.message)).toEqual([
      "Choose where these items go",
    ]);
  });

  test.each([
    ["a price", { price: 500 }],
    ["a count", { count: 2 }],
    ["a date", { orderDate: null }],
    ["tags", { tags: ["shelf"] }],
  ])("not owned refuses rows that carry %s", (_, detail) => {
    const parsed = addCommitSchema.safeParse(
      commit({
        ownership: { kind: "none" },
        wishlist: true,
        rows: [{ ...bareRow("item-1"), ...detail }],
      }),
    );

    expect(parsed.error?.issues.map((issue) => issue.message)).toEqual([
      "Rows carry details only when they become Collection Items",
    ]);
  });

  test("adds each Item once", () => {
    const parsed = addCommitSchema.safeParse(
      commit({ rows: [bareRow("item-1"), bareRow("item-1")] }),
    );

    expect(parsed.error?.issues.map((issue) => issue.message)).toEqual([
      "Each item can be added once per commit",
    ]);
  });

  test("names each List once, and at most the List cap", () => {
    expect(addCommitSchema.safeParse(commit({ listIds: ["list-1", "list-1"] })).success).toBe(
      false,
    );
    expect(addCommitSchema.safeParse(commit({ listIds: ids(MAX_COMMIT_LISTS) })).success).toBe(
      true,
    );
    expect(addCommitSchema.safeParse(commit({ listIds: ids(MAX_COMMIT_LISTS + 1) })).success).toBe(
      false,
    );
  });

  test("has one to the row cap of rows", () => {
    expect(addCommitSchema.safeParse(commit({ rows: [] })).success).toBe(false);
    expect(
      addCommitSchema.safeParse(commit({ rows: ids(MAX_ADD_ROWS).map(bareRow) })).success,
    ).toBe(true);
    expect(
      addCommitSchema.safeParse(commit({ rows: ids(MAX_ADD_ROWS + 1).map(bareRow) })).success,
    ).toBe(false);
  });

  test.each([
    ["no commit id", { commitId: undefined }],
    ["a commit id that is not a UUID", { commitId: "click-1" }],
    ["a user id", { userId: "user-1" }],
    ["a row id", { rows: [{ ...bareRow("item-1"), id: "collection-1" }] }],
    ["a row user id", { rows: [{ ...bareRow("item-1"), userId: "user-1" }] }],
    ["a row timestamp", { rows: [{ ...bareRow("item-1"), createdAt: "2026-10-01T00:00:00Z" }] }],
    ["a row without a price", { rows: [{ itemId: "item-1" }] }],
    ["a negative price", { rows: [{ itemId: "item-1", price: -1 }] }],
    ["a fractional price", { rows: [{ itemId: "item-1", price: 1.5 }] }],
    ["a score over 10", { rows: [{ ...bareRow("item-1"), score: "10.5" }] }],
    ["a count of 0", { rows: [{ ...bareRow("item-1"), count: 0 }] }],
    ["an empty item id", { rows: [bareRow("")] }],
    ["a missing wishlist flag", { wishlist: undefined }],
  ])("refuses %s", (_, overrides) => {
    expect(addCommitSchema.safeParse(commit(overrides)).success).toBe(false);
  });
});

describe("the ownership of an Add commit", () => {
  test.each([
    ["shared fields on not owned", { kind: "none", shared }],
    ["Collection without its shared fields", { kind: "collection" }],
    ["an extra shared field", { kind: "collection", shared: { ...shared, price: 100 } }],
    ["an existing Order without its id", { kind: "order", order: { kind: "existing" } }],
    [
      "a new Order with an id",
      { kind: "order", order: { kind: "new", fields: { ...newOrder, id: "order-1" } } },
    ],
    ["another kind", { kind: "wishlist" }],
  ])("refuses %s", (_, ownership) => {
    expect(addOwnershipSchema.safeParse(ownership).success).toBe(false);
  });
});

describe("the items query", () => {
  test("splits its ids on commas", () => {
    expect(addItemsQuerySchema.parse({ ids: "a,b,c" })).toEqual({ ids: ["a", "b", "c"] });
  });

  test("takes up to the row cap of ids", () => {
    expect(addItemsQuerySchema.safeParse({ ids: ids(MAX_ADD_ROWS).join(",") }).success).toBe(true);
    expect(addItemsQuerySchema.safeParse({ ids: ids(MAX_ADD_ROWS + 1).join(",") }).success).toBe(
      false,
    );
  });

  test.each([
    ["no ids", ""],
    ["an empty id", "a,,b"],
    ["an id over 64 characters", "x".repeat(65)],
  ])("refuses %s", (_, query) => {
    expect(addItemsQuerySchema.safeParse({ ids: query }).success).toBe(false);
  });

  const item = {
    itemId: "item-1",
    externalId: null,
    title: "Custom Rem",
    image: null,
    category: null,
    latestRelease: { id: "release-1", date: "2026-01-31", price: 1200, priceCurrency: "JPY" },
    collectionCount: 2,
    wishlisted: true,
  };

  test("an answer may leave out unknown ids", () => {
    expect(addItemsResponseSchema.parse({ items: [] })).toEqual({ items: [] });
    expect(addItemsResponseSchema.parse({ items: [item] })).toEqual({ items: [item] });
  });

  test("an Item may be custom, with no MFC id, and has no release or one with a date", () => {
    expect(addItemSchema.safeParse({ ...item, latestRelease: null }).success).toBe(true);
    expect(
      addItemSchema.safeParse({ ...item, latestRelease: { ...item.latestRelease, date: null } })
        .success,
    ).toBe(false);
  });

  test.each([
    ["no Collection count", { collectionCount: undefined }],
    ["a negative Collection count", { collectionCount: -1 }],
    ["no Wishlist badge", { wishlisted: undefined }],
  ])("an Item with %s is refused", (_, overrides) => {
    expect(addItemSchema.safeParse({ ...item, ...overrides }).success).toBe(false);
  });
});

test("a commit answer names what it wrote", () => {
  const answer = {
    committed: [
      { itemId: "item-1", externalId: 98_777, title: "Rem", image: null, collectionId: "c-1" },
      { itemId: "item-2", externalId: null, title: "Custom", image: null, collectionId: null },
    ],
    orderId: null,
    wishlistAdded: 1,
    listIds: ["list-1"],
  };

  expect(addCommitResponseSchema.parse(answer)).toEqual(answer);
  expect(addCommitResponseSchema.safeParse({ ...answer, wishlistAdded: -1 }).success).toBe(false);
});

describe("the price a blank row gets", () => {
  test("is the latest release's price when it is in the user's currency", () => {
    expect(releasePriceDefault({ price: 1200, priceCurrency: "JPY" }, "JPY")).toBe(1200);
  });

  test.each([
    ["the release is in another currency", { price: 1200, priceCurrency: "USD" }],
    ["the release has no currency", { price: 1200, priceCurrency: null }],
    ["the release has no price", { price: null, priceCurrency: "JPY" }],
    ["the Item has no release", null],
  ])("is 0 when %s", (_, release) => {
    expect(releasePriceDefault(release, "JPY")).toBe(0);
  });
});

describe("MyFigureCollection links", () => {
  test("a search puts the query in the keywords parameter", () => {
    const query = "Rem & Ram 1/7";

    expect(new URL(mfcSearchUrl(query)).searchParams.get("keywords")).toBe(query);
    expect(mfcSearchUrl(query)).toStartWith("https://myfigurecollection.net/?_tb=item&keywords=");
  });

  test("point at the pages checked on the live site", () => {
    expect(mfcItemUrl(98_777)).toBe("https://myfigurecollection.net/item/98777");
    expect(mfcPictureUrl(98_777)).toBe(
      "https://myfigurecollection.net/?_tb=commit&commit=nsp&objectType=item&objectId=98777&size=1",
    );
    expect(MFC_SIGN_IN_URL).toBe("https://myfigurecollection.net/session/signin/");
    expect(MFC_SETTINGS_URL).toBe("https://myfigurecollection.net/settings/");
  });
});

describe("the pick store", () => {
  test("stays under the 10 MiB storage.local quota Chrome gives without unlimitedStorage", () => {
    expect(MAX_PICK_STORE_BYTES).toBeLessThan(10 * 1024 * 1024);
  });

  test("keeps a pick for 14 days", () => {
    expect(PICK_TTL_MS).toBe(14 * 24 * 60 * 60 * 1000);
  });
});
