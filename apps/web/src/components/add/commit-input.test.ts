import { describe, expect, test } from "bun:test";
import { addCommitSchema } from "@myakiba/contracts/add/schema";
import type { DraftRow } from "./add-draft";
import {
  DEFAULT_ORDER_FIELDS,
  DEFAULT_SHARED,
  buildCommitChoices,
  commitPlan,
  commitSummary,
  defaultOrderTitle,
  destinationOf,
  presetDestination,
  priceFieldId,
} from "./commit-input";
import type { CommitRow, Destination, Ownership } from "./commit-input";

const row = (itemId: string, overrides: DraftRow["overrides"] = {}): CommitRow => ({
  row: { itemId, overrides, selected: true },
  title: `Title ${itemId}`,
});

const to = (ownership: Ownership | null, rest: Partial<Destination> = {}): Destination => ({
  ownership,
  wishlist: false,
  lists: [],
  ...rest,
});

const COLLECTION: Ownership = { kind: "collection", shared: DEFAULT_SHARED };
const NEW_ORDER: Ownership = {
  kind: "order",
  order: { kind: "new", fields: DEFAULT_ORDER_FIELDS },
};
const EXISTING: Ownership = {
  kind: "order",
  order: { kind: "existing", order: { id: "orderid12345", title: "Spring order" } },
};
const COMMIT_ID = "0b2f1c3e-8a7d-4e6f-9b1a-2c3d4e5f6a7b";

function built(rows: readonly CommitRow[], destination: Destination) {
  const choices = buildCommitChoices(rows, destination);
  if (choices.isErr()) throw new Error(`issues: ${JSON.stringify(choices.error)}`);
  // Everything the page builds must pass the server's contract.
  addCommitSchema.parse({ ...choices.value, commitId: COMMIT_ID });
  return choices.value;
}

describe("buildCommitChoices", () => {
  test("Not owned sends each row bare, whatever details it holds", () => {
    const choices = built([row("a", { price: "12.00", count: 3, notes: "hold" })], {
      ...to({ kind: "none" }),
      wishlist: true,
    });
    expect(choices.rows).toEqual([{ itemId: "a", price: null }]);
    expect(choices.ownership).toEqual({ kind: "none" });
  });

  test("a blank price asks for the release price default and a typed one is minor units", () => {
    const choices = built(
      [row("a"), row("b", { price: "12.50" }), row("c", { price: "0" })],
      to(COLLECTION),
    );
    expect(choices.rows.map(({ price }) => price)).toEqual([null, 1250, 0]);
  });

  test("Collection sends the status's date in the shared fields and nulls the others", () => {
    const choices = built(
      [row("a")],
      to({
        kind: "collection",
        shared: { ...DEFAULT_SHARED, status: "Shipped", date: "2026-05-01", shop: " AmiAmi " },
      }),
    );
    expect(choices.ownership).toEqual({
      kind: "collection",
      shared: {
        status: "Shipped",
        shop: "AmiAmi",
        orderDate: null,
        paymentDate: null,
        shippingDate: "2026-05-01",
        collectionDate: null,
        shippingMethod: "n/a",
        condition: "New",
        count: 1,
      },
    });
  });

  test("a Collection row keeps its overrides and leaves out what it left blank", () => {
    const [sent] = built(
      [
        row("a", {
          count: 2,
          condition: "Pre-Owned",
          score: 8,
          shop: " Mandarake ",
          orderDate: null,
          tags: ["shelf"],
          notes: "boxed",
        }),
        row("b", { score: 0, tags: [], notes: "", shop: "  " }),
      ],
      to(COLLECTION),
    ).rows;
    expect(sent).toEqual({
      itemId: "a",
      price: null,
      count: 2,
      condition: "Pre-Owned",
      score: "8",
      tags: ["shelf"],
      notes: "boxed",
      shop: "Mandarake",
      orderDate: null,
    });
    const choices = built(
      [row("b", { score: 0, tags: [], notes: "", shop: "  " })],
      to(COLLECTION),
    );
    expect(choices.rows).toEqual([{ itemId: "b", price: null }]);
  });

  test("an Order row drops the Shop and dates its Order gives it", () => {
    const [sent] = built(
      [row("a", { shop: "Mandarake", orderDate: "2026-01-01", score: 5 })],
      to(NEW_ORDER),
    ).rows;
    expect(sent).toEqual({ itemId: "a", price: null, score: "5" });
  });

  test("a new Order writes its default title from the selected rows until the user types one", () => {
    const fields = (ownership: Ownership | null) => {
      const choices = built([row("a"), row("b"), row("c")], to(ownership));
      if (choices.ownership.kind !== "order" || choices.ownership.order.kind !== "new") {
        throw new Error("not a new order");
      }
      return choices.ownership.order.fields;
    };
    expect(fields(NEW_ORDER).title).toBe("Order · Title a + 2 more");
    expect(
      fields({
        kind: "order",
        order: {
          kind: "new",
          fields: { ...DEFAULT_ORDER_FIELDS, title: "Spring", shippingFee: "3.50" },
        },
      }),
    ).toMatchObject({ title: "Spring", shippingFee: 350, taxes: 0 });
  });

  test("an existing Order sends only its id", () => {
    expect(built([row("a")], to(EXISTING)).ownership).toEqual({
      kind: "order",
      order: { kind: "existing", orderId: "orderid12345" },
    });
  });

  test("the same page builds the same choices, so a retry keeps its commitId", () => {
    const rows = [row("a", { price: "1.00" }), row("b", { tags: ["x"] })];
    const destination = to(COLLECTION, { wishlist: true, lists: [{ id: "l1", title: "L" }] });
    expect(JSON.stringify(built(rows, destination))).toBe(JSON.stringify(built(rows, destination)));
  });

  test("an amount it cannot read names the field that holds it", () => {
    const rows = [row("a", { price: "12.345" })];
    const choices = buildCommitChoices(rows, to(COLLECTION));
    expect(choices.isErr() && choices.error.map(({ fieldId }) => fieldId)).toEqual([
      priceFieldId("a"),
    ]);
  });

  test("nothing chosen builds nothing", () => {
    expect(buildCommitChoices([row("a")], to(null)).isErr()).toBe(true);
  });
});

