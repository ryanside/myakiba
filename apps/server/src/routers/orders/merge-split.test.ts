import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { SQL } from "bun";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import { eq } from "drizzle-orm";
import { Elysia } from "elysia";
import { initLogger } from "evlog";
import * as authSchema from "@myakiba/db/schema/auth";
import * as figureSchema from "@myakiba/db/schema/figure";

const { collection, item, order } = figureSchema;

initLogger({ enabled: false });

mock.module("@myakiba/auth/server", () => ({
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
await server.unsafe(`CREATE DATABASE ${databaseName}`);
const databaseUrl = new URL(serverUrl);
databaseUrl.pathname = `/${databaseName}`;
process.env.DATABASE_URL = databaseUrl.toString();

const { db } = await import("@myakiba/db/client");
await db.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm");
const schemaStatements = await generateMigration(
  generateDrizzleJson({}),
  generateDrizzleJson({ ...authSchema, ...figureSchema }),
);
for (const statement of schemaStatements) await db.execute(statement);

const { default: ordersRouter } = await import("./index");
const app = new Elysia({ prefix: "/api" }).use(ordersRouter);

afterAll(async () => {
  await db.$client.close();
  await server.unsafe(`DROP DATABASE ${databaseName} WITH (FORCE)`);
  await server.close();
});

const userId = "user-1";

beforeEach(async () => {
  await db.execute('TRUNCATE "user", item CASCADE');
  await db
    .insert(authSchema.user)
    .values({ id: userId, name: "Ryan", email: "r@example.com", username: "ryan" });
  await db.insert(item).values({ id: "item-1", externalId: 186, title: "Nendoroid Hatsune Miku" });
  await db.insert(order).values([
    { id: "order-1", userId, title: "AmiAmi preorder" },
    { id: "order-2", userId, title: "HLJ preorder" },
  ]);
  await db.insert(collection).values([
    { id: "collection-1", userId, itemId: "item-1", orderId: "order-1" },
    { id: "collection-2", userId, itemId: "item-1", orderId: "order-2" },
  ]);
});

const newOrder = {
  status: "Shipped",
  title: "Combined shipment",
  shop: "AmiAmi",
  orderDate: "2026-01-05",
  releaseDate: "2026-03-01",
  paymentDate: "2026-02-20",
  shippingDate: "2026-03-02",
  collectionDate: "2026-03-09",
  shippingMethod: "EMS",
  shippingFee: 2350,
  taxes: 410,
  duties: 120,
  tariffs: 75,
  miscFees: 30,
  notes: "Packed together",
} as const;

const serverOwnedFields = {
  id: "client-chosen-id",
  userId,
  createdAt: "2001-01-01T00:00:00.000Z",
  updatedAt: "2001-01-01T00:00:00.000Z",
  importedFrom: "mfc",
} as const;

type NewOrderBody = typeof newOrder & Partial<Record<keyof typeof serverOwnedFields, string>>;

const writes = {
  merge: (body: NewOrderBody) => ({
    orderIds: ["order-1", "order-2"],
    newOrder: body,
    cascadeOptions: [],
  }),
  split: (body: NewOrderBody) => ({
    collectionIds: ["collection-1"],
    newOrder: body,
    cascadeOptions: [],
  }),
};
type Route = keyof typeof writes;
const routes: Route[] = ["merge", "split"];

const post = (route: Route, body: NewOrderBody) =>
  app.handle(
    new Request(`http://localhost/api/orders/${route}`, {
      method: "POST",
      headers: { "x-test-user": userId, "content-type": "application/json" },
      body: JSON.stringify(writes[route](body)),
    }),
  );

const readOrders = () =>
  db.select().from(order).where(eq(order.userId, userId)).orderBy(order.createdAt, order.id);

describe("merge and split accept only the fields a user edits", () => {
  test.each(
    routes.flatMap((route) =>
      Object.entries(serverOwnedFields).map(([field, value]) => [route, field, value] as const),
    ),
  )("%s with newOrder.%s answers 422 and writes nothing", async (route, field, value) => {
    const before = await readOrders();

    const response = await post(route, { ...newOrder, [field]: value });

    expect(response.status).toBe(422);
    expect(await readOrders()).toEqual(before);
  });

  test.each(routes)("%s stores every user-editable field", async (route) => {
    const response = await post(route, newOrder);

    expect(response.status).toBe(200);
    const orders = await readOrders();
    expect(orders.filter((row) => !["order-1", "order-2"].includes(row.id))).toEqual([
      {
        ...newOrder,
        id: expect.any(String),
        userId,
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
      },
    ]);
  });
});
