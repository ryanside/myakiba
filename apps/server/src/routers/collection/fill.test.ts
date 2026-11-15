import { beforeEach, describe, expect, mock, test } from "bun:test";
import { Elysia } from "elysia";
import { initLogger } from "evlog";
import { asc, eq, sql } from "drizzle-orm";
import type { ItemFill } from "@myakiba/contracts/collection/fill";
import * as authSchema from "@myakiba/db/schema/auth";
import * as figureSchema from "@myakiba/db/schema/figure";
import { createTestDatabase } from "../../../test/database";

const { collection, item, order } = figureSchema;

initLogger({ enabled: false });

await mock.module("@myakiba/auth/server", () => ({
  auth: {
    handler: () => new Response(null, { status: 404 }),
    api: {
      getSession: async ({ headers }: { headers: Headers }) => {
        const id = headers.get("x-test-user");
        return id ? { user: { id }, session: { id: `session-${id}` } } : null;
      },
    },
  },
}));

const db = await createTestDatabase();
const { default: collectionRouter } = await import("./index");
const app = new Elysia({ prefix: "/api" }).use(collectionRouter);

const userId = "user-1";
const createdAt = new Date("2026-01-05T10:20:30.456Z");
const FILLED = { status: 200, body: "Collection items filled successfully" };

beforeEach(async () => {
  await db.execute('TRUNCATE "user", item CASCADE');
  await db
    .insert(authSchema.user)
    .values({ id: userId, name: "Ryan", email: "r@example.com", username: "ryan" });
  await db
    .insert(item)
    .values({ id: "item-1", ownerId: userId, externalId: 186, title: "Nendoroid Hatsune Miku" });
  await db
    .insert(order)
    .values({ id: "order-1", userId, title: "AmiAmi preorder", shop: "AmiAmi" });
  await db.insert(collection).values([
    {
      id: "c-1",
      userId,
      itemId: "item-1",
      status: "Owned",
      shop: "HLJ",
      orderDate: "2026-01-01",
      notes: "boxed",
      tags: ["shelf", "boxed"],
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: "c-2",
      userId,
      itemId: "item-1",
      orderId: "order-1",
      status: "Ordered",
      createdAt,
      updatedAt: createdAt,
    },
    { id: "c-3", userId, itemId: "item-1", status: "Owned", createdAt, updatedAt: createdAt },
  ]);
});

type Json = string | number | boolean | null | readonly Json[] | JsonObject;
type JsonObject = { readonly [key: string]: Json };