describe("presetDestination", () => {
  test("only `to` chooses, and nothing is chosen without it", () => {
    expect(presetDestination().kind).toBeNull();
    expect(presetDestination("collection").kind).toBe("collection");
    expect(presetDestination("order-new")).toMatchObject({ kind: "order", order: { kind: "new" } });
    expect(presetDestination("none")).toMatchObject({ kind: "none", wishlist: false });
    expect(presetDestination("wishlist")).toMatchObject({ kind: "none", wishlist: true });
    expect(presetDestination("order:orderid12345")).toMatchObject({
      kind: "order",
      order: { kind: "existing", order: { id: "orderid12345", title: null } },
    });
  });

  test("trying another kind keeps what was typed for the first", () => {
    const form = {
      ...presetDestination("collection"),
      shared: { ...DEFAULT_SHARED, shop: "AmiAmi" },
    };
    expect(destinationOf({ ...form, kind: "none" }).ownership).toEqual({ kind: "none" });
    expect(destinationOf(form).ownership).toEqual({ kind: "collection", shared: form.shared });
  });
});

test("defaultOrderTitle names the first Item and counts the rest", () => {
  expect(defaultOrderTitle([])).toBe("New Order");
  expect(defaultOrderTitle(["Miku"])).toBe("Order · Miku");
  expect(defaultOrderTitle(["Miku", "Rem"])).toBe("Order · Miku + 1 more");
});

describe("commitPlan", () => {
  const verified = { emailVerified: true };
  const list = { id: "l1", title: "Display shelf" };

  test.each([
    ["collection", to(COLLECTION), "Add 4 to collection"],
    ["a new order", to(NEW_ORDER), "Create order with 4"],
    ["an existing order", to(EXISTING), "Add 4 to order Spring order"],
    ["the Wishlist", to({ kind: "none" }, { wishlist: true }), "Add 4 to Wishlist"],
    ["a List", to({ kind: "none" }, { lists: [list] }), "Add 4 to ‘Display shelf’"],
    [
      "the Wishlist and a List",
      to({ kind: "none" }, { wishlist: true, lists: [list] }),
      "Add 4 to Wishlist and ‘Display shelf’",
    ],
    [
      "several Lists",
      to({ kind: "none" }, { lists: [list, { id: "l2", title: "B" }] }),
      "Add 4 to 2 Lists",
    ],
  ])("the label for %s says what will happen", (_name, destination, label) => {
    expect(commitPlan(destination, 4, verified)).toEqual({ kind: "commit", label });
  });

  test("Not owned alone is Done", () => {
    expect(commitPlan(to({ kind: "none" }), 4, verified)).toEqual({ kind: "done", label: "Done" });
  });

  test("it waits for a choice with an effect", () => {
    expect(commitPlan(to(null), 4, verified).kind).toBe("blocked");
    expect(commitPlan(to(COLLECTION), 0, verified).kind).toBe("blocked");
    expect(
      commitPlan(to({ kind: "order", order: { kind: "existing", order: null } }), 4, verified).kind,
    ).toBe("blocked");
  });

  test("an unverified email blocks every commit and says why", () => {
    expect(commitPlan(to(COLLECTION), 4, { emailVerified: false })).toEqual({
      kind: "blocked",
      label: "Verify your email to add items",
    });
  });
});

test("the summary names every place the rows will go", () => {
  expect(
    commitSummary(
      to(COLLECTION, { wishlist: true, lists: [{ id: "l1", title: "Display shelf" }] }),
      4,
    ),
  ).toBe("4 new Collection Items (Owned) · on your Wishlist · in ‘Display shelf’");
  expect(commitSummary(to(NEW_ORDER), 1)).toBe("New Order with 1 Order Item (Ordered)");
  expect(commitSummary(to(null), 1)).toBeNull();
});
