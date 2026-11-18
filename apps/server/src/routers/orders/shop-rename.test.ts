import { beforeEach, expect, mock, test } from "bun:test";
import { Elysia } from "elysia";
import { initLogger } from "evlog";
import { asc, eq, sql } from "drizzle-orm";
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
const { default: ordersRouter } = await import("./index");
const { default: vocabularyRouter } = await import("../vocabulary/index");
const app = new Elysia({ prefix: "/api" }).use(ordersRouter).use(vocabularyRouter);

const userId = "user-1";

beforeEach(async () => {
  await db.execute('TRUNCATE "user", item CASCADE');
  await db
    .insert(authSchema.user)
    .values({ id: userId, name: "Ryan", email: "r@example.com", username: "ryan" });
  await db
    .insert(item)
    .values({ id: "item-1", ownerId: userId, externalId: 186, title: "Nendoroid Hatsune Miku" });
  await db.insert(order).values([
    { id: "order-1", userId, title: "AmiAmi preorder", shop: "AmiAmi" },
    { id: "order-2", userId, title: "HLJ preorder", shop: "HLJ" },
  ]);
  // The Order Item comes first, so a rename reaches it before the item the test holds.
  await db.insert(collection).values({
    id: "c-ordered",
    userId,
    itemId: "item-1",
    orderId: "order-1",
    status: "Ordered",
    shop: "AmiAmi",
  });
  await db
    .insert(collection)
    .values({ id: "c-shelf", userId, itemId: "item-1", status: "Owned", shop: "AmiAmi" });
});

const send = async (method: string, path: string, body: string) => {
  const response = await app.handle(
    new Request(`http://localhost/api${path}`, {
      method,
      headers: { "x-test-user": userId, "content-type": "application/json" },
      body,
    }),
  );
  return response.status;
};

/** Locks the item outside any Order, so a rename stops partway through its rows. */
async function holdingTheShelfItem() {
  const locked = Promise.withResolvers<null>();
  const commit = Promise.withResolvers<null>();
  const open = db.transaction(async (tx) => {
    await tx
      .select({ id: collection.id })
      .from(collection)
      .where(eq(collection.id, "c-shelf"))
      .for("no key update");
    locked.resolve(null);
    await commit.promise;
  });
  await locked.promise;
  return async () => {
    commit.resolve(null);
    await open;
  };
}

async function waitForLockWaits(count: number) {
  for (;;) {
    const [waiting] = await db.execute<{ count: number }>(
      sql`SELECT count(*)::int AS count FROM pg_stat_activity
        WHERE wait_event_type = 'Lock' AND datname = current_database()`,
    );
    if (waiting && waiting.count >= count) return;
    await Bun.sleep(10);
  }
}

const mergeBody = JSON.stringify({
  orderIds: ["order-1", "order-2"],
  newOrder: {
    status: "Ordered",
    paid: false,
    title: "Combined shipment",
    shop: "HLJ",
    orderDate: null,
    releaseDate: null,
    paymentDate: null,
    shippingDate: null,
    collectionDate: null,
    shippingMethod: "EMS",
    shippingFee: 0,
    taxes: 0,
    duties: 0,
    tariffs: 0,
    miscFees: 0,
    notes: "",
  },
  cascadeOptions: [],
});

test.each([
  {
    write: "a delete of an Order from that shop",
    call: () => send("DELETE", "/orders/", JSON.stringify({ orderIds: ["order-1"] })),
    left: [{ id: "c-shelf", shop: "Amiami JP" }],
  },
  {
    write: "a merge of an Order from that shop",
    call: () => send("POST", "/orders/merge", mergeBody),
    left: [
      { id: "c-ordered", shop: "Amiami JP" },
      { id: "c-shelf", shop: "Amiami JP" },
    ],
  },
])("a shop rename and $write at once both finish", async ({ call, left }) => {
  const commit = await holdingTheShelfItem();

  const renamed = send(
    "POST",
    "/vocabulary/shops/rename",
    JSON.stringify({ from: ["AmiAmi"], to: "Amiami JP" }),
  );
  await waitForLockWaits(1);
  const written = call();
  await waitForLockWaits(2);
  await commit();

  expect({ renamed: await renamed, written: await written }).toEqual({
    renamed: 200,
    written: 200,
  });
  expect(
    await db
      .select({ id: collection.id, shop: collection.shop })
      .from(collection)
      .orderBy(asc(collection.id)),
  ).toEqual([...left]);
});
