import { beforeEach, expect, mock, test } from "bun:test";
import { Elysia } from "elysia";
import { initLogger } from "evlog";
import { asc, eq, sql } from "drizzle-orm";
import * as authSchema from "@myakiba/db/schema/auth";
import { collection, item, list, listMember, order } from "@myakiba/db/schema/figure";
import * as z from "zod";
import { listTargetSchema } from "@myakiba/contracts/lists/schema";
import { createTestDatabase } from "../../../test/database";

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
const { default: listsRouter } = await import("./index");
const { default: ordersRouter } = await import("../orders/index");
const app = new Elysia({ prefix: "/api" }).use(listsRouter).use(ordersRouter);

const userId = "user-1";
const TITLES = ["A", "B", "C", "D", "E"] as const;

beforeEach(async () => {
  await db.execute('TRUNCATE "user", item CASCADE');
  await db
    .insert(authSchema.user)
    .values({ id: userId, name: "Ryan", email: "r@example.com", username: "ryan" });
  await db.insert(item).values(
    [...TITLES, "F"].map((title, index) => ({
      id: `item-${title}`,
      ownerId: userId,
      externalId: 100 + index,
      title,
    })),
  );
  await db.insert(list).values({ id: "list-1", userId, title: "Favorites", position: 0 });
  await db.insert(listMember).values(
    TITLES.map((title, position) => ({
      id: `member-${title}`,
      listId: "list-1",
      userId,
      itemId: `item-${title}`,
      position,
    })),
  );
});

type Json = string | number | null | readonly Json[] | { readonly [key: string]: Json };
type Body = { readonly [key: string]: Json };

