import { beforeEach, describe, expect, mock, test } from "bun:test";
import { Elysia } from "elysia";
import { initLogger } from "evlog";
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
const app = new Elysia({ prefix: "/api" }).use(ordersRouter);

const failWhenArmed = (body: string) =>
  db.execute(
    `CREATE OR REPLACE FUNCTION fail_when_armed() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN ${body} END $$`,
  );
await failWhenArmed("RETURN OLD;");
await db.execute(
  'CREATE TRIGGER fail_order_delete BEFORE DELETE ON "order" FOR EACH ROW EXECUTE FUNCTION fail_when_armed()',
);

const userId = "user-1";

beforeEach(async () => {
  await failWhenArmed("RETURN OLD;");
  await db.execute('TRUNCATE "user", item CASCADE');
  await db.insert(authSchema.user).values([
    { id: userId, name: "Ryan", email: "r@example.com", username: "ryan" },
    { id: "user-2", name: "Aki", email: "a@example.com", username: "aki" },
  ]);
  await db.insert(item).values({ id: "item-1", externalId: 186, title: "Nendoroid Hatsune Miku" });
  await db.insert(order).values([
    { id: "order-1", userId, title: "AmiAmi preorder" },
    { id: "order-2", userId, title: "HLJ preorder" },
    { id: "order-3", userId: "user-2", title: "Other user's order" },
  ]);
  await db.insert(collection).values([
    { id: "c-owned", userId, itemId: "item-1", orderId: "order-1", status: "Owned" },
    { id: "c-ordered", userId, itemId: "item-1", orderId: "order-1", status: "Ordered" },
    { id: "c-2", userId, itemId: "item-1", orderId: "order-2", status: "Ordered" },
    { id: "c-other", userId: "user-2", itemId: "item-1", orderId: "order-3", status: "Ordered" },
  ]);
});

const call = async (method: string, path: string, body?: string) => {
  const response = await app.handle(
    new Request(`http://localhost/api/orders${path}`, {
      method,
      headers: { "x-test-user": userId, "content-type": "application/json" },
      body,
    }),
  );
  const json = response.headers.get("content-type")?.includes("json");
  return { status: response.status, body: json ? await response.json() : await response.text() };
};

const newOrder = {
  status: "Shipped",
  title: "Combined shipment",
  shop: "AmiAmi",
  orderDate: "2026-01-05",
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
};

const answers = [
  [
    "merge",
    "POST",
    "/merge",
    { orderIds: ["order-1", "order-2"], newOrder, cascadeOptions: [] },
    200,
    "Orders merged successfully",
  ],
  [
    "merge another user's order",
    "POST",
    "/merge",
    { orderIds: ["order-3"], newOrder, cascadeOptions: [] },
    404,
    "Order items not found",
  ],
  [
    "split",
    "POST",
    "/split",
    { collectionIds: ["c-2"], newOrder, cascadeOptions: ["status"] },
    200,
    "Items split successfully",
  ],
  [
    "split another user's item",
    "POST",
    "/split",
    { collectionIds: ["c-other"], newOrder, cascadeOptions: [] },
    404,
    "Order items not found",
  ],
  [
    "move",
    "PUT",
    "/move-items",
    { targetOrderId: "order-2", collectionIds: ["c-ordered"], orderIds: ["order-1"] },
    200,
    "Items moved successfully",
  ],
  [
    "move into another user's order",
    "PUT",
    "/move-items",
    { targetOrderId: "order-3", collectionIds: ["c-ordered"] },
    404,
    "Order not found",
  ],
  [
    "move another user's item",
    "PUT",
    "/move-items",
    { targetOrderId: "order-2", collectionIds: ["c-other"] },
    404,
    "Order items not found",
  ],
  [
    "move an item deleted in another tab",
    "PUT",
    "/move-items",
    { targetOrderId: "order-2", collectionIds: ["c-deleted"], orderIds: ["order-1"] },
    404,
    "Order items not found",
  ],
  [
    "update",
    "PUT",
    "/order-1",
    { order: { title: "Renamed" }, cascadeOptions: [] },
    200,
    "Order updated successfully",
  ],
  [
    "update another user's order",
    "PUT",
    "/order-3",
    { order: { title: "x" }, cascadeOptions: [] },
    404,
    "Order not found",
  ],
  ["delete orders", "DELETE", "/", { orderIds: ["order-2"] }, 200, "Orders deleted successfully"],
  [
    "delete another user's order",
    "DELETE",
    "/",
    { orderIds: ["order-3"] },
    404,
    "One or more orders not found",
  ],
  [
    "delete items",
    "DELETE",
    "/items",
    { collectionIds: ["c-2"] },
    200,
    "Order items deleted successfully",
  ],
  [
    "delete another user's items",
    "DELETE",
    "/items",
    { collectionIds: ["c-other"] },
    404,
    "One or more order items not found",
  ],
  [
    "delete an item",
    "DELETE",
    "/order-1/items/c-ordered",
    undefined,
    200,
    "Order item deleted successfully",
  ],
  [
    "delete another user's item",
    "DELETE",
    "/order-3/items/c-other",
    undefined,
    404,
    "Order item not found",
  ],
  ["get another user's order", "GET", "/order-3", undefined, 404, "Order not found"],
  [
    "list another user's order items",
    "GET",
    "/order-3/items",
    undefined,
    200,
    { items: [], totalCount: 0 },
  ],
  ["list another user's item releases", "GET", "/order-3/item-releases", undefined, 200, []],
] as const;

