import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { SQL } from "bun";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import { eq } from "drizzle-orm";
import { Elysia } from "elysia";
import { initLogger } from "evlog";
import * as authSchema from "@myakiba/db/schema/auth";
import * as figureSchema from "@myakiba/db/schema/figure";

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

const serverUrl = process.env.TEST_DATABASE_URL;
if (!serverUrl) {
  throw new Error(
    "Set TEST_DATABASE_URL to a Postgres server this test can create databases on, such as postgres://test:test@127.0.0.1:5432/test",
  );
}
const databaseName = `test_${crypto.randomUUID().replaceAll("-", "")}`;
const server = new SQL({ url: serverUrl });
const databaseUrl = new URL(serverUrl);
databaseUrl.pathname = `/${databaseName}`;
process.env.DATABASE_URL = databaseUrl.toString();

const disarmTrigger =
  "CREATE OR REPLACE FUNCTION fail_when_armed() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN OLD; END $$";

const { db } = await import("@myakiba/db/client");
const { default: ordersRouter } = await import("./index");
const app = new Elysia({ prefix: "/api" }).use(ordersRouter);

const removeItems = (collectionIds: string[]) =>
  app.handle(
    new Request("http://localhost/api/orders/items", {
      method: "DELETE",
      headers: { "x-test-user": userId, "content-type": "application/json" },
      body: JSON.stringify({ collectionIds }),
    }),
  );

beforeAll(async () => {
  await server.unsafe(`CREATE DATABASE ${databaseName}`);
  await db.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm");
  const schemaStatements = await generateMigration(
    generateDrizzleJson({}),
    generateDrizzleJson({ ...authSchema, ...figureSchema }),
  );
  for (const statement of schemaStatements) await db.execute(statement);
  await db.execute(disarmTrigger);
  await db.execute(
    "CREATE TRIGGER fail_collection_delete BEFORE DELETE ON collection FOR EACH ROW EXECUTE FUNCTION fail_when_armed()",
  );
}, 30_000);

afterAll(async () => {
  await db.$client.close();
  await server.unsafe(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`);
  await server.close();
});

const userId = "user-1";
const orderId = "order-1";
const ownedId = "collection-owned";
const orderedId = "collection-ordered";

beforeEach(async () => {
  await db.execute(disarmTrigger);
  await db.execute('TRUNCATE "user", item CASCADE');
  await db
    .insert(authSchema.user)
    .values({ id: userId, name: "Ryan", email: "r@example.com", username: "ryan" });
  await db.insert(item).values({ id: "item-1", externalId: 186, title: "Nendoroid Hatsune Miku" });
  await db.insert(order).values({ id: orderId, userId, title: "AmiAmi preorder" });
  await db.insert(collection).values([
    { id: ownedId, userId, itemId: "item-1", orderId, status: "Owned" },
    { id: orderedId, userId, itemId: "item-1", orderId, status: "Ordered" },
  ]);
});

const readCollection = (owner = userId) =>
  db
    .select({ id: collection.id, orderId: collection.orderId })
    .from(collection)
    .where(eq(collection.userId, owner))
    .orderBy(collection.id);

describe("removing items from an order", () => {
  test("owned items leave the order and unowned items are deleted", async () => {
    const response = await removeItems([ownedId, orderedId]);

    expect(response.status).toBe(200);
    expect(await readCollection()).toEqual([{ id: ownedId, orderId: null }]);
  });

  test("a failed delete leaves every item in the order", async () => {
    await db.execute(
      `CREATE OR REPLACE FUNCTION fail_when_armed() RETURNS trigger LANGUAGE plpgsql AS $$
       BEGIN RAISE EXCEPTION 'injected collection delete failure'; END $$`,
    );

    const response = await removeItems([ownedId, orderedId]);

    expect({ status: response.status, body: await response.text() }).toEqual({
      status: 500,
      body: "Failed to delete order items",
    });

    expect(await readCollection()).toEqual([
      { id: orderedId, orderId },
      { id: ownedId, orderId },
    ]);
  });

  test("another user's items stay in their order when their ids are passed", async () => {
    await db
      .insert(authSchema.user)
      .values({ id: "user-2", name: "Aki", email: "a@example.com", username: "aki" });
    await db.insert(order).values({ id: "order-2", userId: "user-2", title: "HLJ preorder" });
    await db.insert(collection).values([
      {
        id: "other-owned",
        userId: "user-2",
        itemId: "item-1",
        orderId: "order-2",
        status: "Owned",
      },
      {
        id: "other-ordered",
        userId: "user-2",
        itemId: "item-1",
        orderId: "order-2",
        status: "Ordered",
      },
    ]);

    await removeItems([ownedId, orderedId, "other-owned", "other-ordered"]);

    expect(await readCollection("user-2")).toEqual([
      { id: "other-ordered", orderId: "order-2" },
      { id: "other-owned", orderId: "order-2" },
    ]);
  });
});