const fill = async (body: JsonObject) => {
  const response = await app.handle(
    new Request("http://localhost/api/collection/fill", {
      method: "PUT",
      headers: { "x-test-user": userId, "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  return { status: response.status, body: await response.text() };
};

const readItems = () => db.select().from(collection).orderBy(asc(collection.id));
const readOrders = () => db.select().from(order).orderBy(asc(order.id));
const rowOf = async (id: string) => {
  const rows = await readItems();
  const row = rows.find((found) => found.id === id);
  if (!row) throw new Error(`no Collection Item ${id}`);
  return row;
};
const tagsOf = async (id: string) => {
  const { tags } = await rowOf(id);
  return tags;
};

const FILLS = [
  [{ field: "status", value: "Shipped" }, "Shipped"],
  [{ field: "paid", value: true }, true],
  [{ field: "price", value: 4200 }, 4200],
  [{ field: "price", value: 0 }, 0],
  [{ field: "count", value: 3 }, 3],
  [{ field: "condition", value: "Pre-Owned" }, "Pre-Owned"],
  [{ field: "shop", value: " AmiAmi " }, "AmiAmi"],
  [{ field: "shop", value: "" }, ""],
  [{ field: "orderDate", value: "2026-03-01" }, "2026-03-01"],
  [{ field: "orderDate", value: null }, null],
  [{ field: "paymentDate", value: "2026-03-02" }, "2026-03-02"],
  [{ field: "shippingDate", value: "2026-03-03" }, "2026-03-03"],
  [{ field: "collectionDate", value: "2026-03-04" }, "2026-03-04"],
  [{ field: "collectionDate", value: null }, null],
  [{ field: "shippingMethod", value: "SAL" }, "SAL"],
  [{ field: "score", value: "9.5" }, "9.5"],
  [{ field: "notes", value: "Signed" }, "Signed"],
  [{ field: "notes", value: "" }, ""],
] as const satisfies readonly (readonly [Exclude<ItemFill, { field: "tags" }>, unknown])[];

const withoutUpdatedAt = (rows: Awaited<ReturnType<typeof readItems>>) =>
  rows.map(({ updatedAt: _updatedAt, ...row }) => row);

describe("a fill writes its one field to every listed Collection Item and nothing else", () => {
  test.each(FILLS)("%o", async (sent, stored) => {
    const before = await readItems();
    const orders = await readOrders();

    expect(await fill({ ids: ["c-2", "c-1"], fill: sent })).toEqual(FILLED);

    const after = await readItems();
    expect(withoutUpdatedAt(after)).toEqual(
      withoutUpdatedAt(before).map((row) =>
        row.id === "c-3" ? row : { ...row, [sent.field]: stored },
      ),
    );
    expect(after.map(({ id, updatedAt }) => [id, updatedAt > createdAt])).toEqual([
      ["c-1", true],
      ["c-2", true],
      ["c-3", false],
    ]);
    expect(await readOrders()).toEqual(orders);
  });
});

test("a paid fill leaves status alone, and a status fill leaves paid alone", async () => {
  expect(await fill({ ids: ["c-2"], fill: { field: "paid", value: true } })).toEqual(FILLED);
  expect(await rowOf("c-2")).toMatchObject({ status: "Ordered", paid: true });

  expect(await fill({ ids: ["c-2"], fill: { field: "status", value: "Owned" } })).toEqual(FILLED);
  expect(await rowOf("c-2")).toMatchObject({ status: "Owned", paid: true });

  expect(await fill({ ids: ["c-2"], fill: { field: "paid", value: false } })).toEqual(FILLED);
  expect(await rowOf("c-2")).toMatchObject({ status: "Owned", paid: false });
});

test("a tags fill adds each new tag once, in the order sent, after the row's own", async () => {
  const sent = { field: "tags", value: ["mint", "boxed", "mint", "gift"] };

  expect(await fill({ ids: ["c-1", "c-3"], fill: sent })).toEqual(FILLED);

  expect(await tagsOf("c-1")).toEqual(["shelf", "boxed", "mint", "gift"]);
  expect(await tagsOf("c-3")).toEqual(["mint", "boxed", "gift"]);
});

describe("a tags fill keeps every row within 100 tags", () => {
  const tags = (prefix: string, count: number) =>
    Array.from({ length: count }, (_, index) => `${prefix}-${index}`);

  test("a fill that brings a row to 100 tags writes it", async () => {
    await db.update(collection).set({ tags: tags("own", 98) });

    expect(
      await fill({ ids: ["c-1", "c-2"], fill: { field: "tags", value: tags("new", 2) } }),
    ).toEqual(FILLED);

    expect(await tagsOf("c-1")).toHaveLength(100);
  });

  test("a fill that would give one row 101 tags answers 409 and changes no row", async () => {
    await db
      .update(collection)
      .set({ tags: tags("own", 99) })
      .where(eq(collection.id, "c-1"));
    const before = await readItems();

    expect(
      await fill({ ids: ["c-2", "c-1"], fill: { field: "tags", value: tags("new", 2) } }),
    ).toEqual({ status: 409, body: "A Collection Item can hold at most 100 tags" });

    expect(await readItems()).toEqual(before);
  });

  test("a fill of no tags leaves each row's tags as they were", async () => {
    expect(await fill({ ids: ["c-1", "c-3"], fill: { field: "tags", value: [] } })).toEqual(FILLED);

    expect([await tagsOf("c-1"), await tagsOf("c-3")]).toEqual([["shelf", "boxed"], []]);
  });

  test("tags a row already holds do not count again", async () => {
    await db.update(collection).set({ tags: tags("own", 100) });

    expect(await fill({ ids: ["c-1"], fill: { field: "tags", value: tags("own", 3) } })).toEqual(
      FILLED,
    );

    expect(await tagsOf("c-1")).toEqual(tags("own", 100));
  });
});

test.each([
  ["an extra key in the body", { ids: ["c-1"], fill: { field: "paid", value: true }, userId }],
  ["an extra key in the fill", { ids: ["c-1"], fill: { field: "paid", value: true, id: "c-2" } }],
  ["a value of another field's type", { ids: ["c-1"], fill: { field: "paid", value: "Owned" } }],
  ["a release fill", { ids: ["c-1"], fill: { field: "releaseId", value: null } }],
  ["a count of 0", { ids: ["c-1"], fill: { field: "count", value: 0 } }],
])("a fill with %s answers 422 and changes no row", async (_, body) => {
  const before = await readItems();

  expect(await fill(body)).toMatchObject({ status: 422 });

  expect(await readItems()).toEqual(before);
});

async function holdingALockOn(id: string) {
  const locked = Promise.withResolvers<null>();
  const release = Promise.withResolvers<null>();
  const holding = db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM collection WHERE id = ${id} FOR UPDATE`);
    locked.resolve(null);
    await release.promise;
  });
  await locked.promise;
  return async () => {
    release.resolve(null);
    await holding;
  };
}

async function waitForLockWaits(count: number) {
  for (;;) {
    const [waiting] = await db.execute<{ count: number }>(
      sql`SELECT count(*)::int AS count FROM pg_stat_activity
        WHERE wait_event_type = 'Lock' AND query ILIKE 'select%for no key update%'`,
    );
    if (waiting && waiting.count >= count) return;
    await Bun.sleep(10);
  }
}

test("two fills of the same rows given in reverse order both finish", async () => {
  const release = await holdingALockOn("c-2");

  const forward = fill({ ids: ["c-1", "c-2", "c-3"], fill: { field: "tags", value: ["forward"] } });
  const reverse = fill({ ids: ["c-3", "c-2", "c-1"], fill: { field: "tags", value: ["reverse"] } });
  await waitForLockWaits(2);
  await release();

  expect(await Promise.all([forward, reverse])).toEqual([FILLED, FILLED]);
  for (const row of await readItems()) {
    expect(row.tags.filter((tag) => tag === "forward" || tag === "reverse").toSorted()).toEqual([
      "forward",
      "reverse",
    ]);
  }
});