describe("each orders route answers as before", () => {
  test.each(answers)("%s", async (_, method, path, body, status, answer) => {
    expect(await call(method, path, body && JSON.stringify(body))).toEqual({
      status,
      body: answer,
    });
  });

  test("list", async () => {
    const { status, body } = await call("GET", "/?sort=title&order=asc");

    expect(status).toBe(200);
    expect(body).toMatchObject({
      items: [
        { orderId: "order-1", itemCount: "2" },
        { orderId: "order-2", itemCount: "1" },
      ],
      totalCount: 2,
      activeOrders: 2,
    });
  });

  test("get", async () => {
    expect(await call("GET", "/order-1")).toMatchObject({
      status: 200,
      body: { orderId: "order-1", title: "AmiAmi preorder", itemCount: "2" },
    });
  });

  test("items", async () => {
    const { status, body } = await call("GET", "/order-1/items?sort=createdAt&order=asc");

    expect(status).toBe(200);
    expect(body).toMatchObject({ items: [{ id: "c-ordered" }, { id: "c-owned" }], totalCount: 2 });
  });

  test("the router mounts no auth handler under its prefix", () => {
    expect(ordersRouter.routes.filter((route) => route.method === "ALL")).toEqual([]);
  });
});

const readState = async () => ({
  orders: await db.select({ id: order.id }).from(order).orderBy(order.id),
  items: await db
    .select({ id: collection.id, orderId: collection.orderId })
    .from(collection)
    .orderBy(collection.id),
});

describe("a failure after a write leaves nothing behind", () => {
  test("a merge that finds no order to delete keeps the new order and the moved items out", async () => {
    await db
      .insert(collection)
      .values({ id: "c-stray", userId, itemId: "item-1", orderId: "order-3", status: "Ordered" });
    const before = await readState();

    expect(
      await call(
        "POST",
        "/merge",
        JSON.stringify({ orderIds: ["order-3"], newOrder, cascadeOptions: [] }),
      ),
    ).toEqual({
      status: 404,
      body: "One or more orders not found",
    });
    expect(await readState()).toEqual(before);
  });

  test("a database error in an order delete keeps the items it already deleted", async () => {
    await failWhenArmed("RAISE EXCEPTION 'injected order delete failure';");
    const before = await readState();

    expect(await call("DELETE", "/", JSON.stringify({ orderIds: ["order-1"] }))).toEqual({
      status: 500,
      body: "Failed to delete orders",
    });
    expect(await readState()).toEqual(before);
  });
});
