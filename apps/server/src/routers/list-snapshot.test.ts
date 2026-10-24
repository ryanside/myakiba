import { expect, mock, spyOn, test } from "bun:test";
import { SQL } from "bun";
import { Elysia } from "elysia";
import { initLogger } from "evlog";
import * as authSchema from "@myakiba/db/schema/auth";
import * as figureSchema from "@myakiba/db/schema/figure";
import { createTestDatabase } from "../../test/database";

const { collection, item, item_release, order } = figureSchema;

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
const { default: ordersRouter } = await import("./orders/index");
const app = new Elysia({ prefix: "/api" }).use(ordersRouter);

const userId = "user-1";
const pauseLock = 984_149;

test("a delete committed while a page is read leaves its rows and totals in agreement", async () => {
  await db.insert(authSchema.user).values({
    id: userId,
    name: "Ryan",
    email: "r@example.com",
    username: "ryan",
  });
  await db.insert(item).values({ id: "item-1", externalId: 101, title: "Miku" });
  await db
    .insert(item_release)
    .values({ id: "00000000-0000-4000-8000-000000000001", itemId: "item-1", date: "2026-01-01" });
  await db.insert(order).values({ id: "order-1", userId, title: "AmiAmi" });
  await db.insert(collection).values({
    id: "c-1",
    userId,
    itemId: "item-1",
    orderId: "order-1",
    releaseId: "00000000-0000-4000-8000-000000000001",
  });
  // Every read of item_release now waits for the pause lock, after its statement took a snapshot.
  await db.execute("ALTER TABLE item_release RENAME TO item_release_rows");
  await db.execute(
    `CREATE VIEW item_release AS SELECT * FROM item_release_rows WHERE pg_advisory_xact_lock_shared(${pauseLock})::text = ''`,
  );

  const controller = new SQL({ url: process.env.DATABASE_URL, max: 1 });
  // The pool keeps one free connection, so a second statement of the request queues behind the first.
  const held = await Promise.all(
    Array.from({ length: 9 }, () => db.$client.reserve({ signal: AbortSignal.timeout(5000) })),
  );
  await controller`select pg_advisory_lock(${pauseLock})`;
  try {
    const response = app.handle(
      new Request("http://localhost/api/orders/order-1/items", {
        headers: { "x-test-user": userId },
      }),
    );
    let paused = false;
    for (let attempt = 0; attempt < 100 && !paused; attempt++) {
      const waiting =
        await controller`select pid from pg_stat_activity where datname = current_database() and wait_event = 'advisory'`;
      paused = waiting.length > 0;
      if (!paused) await Bun.sleep(20);
    }
    expect(paused).toBe(true);
    await controller`delete from collection where id = 'c-1'`;
    await controller`select pg_advisory_unlock(${pauseLock})`;

    const answered = await response;
    const body = (await answered.json()) as {
      items: { id: string }[];
      totalCount: number;
    };
    expect({
      ids: body.items.map((row) => row.id),
      totalCount: body.totalCount,
    }).toEqual({ ids: ["c-1"], totalCount: 1 });
  } finally {
    await controller`select pg_advisory_unlock_all()`;
    await Promise.all(held.map((connection) => connection.release()));
    await controller.close();
  }
}, 15_000);

test("an insert committed while a page past the end is read makes the re-read return the page it reaches", async () => {
  // Runs after the test above, so item_release is already the view that waits for the pause lock.
  await db.insert(order).values({ id: "order-2", userId, title: "HLJ" });
  await db.insert(collection).values({
    id: "c-2",
    userId,
    itemId: "item-1",
    orderId: "order-2",
    releaseId: "00000000-0000-4000-8000-000000000001",
    createdAt: new Date("2026-01-01T00:00:00Z"),
  });

  const controller = new SQL({ url: process.env.DATABASE_URL, max: 1 });
  const transactions = spyOn(db, "transaction");
  await controller`select pg_advisory_lock(${pauseLock})`;
  try {
    const response = app.handle(
      new Request("http://localhost/api/orders/order-2/items?limit=1&offset=1", {
        headers: { "x-test-user": userId },
      }),
    );
    let paused = false;
    for (let attempt = 0; attempt < 100 && !paused; attempt++) {
      const waiting =
        await controller`select pid from pg_stat_activity where datname = current_database() and wait_event = 'advisory'`;
      paused = waiting.length > 0;
      if (!paused) await Bun.sleep(20);
    }
    expect(paused).toBe(true);
    await controller`insert into collection (id, user_id, item_id, order_id, release_id, tags, created_at) values ('c-3', ${userId}, 'item-1', 'order-2', '00000000-0000-4000-8000-000000000001', '{}', '2026-02-01T00:00:00Z')`;
    await controller`select pg_advisory_unlock(${pauseLock})`;

    const answered = await response;
    const body = (await answered.json()) as {
      items: { id: string }[];
      totalCount: number;
    };
    expect({
      ids: body.items.map((row) => row.id),
      totalCount: body.totalCount,
    }).toEqual({ ids: ["c-2"], totalCount: 2 });
    expect(transactions).not.toHaveBeenCalled();
  } finally {
    transactions.mockRestore();
    await controller`select pg_advisory_unlock_all()`;
    await controller.close();
  }
}, 15_000);

test("a page past the end with no new rows reads its totals in one more statement, without a transaction", async () => {
  const transactions = spyOn(db, "transaction");
  try {
    const response = await app.handle(
      new Request("http://localhost/api/orders/order-2/items?limit=1&offset=5", {
        headers: { "x-test-user": userId },
      }),
    );
    expect(await response.json()).toEqual({ items: [], totalCount: 2 });
    expect(transactions).not.toHaveBeenCalled();
  } finally {
    transactions.mockRestore();
  }
});
