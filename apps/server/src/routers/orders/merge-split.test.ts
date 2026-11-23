import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { SQL } from "bun";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import { eq } from "drizzle-orm";
import { Elysia } from "elysia";
import { initLogger } from "evlog";
import * as authSchema from "@myakiba/db/schema/auth";
import * as figureSchema from "@myakiba/db/schema/figure";
import * as z from "zod";
import { newOrderSchema } from "@myakiba/contracts/orders/schema";

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
  paid: true,
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

const rejectedFields = {
  id: "client-chosen-id",
  userId,
  createdAt: "2001-01-01T00:00:00.000Z",
  updatedAt: "2001-01-01T00:00:00.000Z",
  unknownField: "x",
} as const;

type NewOrderBody = typeof newOrder & Partial<Record<keyof typeof rejectedFields, string>>;

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
      Object.entries(rejectedFields).map(([field, value]) => [route, field, value] as const),
    ),
  )("%s with newOrder.%s answers 422 and writes nothing", async (route, field, value) => {
    const before = await readOrders();

    const response = await post(route, { ...newOrder, [field]: value });

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      errors: [{ code: "unrecognized_keys", keys: [field], path: ["newOrder"] }],
    });
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

const itemsWithoutOrder = async () => {
  const rows = await db.select().from(collection).orderBy(collection.id);
  return rows.map(({ orderId: _orderId, updatedAt: _updatedAt, ...own }) => own);
};

