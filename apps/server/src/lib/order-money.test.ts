import { beforeAll, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import * as authSchema from "@myakiba/db/schema/auth";
import * as figureSchema from "@myakiba/db/schema/figure";
import { createTestDatabase } from "../../test/database";

const { collection, item, order } = figureSchema;

const db = await createTestDatabase();
const { unpaidOrder, unpaidOrderRow } = await import("./order-money");

const userId = "user-order-shapes";

beforeAll(async () => {
  await db
    .insert(authSchema.user)
    .values({ id: userId, name: "Ren", email: "shapes@example.com", username: "shapes" });
  await db.insert(item).values(
    ["a", "b", "c", "d", "e"].map((id, index) => ({
      id: `item-${id}`,
      ownerId: userId,
      externalId: 200 + index,
      title: id,
    })),
  );
  await db.insert(order).values([
    { id: "empty-paid", userId, title: "No items, Paid", paid: true },
    { id: "empty-unpaid", userId, title: "No items, unpaid", paid: false },
    { id: "fees-paid-item-unpaid", userId, title: "Fees paid, item unpaid", paid: true },
    { id: "fees-unpaid-items-paid", userId, title: "Fees unpaid, items paid", paid: false },
    { id: "paid-in-full", userId, title: "Paid in full", paid: true },
  ]);
  await db.insert(collection).values([
    { id: "c-a", userId, itemId: "item-a", orderId: "fees-paid-item-unpaid", paid: false },
    { id: "c-b", userId, itemId: "item-b", orderId: "fees-paid-item-unpaid", paid: true },
    { id: "c-c", userId, itemId: "item-c", orderId: "fees-unpaid-items-paid", paid: true },
    { id: "c-d", userId, itemId: "item-d", orderId: "fees-unpaid-items-paid", paid: true },
    { id: "c-e", userId, itemId: "item-e", orderId: "paid-in-full", paid: true },
  ]);
});

test("the row pre-filter for unpaid Orders keeps exactly the Orders the grouped test calls unpaid", async () => {
  const rows = await db
    .select({ id: order.id, row: unpaidOrderRow, grouped: unpaidOrder })
    .from(order)
    .leftJoin(collection, eq(order.id, collection.orderId))
    .where(eq(order.userId, userId))
    .groupBy(order.id)
    .orderBy(order.id);

  expect(rows).toEqual([
    { id: "empty-paid", row: false, grouped: false },
    { id: "empty-unpaid", row: true, grouped: true },
    { id: "fees-paid-item-unpaid", row: true, grouped: true },
    { id: "fees-unpaid-items-paid", row: true, grouped: true },
    { id: "paid-in-full", row: false, grouped: false },
  ]);
});
