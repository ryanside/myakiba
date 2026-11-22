import { beforeEach, expect, mock, test } from "bun:test";
import { Elysia } from "elysia";
import { initLogger } from "evlog";
import { asc, eq } from "drizzle-orm";
import * as authSchema from "@myakiba/db/schema/auth";
import { collection, item, list, listMember } from "@myakiba/db/schema/figure";
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
const app = new Elysia({ prefix: "/api" }).use(listsRouter);

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

const call = async (method: string, path: string, body?: Body) => {
  const response = await app.handle(
    new Request(`http://localhost/api/lists${path}`, {
      method,
      headers: { "x-test-user": userId, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
  const isJson = response.headers.get("content-type")?.includes("application/json");
  return { status: response.status, body: isJson ? await response.json() : await response.text() };
};

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

test("Undo after a reorder puts the member back at the position it held", async () => {
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

test("Undo goes ahead of a member added since that took its position", async () => {
  const members = await removed("E");
  expect(
    await statusOf("PUT", "/targets", {
      targets: [{ type: "item", id: "item-F" }],
      listIds: ["list-1"],
    }),
  ).toBe(200);
  expect(await shownTitles()).toBe("ABCDF");

  expect(await undo(members)).toEqual({ status: 200, body: { restoredCount: 1 } });
  expect(await shownTitles()).toBe("ABCDEF");
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