const blankForm = {
  status: "Ordered",
  paid: false,
  title: "New Order",
  shop: "",
  orderDate: null,
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

const everyCascadeField = [
  "status",
  "paid",
  "shop",
  "orderDate",
  "paymentDate",
  "shippingDate",
  "collectionDate",
  "shippingMethod",
];

const sourceOrders = {
  "order-1": {
    shop: "AmiAmi",
    status: "Owned",
    paid: true,
    orderDate: "2026-01-10",
    releaseDate: "2026-03-01",
    paymentDate: "2026-01-12",
    shippingDate: "2026-03-05",
    collectionDate: "2026-03-10",
    shippingMethod: "EMS",
    shippingFee: 1200,
    taxes: 100,
    duties: 0,
    tariffs: 50,
    miscFees: 10,
    notes: "Box 1",
  },
  "order-2": {
    shop: "AmiAmi",
    status: "Shipped",
    paid: true,
    orderDate: "2026-01-05",
    releaseDate: "2026-04-01",
    paymentDate: "2026-01-20",
    shippingDate: null,
    collectionDate: null,
    shippingMethod: "SAL",
    shippingFee: 800,
    taxes: 200,
    duties: 30,
    tariffs: 0,
    miscFees: 0,
    notes: "",
  },
} as const;

const ownItemValues = {
  "collection-1": {
    status: "Owned",
    shop: "Mandarake",
    orderDate: "2025-12-30",
    paymentDate: "2026-01-02",
    shippingDate: "2026-02-01",
    collectionDate: "2026-02-09",
    shippingMethod: "SURFACE",
  },
  "collection-2": {
    status: "Shipped",
    shop: "",
    orderDate: null,
    paymentDate: "2026-01-21",
    shippingDate: "2026-04-03",
    collectionDate: null,
    shippingMethod: "FEDEX",
  },
} as const;

const seedSources = async () => {
  for (const [id, values] of Object.entries(sourceOrders)) {
    await db.update(order).set(values).where(eq(order.id, id));
  }
  for (const [id, values] of Object.entries(ownItemValues)) {
    await db.update(collection).set(values).where(eq(collection.id, id));
  }
};

describe("merge and split leave every moved item's own values", () => {
  beforeEach(seedSources);

  const target = {
    merge: { orderIds: ["order-1", "order-2"] },
    split: { collectionIds: ["collection-1"] },
  };
  const send = (route: Route, cascadeOptions?: readonly string[]) =>
    app.handle(
      new Request(`http://localhost/api/orders/${route}`, {
        method: "POST",
        headers: { "x-test-user": userId, "content-type": "application/json" },
        body: JSON.stringify({ ...target[route], newOrder: blankForm, cascadeOptions }),
      }),
    );

  test.each(routes)(
    "%s with the form's blank values keeps each moved item's columns",
    async (route) => {
      const before = await itemsWithoutOrder();

      const response = await send(route);

      expect(response.status).toBe(200);
      expect(await itemsWithoutOrder()).toEqual(before);
    },
  );

  test.each(routes)("%s that still names Cascade to Items copies nothing", async (route) => {
    const before = await itemsWithoutOrder();

    const response = await send(route, everyCascadeField);

    expect(response.status).toBe(200);
    expect(await itemsWithoutOrder()).toEqual(before);
  });
});

describe("a merge starts from its source Orders", () => {
  beforeEach(seedSources);

  const draftOf = async (orderIds: readonly string[]) => {
    const response = await app.handle(
      new Request("http://localhost/api/orders/merge-draft", {
        method: "POST",
        headers: { "x-test-user": userId, "content-type": "application/json" },
        body: JSON.stringify({ orderIds }),
      }),
    );
    const json = response.headers.get("content-type")?.includes("json");
    return { status: response.status, body: json ? await response.json() : await response.text() };
  };

  test("the draft takes the shared Shop, the earliest Order Date, the latest other dates, the least advanced status and the summed fees", async () => {
    expect(await draftOf(["order-1", "order-2"])).toEqual({
      status: 200,
      body: {
        shop: "AmiAmi",
        status: "Shipped",
        paid: true,
        orderDate: "2026-01-05",
        releaseDate: "2026-04-01",
        paymentDate: "2026-01-20",
        shippingDate: "2026-03-05",
        collectionDate: "2026-03-10",
        shippingMethod: "n/a",
        shippingFee: 2000,
        taxes: 300,
        duties: 30,
        tariffs: 50,
        miscFees: 10,
        notes: "Box 1",
      },
    });
  });

  test("the draft reads 1,000 Orders, as many as a merge takes", async () => {
    const ids = Array.from({ length: 1000 }, (_, i) => `bulk-order-${i}`);
    await db.insert(order).values(ids.map((id) => ({ id, userId, title: id, shippingFee: 1 })));

    expect(await draftOf(ids)).toMatchObject({ status: 200, body: { shippingFee: 1000 } });
  });

  test("the draft leaves the Shop blank when the sources differ and Paid off when one source is unpaid", async () => {
    await db.update(order).set({ shop: "HLJ", paid: false }).where(eq(order.id, "order-2"));

    expect(await draftOf(["order-1", "order-2"])).toMatchObject({
      status: 200,
      body: { shop: "", paid: false },
    });
  });

  test("the draft keeps every note in full past the notes limit, and merging it writes nothing", async () => {
    await db
      .update(order)
      .set({ notes: "a".repeat(6000) })
      .where(eq(order.id, "order-1"));
    await db
      .update(order)
      .set({ notes: "b".repeat(6000) })
      .where(eq(order.id, "order-2"));
    const before = { orders: await readOrders(), items: await itemsWithoutOrder() };
    const { body } = await draftOf(["order-1", "order-2"]);
    const draft = newOrderSchema
      .omit({ title: true, notes: true })
      .extend({ notes: z.string() })
      .parse(body);

    const response = await app.handle(
      new Request("http://localhost/api/orders/merge", {
        method: "POST",
        headers: { "x-test-user": userId, "content-type": "application/json" },
        body: JSON.stringify({
          orderIds: ["order-1", "order-2"],
          newOrder: { ...draft, title: "Combined" },
        }),
      }),
    );

    expect({ notes: draft.notes.length, status: response.status }).toEqual({
      notes: 12_002,
      status: 422,
    });
    expect({ orders: await readOrders(), items: await itemsWithoutOrder() }).toEqual(before);
  });

  test("merging with the draft keeps the source fees and every item's own values", async () => {
    const before = await itemsWithoutOrder();
    const { body } = await draftOf(["order-1", "order-2"]);
    const draft = newOrderSchema.omit({ title: true }).parse(body);

    const response = await app.handle(
      new Request("http://localhost/api/orders/merge", {
        method: "POST",
        headers: { "x-test-user": userId, "content-type": "application/json" },
        body: JSON.stringify({
          orderIds: ["order-1", "order-2"],
          newOrder: { ...draft, title: "Combined shipment" },
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await itemsWithoutOrder()).toEqual(before);
    const [merged, ...others] = await readOrders();
    expect(others).toEqual([]);
    expect(merged).toMatchObject({
      shop: "AmiAmi",
      paid: true,
      shippingFee: 2000,
      taxes: 300,
      duties: 30,
      tariffs: 50,
      miscFees: 10,
    });
  });
});

describe("a New Order starts from the selected items", () => {
  beforeEach(seedSources);

  const draftOf = async (collectionIds: readonly string[]) => {
    const response = await app.handle(
      new Request("http://localhost/api/orders/new-order-draft", {
        method: "POST",
        headers: { "x-test-user": userId, "content-type": "application/json" },
        body: JSON.stringify({ collectionIds }),
      }),
    );
    const json = response.headers.get("content-type")?.includes("json");
    return { status: response.status, body: json ? await response.json() : await response.text() };
  };
  const noFees = { shippingFee: 0, taxes: 0, duties: 0, tariffs: 0, miscFees: 0, notes: "" };

  test("one item gives its own values and no fees", async () => {
    expect(await draftOf(["collection-1"])).toEqual({
      status: 200,
      body: {
        shop: "Mandarake",
        status: "Owned",
        paid: true,
        orderDate: "2025-12-30",
        releaseDate: null,
        paymentDate: "2026-01-02",
        shippingDate: "2026-02-01",
        collectionDate: "2026-02-09",
        shippingMethod: "SURFACE",
        ...noFees,
      },
    });
  });

  test("items take the shared Shop, the least advanced status, the earliest Order Date and the latest other dates, as Merge does", async () => {
    await db.insert(item_release).values({
      id: "00000000-0000-4000-8000-000000000001",
      itemId: "item-1",
      date: "2026-05-01",
    });
    await db
      .update(collection)
      .set({ releaseId: "00000000-0000-4000-8000-000000000001" })
      .where(eq(collection.id, "collection-2"));

    expect(await draftOf(["collection-1", "collection-2"])).toEqual({
      status: 200,
      body: {
        shop: "",
        status: "Shipped",
        paid: true,
        orderDate: "2025-12-30",
        releaseDate: "2026-05-01",
        paymentDate: "2026-01-21",
        shippingDate: "2026-04-03",
        collectionDate: "2026-02-09",
        shippingMethod: "n/a",
        ...noFees,
      },
    });
  });

  test("an item outside any Order with every field blank gives a blank draft that starts Paid", async () => {
    await db.insert(collection).values({ id: "collection-3", userId, itemId: "item-1" });

    expect(await draftOf(["collection-3"])).toEqual({
      status: 200,
      body: {
        shop: "",
        status: "Owned",
        paid: true,
        orderDate: null,
        releaseDate: null,
        paymentDate: null,
        shippingDate: null,
        collectionDate: null,
        shippingMethod: "n/a",
        ...noFees,
      },
    });
  });

  test("the draft's Paid follows each item's Order: Paid outside any Order or in a Paid Order, Unpaid once one item is in an Unpaid Order", async () => {
    await db.insert(collection).values({ id: "collection-3", userId, itemId: "item-1" });
    const paidOf = async (collectionIds: readonly string[]) => {
      const { body } = await draftOf(collectionIds);
      return (body as { readonly paid: boolean }).paid;
    };
    const outside = await paidOf(["collection-3"]);
    const allInPaidOrders = await paidOf(["collection-1", "collection-2"]);
    const outsideAndPaidOrder = await paidOf(["collection-1", "collection-3"]);
    await db.update(order).set({ paid: false }).where(eq(order.id, "order-2"));
    const oneInUnpaidOrder = await paidOf(["collection-1", "collection-2"]);
    const outsideAndUnpaidOrder = await paidOf(["collection-2", "collection-3"]);

    expect({
      outside,
      allInPaidOrders,
      outsideAndPaidOrder,
      oneInUnpaidOrder,
      outsideAndUnpaidOrder,
    }).toEqual({
      outside: true,
      allInPaidOrders: true,
      outsideAndPaidOrder: true,
      oneInUnpaidOrder: false,
      outsideAndUnpaidOrder: false,
    });
  });

  test("the draft reads 1,000 items, as many as a move takes", async () => {
    const ids = Array.from({ length: 1000 }, (_, i) => `bulk-item-${i}`);
    await db
      .insert(collection)
      .values(ids.map((id) => ({ id, userId, itemId: "item-1", shop: "AmiAmi" })));

    expect(await draftOf(ids)).toMatchObject({
      status: 200,
      body: { shop: "AmiAmi", paid: true, shippingFee: 0 },
    });
  });

  test("an id the viewer does not hold answers 404", async () => {
    expect(await draftOf(["collection-1", "missing"])).toEqual({
      status: 404,
      body: "Order items not found",
    });
  });

  test("moving items to a New Order made from the draft keeps every item's own values", async () => {
    const before = await itemsWithoutOrder();
    const { body } = await draftOf(["collection-1", "collection-2"]);
    const draft = newOrderSchema.omit({ title: true }).parse(body);

    const response = await app.handle(
      new Request("http://localhost/api/orders/split", {
        method: "POST",
        headers: { "x-test-user": userId, "content-type": "application/json" },
        body: JSON.stringify({
          collectionIds: ["collection-1", "collection-2"],
          newOrder: { ...draft, title: "New Order" },
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await itemsWithoutOrder()).toEqual(before);
  });
});
