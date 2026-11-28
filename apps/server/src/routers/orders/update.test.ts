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
  await db
    .insert(item)
    .values({ id: "item-1", ownerId: userId, externalId: 186, title: "Nendoroid Hatsune Miku" });
  await db.insert(order).values({
    id: "order-1",
    userId,
    title: "AmiAmi preorder",
    shop: "AmiAmi",
    orderDate: "2026-01-05",
  });
  await db.insert(collection).values({
    id: "collection-1",
    userId,
    itemId: "item-1",
    orderId: "order-1",
    status: "Ordered",
    shop: "AmiAmi",
    orderDate: "2026-01-05",
  });
});

const editedOrder = {
  status: "Shipped",
  paid: true,
  title: "Combined shipment",
  shop: "HLJ",
  orderDate: "2026-01-06",
  releaseDate: { start: "2026-03-01", precision: "month" },
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

const rejectedFields = {
  id: "client-chosen-id",
  userId: "user-2",
  createdAt: "2001-01-01T00:00:00.000Z",
  updatedAt: "2001-01-01T00:00:00.000Z",
  unknownField: "x",
} as const;

/** What the Orders table and the edit form sent before the route refused them. */
const readOnlyOrderFields = {
  orderId: "order-1",
  payment: "paid",
  total: 2985,
  itemCount: 1,
  images: [],
} as const;

type OrderField =
  | string
  | number
  | boolean
  | null
  | readonly never[]
  | { readonly start: string; readonly precision: string };

const put = (
  edited: Readonly<Record<string, OrderField>>,
  cascadeOptions: readonly string[],
  topLevel: Readonly<Record<string, string>> = {},
) =>
  app.handle(
    new Request("http://localhost/api/orders/order-1", {
      method: "PUT",
      headers: { "x-test-user": userId, "content-type": "application/json" },
      body: JSON.stringify({ order: edited, cascadeOptions, ...topLevel }),
    }),
  );

const readOrder = async () => {
  const [row] = await db.select().from(order).where(eq(order.id, "order-1"));
  if (!row) throw new Error("order-1 is gone");
  return row;
};

const readItem = async () => {
  const [row] = await db.select().from(collection).where(eq(collection.id, "collection-1"));
  if (!row) throw new Error("collection-1 is gone");
  return row;
};

const readState = async () => ({ order: await readOrder(), item: await readItem() });

describe("an Order edit accepts only the fields a user edits", () => {
  test.each(Object.entries({ ...rejectedFields, ...readOnlyOrderFields }))(
    "order.%s answers 422 and writes nothing",
    async (field, value) => {
      const before = await readState();

      const response = await put({ ...editedOrder, [field]: value }, ["status"]);

      expect(response.status).toBe(422);
      expect(await response.json()).toMatchObject({
        errors: [{ code: "unrecognized_keys", keys: [field], path: ["order"] }],
      });
      expect(await readState()).toEqual(before);
    },
  );

  test.each(Object.entries(rejectedFields))(
    "a top-level %s answers 422 and writes nothing",
    async (field, value) => {
      const before = await readState();

      const response = await put(editedOrder, ["status"], { [field]: value });

      expect(response.status).toBe(422);
      expect(await response.json()).toMatchObject({
        errors: [{ code: "unrecognized_keys", keys: [field], path: [] }],
      });
      expect(await readState()).toEqual(before);
    },
  );
});

describe("an Order edit writes each shape the app sends", () => {
  test("the edit form stores every user-editable field and cascades the options it names", async () => {
    const before = await readState();

    const response = await put(editedOrder, ["status", "shop"]);

    expect(response.status).toBe(200);
    const after = await readState();
    expect(after.order).toEqual({
      ...editedOrder,
      releaseDate: "2026-03-01",
      releaseDatePrecision: "month",
      id: "order-1",
      userId,
      createdAt: before.order.createdAt,
      updatedAt: expect.any(Date),
    });
    expect(after.item).toEqual({ ...before.item, status: "Shipped", shop: "HLJ" });
  });

  test("a status change sets the Order's status and copies it to its items", async () => {
    const before = await readState();

    const response = await put({ status: "Shipped" }, ["status"]);

    expect(response.status).toBe(200);
    const after = await readState();
    expect(after.order).toEqual({
      ...before.order,
      status: "Shipped",
      updatedAt: expect.any(Date),
    });
    expect(after.item).toEqual({ ...before.item, status: "Shipped" });
  });

  test("a Paid change sets the Order's Paid and leaves its items alone", async () => {
    const before = await readState();

    const response = await put({ paid: true }, []);

    expect(response.status).toBe(200);
    const after = await readState();
    expect(after.order).toEqual({ ...before.order, paid: true, updatedAt: expect.any(Date) });
    expect(after.item).toEqual(before.item);
  });

  test("a Paid cascade option, as a tab opened before Paid left the items sends, answers 422 and changes nothing", async () => {
    const before = await readState();

    const response = await put({ paid: true }, ["paid"]);

    expect(response.status).toBe(422);
    expect(await readState()).toEqual(before);
  });

  test.each([
    ["sets", "2026-02-20"],
    ["clears", null],
  ] as const)("a date change %s one date and leaves the items alone", async (_, date) => {
    const before = await readState();

    const response = await put({ orderDate: date }, []);

    expect(response.status).toBe(200);
    const after = await readState();
    expect(after.order).toEqual({ ...before.order, orderDate: date, updatedAt: expect.any(Date) });
    expect(after.item).toEqual(before.item);
  });

  test("a cascade option whose field the edit leaves out leaves that field on the items alone", async () => {
    const before = await readState();

    const response = await put({ status: "Shipped" }, ["status", "orderDate"]);

    expect(response.status).toBe(200);
    const after = await readState();
    expect(after.order).toEqual({
      ...before.order,
      status: "Shipped",
      updatedAt: expect.any(Date),
    });
    expect(after.item).toEqual({ ...before.item, status: "Shipped" });
  });
});

describe("an Order edit copies to its items only what it changed", () => {
  const itemWithOwnValues = {
    id: "collection-2",
    userId,
    itemId: "item-2",
    orderId: "order-1",
    status: "Owned",
    shop: "HLJ",
    orderDate: "2025-12-30",
    paymentDate: "2026-02-01",
    shippingMethod: "EMS",
  } as const;

  beforeEach(async () => {
    await db
      .insert(item)
      .values({ id: "item-2", ownerId: userId, externalId: 187, title: "figma Rin" });
    await db.insert(collection).values(itemWithOwnValues);
  });

  const readItems = async () =>
    db.select().from(collection).where(eq(collection.orderId, "order-1")).orderBy(collection.id);

  const readPair = async () => {
    const [following, own, ...rest] = await readItems();
    if (!following || !own || rest.length > 0) throw new Error("order-1 should hold two items");
    return { following, own };
  };

  const everyCascadeOption = [
    "status",
    "shop",
    "orderDate",
    "paymentDate",
    "shippingDate",
    "collectionDate",
    "shippingMethod",
  ];

  test("a title change leaves every item as it was, even naming every cascade option", async () => {
    const stored = await readOrder();
    const before = await readItems();

    const response = await put(
      {
        status: stored.status,
        paid: stored.paid,
        title: "Renamed",
        shop: stored.shop,
        orderDate: stored.orderDate,
        releaseDate: stored.releaseDate,
        paymentDate: stored.paymentDate,
        shippingDate: stored.shippingDate,
        collectionDate: stored.collectionDate,
        shippingMethod: stored.shippingMethod,
        shippingFee: stored.shippingFee,
        taxes: stored.taxes,
        duties: stored.duties,
        tariffs: stored.tariffs,
        miscFees: stored.miscFees,
        notes: stored.notes,
      },
      everyCascadeOption,
    );

    expect(response.status).toBe(200);
    const renamed = await readOrder();
    expect(renamed.title).toBe("Renamed");
    expect(await readItems()).toEqual(before);
  });

  test("a changed field moves only to the items that held the Order's old value", async () => {
    const { following, own } = await readPair();

    const response = await put(
      { status: "Shipped", paid: true, shop: "Mandarake", paymentDate: "2026-03-01" },
      ["status", "shop", "paymentDate"],
    );

    expect(response.status).toBe(200);
    expect(await readItems()).toEqual([
      { ...following, status: "Shipped", shop: "Mandarake", paymentDate: "2026-03-01" },
      own,
    ]);
  });

  test("a cleared date clears only the items that held the Order's date", async () => {
    const { following, own } = await readPair();

    const response = await put({ orderDate: null }, ["orderDate"]);

    expect(response.status).toBe(200);
    expect(await readItems()).toEqual([{ ...following, orderDate: null }, own]);
  });
});