const callApi = async (method: string, path: string, body?: Body) => {
  const response = await app.handle(
    new Request(`http://localhost/api${path}`, {
      method,
      headers: { "x-test-user": userId, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
  const isJson = response.headers.get("content-type")?.includes("application/json");
  return { status: response.status, body: isJson ? await response.json() : await response.text() };
};

const call = (method: string, path: string, body?: Body) => callApi(method, `/lists${path}`, body);

const removed = async (...titles: readonly string[]) => {
  const answer = await call("DELETE", "/list-1/members", {
    memberIds: titles.map((title) => `member-${title}`),
  });
  expect(answer.status).toBe(200);
  return z
    .object({ removed: z.array(listTargetSchema.extend({ position: z.number() })) })
    .parse(answer.body).removed;
};

const undo = (members: readonly Json[]) => call("POST", "/list-1/members/restore", { members });

const statusOf = async (method: string, path: string, body?: Body) => {
  const { status } = await call(method, path, body);
  return status;
};

const memberRows = () =>
  db
    .select({
      listId: listMember.listId,
      userId: listMember.userId,
      itemId: listMember.itemId,
      collectionId: listMember.collectionId,
      orderId: listMember.orderId,
      position: listMember.position,
    })
    .from(listMember)
    .orderBy(asc(listMember.position), asc(listMember.id));

const shownTitles = async () => {
  const { body } = await call("GET", "/list-1/members");
  const { items } = z.object({ items: z.array(z.object({ title: z.string() })) }).parse(body);
  return items.map(({ title }) => title).join("");
};

test("Undo puts a removed member back in the row it held", async () => {
  const before = await memberRows();

  const members = await removed("B");
  expect(members).toEqual([{ type: "item", id: "item-B", position: 1 }]);
  expect(await shownTitles()).toBe("ACDE");

  expect(await undo(members)).toEqual({ status: 200, body: { restoredCount: 1 } });
  expect(await memberRows()).toEqual(before);
  expect(await shownTitles()).toBe("ABCDE");
});

test("Undo of members removed together puts each back in one write", async () => {
  const before = await memberRows();

  expect(await undo(await removed("D", "B"))).toEqual({
    status: 200,
    body: { restoredCount: 2 },
  });
  expect(await memberRows()).toEqual(before);
});

test("Undo of the middle of three removals puts only that member back between its neighbors", async () => {
  const removals = [await removed("B"), await removed("C"), await removed("D")];

  const [, middle] = removals;
  expect(await undo(middle ?? [])).toEqual({ status: 200, body: { restoredCount: 1 } });
  expect(await shownTitles()).toBe("ACE");
});

test("after a reorder, Undo by rule returns the member to the slot it held, which now sits between other members", async () => {
  const members = await removed("B");
  expect(
    await statusOf("PATCH", "/list-1/members/order", {
      movedIds: ["member-E"],
      anchorId: "member-A",
      placement: "before",
    }),
  ).toBe(200);
  expect(await shownTitles()).toBe("EACD");

  expect(await undo(members)).toEqual({ status: 200, body: { restoredCount: 1 } });
  expect(await shownTitles()).toBe("EBACD");
});

test("Undo of a member whose slot another member holds now puts it at the end", async () => {
  const members = await removed("E");
  expect(
    await statusOf("PUT", "/targets", {
      targets: [{ type: "item", id: "item-F" }],
      listIds: ["list-1"],
    }),
  ).toBe(200);
  expect(await shownTitles()).toBe("ABCDF");

  expect(await undo(members)).toEqual({ status: 200, body: { restoredCount: 1 } });
  expect(await shownTitles()).toBe("ABCDFE");
});

test("Undo of a member another tab added back, and a repeated Undo, add nothing", async () => {
  const members = await removed("B");
  expect(
    await statusOf("PUT", "/targets", {
      targets: [{ type: "item", id: "item-B" }],
      listIds: ["list-1"],
    }),
  ).toBe(200);

  expect(await undo(members)).toEqual({ status: 200, body: { restoredCount: 0 } });
  expect(await undo(members)).toEqual({ status: 200, body: { restoredCount: 0 } });
  expect(await shownTitles()).toBe("ACDEB");
});

test("two Undos of one removal at once put the member back once", async () => {
  const members = await removed("B");

  const answers = await Promise.all([undo(members), undo(members)]);

  const restoredCounts = answers.map(
    ({ body }) => z.object({ restoredCount: z.number() }).parse(body).restoredCount,
  );
  expect(restoredCounts.toSorted()).toEqual([0, 1]);
  expect(await shownTitles()).toBe("ABCDE");
});

test("Undo after the List was deleted answers 404 and writes nothing", async () => {
  const members = await removed("B");
  expect(await statusOf("DELETE", "/", { listIds: ["list-1"] })).toBe(200);

  expect(await undo(members)).toEqual({ status: 404, body: "List not found" });
  expect(await memberRows()).toEqual([]);
});

test("Undo skips a member whose target was deleted since and puts the rest back", async () => {
  await db
    .insert(collection)
    .values({ id: "collection-1", userId, itemId: "item-F", status: "Owned" });
  await db.insert(listMember).values({
    id: "member-F",
    listId: "list-1",
    userId,
    collectionId: "collection-1",
    position: 5,
  });
  const members = await removed("B", "F");
  await db.delete(collection).where(eq(collection.id, "collection-1"));

  expect(await undo(members)).toEqual({ status: 200, body: { restoredCount: 1 } });
  expect(await shownTitles()).toBe("ABCDE");
});

test("a slot two members share counts as held, so Undo puts the member at the end", async () => {
  await db.update(listMember).set({ position: 0 });
  expect(await shownTitles()).toBe("ABCDE");

  expect(await undo(await removed("B"))).toEqual({ status: 200, body: { restoredCount: 1 } });
  expect(await shownTitles()).toBe("ACDEB");
});

test("Undo stores a position past the end as the end, and the next add still appends", async () => {
  await removed("B");

  expect(await undo([{ type: "item", id: "item-B", position: 2_147_483_647 }])).toEqual({
    status: 200,
    body: { restoredCount: 1 },
  });
  expect(
    await statusOf("PUT", "/targets", {
      targets: [{ type: "item", id: "item-F" }],
      listIds: ["list-1"],
    }),
  ).toBe(200);
  expect(await shownTitles()).toBe("ACDEBF");
  const positions = await memberRows();
  expect(positions.map(({ position }) => position)).toEqual([0, 2, 3, 4, 5, 6]);
});

test("removing the last two and restoring one puts it at the end", async () => {
  const [, last] = await removed("D", "E");

  expect(await undo(last ? [last] : [])).toEqual({ status: 200, body: { restoredCount: 1 } });
  expect(await shownTitles()).toBe("ABCE");
});

test("an owned target that was never in the List goes to the end", async () => {
  expect(await undo([{ type: "item", id: "item-F", position: 1 }])).toEqual({
    status: 200,
    body: { restoredCount: 1 },
  });
  expect(await shownTitles()).toBe("ABCDEF");
});

test("the same Undo twice puts the member back once", async () => {
  const members = await removed("B");

  expect(await undo(members)).toEqual({ status: 200, body: { restoredCount: 1 } });
  expect(await undo(members)).toEqual({ status: 200, body: { restoredCount: 0 } });
  expect(await shownTitles()).toBe("ABCDE");
});

test("Undo refuses a body that names a member id, a user or a time", async () => {
  const members = await removed("B");
  const extras: readonly Body[] = [
    { memberId: "member-B" },
    { userId: "user-2" },
    { createdAt: "2026-01-01" },
  ];

  for (const extra of extras) {
    const { status } = await undo(members.map((member) => ({ ...member, ...extra })));
    expect(status).toBe(422);
  }
  expect(await statusOf("POST", "/list-1/members/restore", { members, userId })).toBe(422);
  expect(await shownTitles()).toBe("ACDE");
});

/** Locks one List Member row, so an Undo that reads the List's members stops there. */
async function holdingMember(memberId: string) {
  const locked = Promise.withResolvers<null>();
  const commit = Promise.withResolvers<null>();
  const open = db.transaction(async (tx) => {
    await tx
      .select({ id: listMember.id })
      .from(listMember)
      .where(eq(listMember.id, memberId))
      .for("update");
    locked.resolve(null);
    await commit.promise;
  });
  await locked.promise;
  return async () => {
    commit.resolve(null);
    await open;
  };
}

/** Waits until a statement that starts with one of `statements` waits on a lock. */
async function waitForBlocked(...statements: readonly string[]) {
  for (;;) {
    const [waiting] = await db.execute<{ count: number }>(
      sql`SELECT count(*)::int AS count FROM pg_stat_activity
        WHERE wait_event_type = 'Lock' AND datname = current_database()
          AND (${sql.join(
            statements.map((statement) => sql`query LIKE ${`${statement}%`}`),
            sql` OR `,
          )})`,
    );
    if (waiting && waiting.count > 0) return;
    await Bun.sleep(10);
  }
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

test("an Undo of an Order and a delete of that Order at once both finish", async () => {
  await db.insert(order).values({ id: "order-1", userId, title: "AmiAmi preorder" });
  await db.insert(collection).values({
    id: "collection-ordered",
    userId,
    itemId: "item-F",
    orderId: "order-1",
    status: "Ordered",
  });
  await db.insert(listMember).values([
    { id: "member-order", listId: "list-1", userId, orderId: "order-1", position: 5 },
    {
      id: "member-ordered",
      listId: "list-1",
      userId,
      collectionId: "collection-ordered",
      position: 6,
    },
  ]);
  const members = await removed("order");
  const commit = await holdingMember("member-ordered");

  const undone = undo(members);
  await Promise.race([undone, waitForLockWaits(1)]);
  const deleted = callApi("DELETE", "/orders/", { orderIds: ["order-1"] });
  await waitForBlocked('delete from "collection"', 'select "id" from "order"');
  await commit();

  const [{ status: undoneStatus }, { status: deletedStatus }] = await Promise.all([
    undone,
    deleted,
  ]);
  expect({ undone: undoneStatus, deleted: deletedStatus }).toEqual({
    undone: 200,
    deleted: 200,
  });
  expect(await shownTitles()).toBe("ABCDE");
});

/** A List holding an Order early and one of its Ordered Collection Items later. */
async function listWithOrderAndItsItem() {
  await db.insert(order).values({ id: "order-1", userId, title: "AmiAmi preorder" });
  await db.insert(collection).values({
    id: "collection-ordered",
    userId,
    itemId: "item-F",
    orderId: "order-1",
    status: "Ordered",
  });
  await db.insert(listMember).values([
    { id: "member-order", listId: "list-1", userId, orderId: "order-1", position: 5 },
    {
      id: "member-ordered",
      listId: "list-1",
      userId,
      collectionId: "collection-ordered",
      position: 6,
    },
  ]);
}

test("an Undo of another member and a delete of an Order in the List at once both finish", async () => {
  await listWithOrderAndItsItem();
  const members = await removed("C");
  const commit = await holdingMember("member-ordered");

  const deleted = callApi("DELETE", "/orders/", { orderIds: ["order-1"] });
  await waitForLockWaits(1);
  const undone = undo(members);
  await Promise.race([undone, waitForLockWaits(2)]);
  await commit();

  const [{ status: undoneStatus }, { status: deletedStatus }] = await Promise.all([
    undone,
    deleted,
  ]);
  expect({ undone: undoneStatus, deleted: deletedStatus }).toEqual({
    undone: 200,
    deleted: 200,
  });
  expect(await shownTitles()).toBe("ABCDE");
});

test("an Undo that deadlocks on its targets answers 500, and the same Undo succeeds once the other write is done", async () => {
  await db.insert(collection).values([
    { id: "collection-1", userId, itemId: "item-F", status: "Owned" },
    { id: "collection-2", userId, itemId: "item-F", status: "Owned" },
  ]);
  await db.insert(listMember).values([
    { id: "member-c1", listId: "list-1", userId, collectionId: "collection-1", position: 5 },
    { id: "member-c2", listId: "list-1", userId, collectionId: "collection-2", position: 6 },
  ]);
  const members = await removed("c1", "c2");
  const holding = Promise.withResolvers<null>();
  const finish = Promise.withResolvers<null>();
  const other = db
    .transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL deadlock_timeout = '10s'`);
      await tx.delete(collection).where(eq(collection.id, "collection-2"));
      holding.resolve(null);
      await finish.promise;
      await tx.delete(collection).where(eq(collection.id, "collection-1"));
      tx.rollback();
    })
    .catch(() => "rolled back");
  await holding.promise;

  const undone = undo(members);
  await waitForLockWaits(1);
  finish.resolve(null);

  expect(await undone).toEqual({ status: 500, body: "Failed to undo" });
  expect(await other).toBe("rolled back");
  expect(await undo(members)).toEqual({ status: 200, body: { restoredCount: 2 } });
});
