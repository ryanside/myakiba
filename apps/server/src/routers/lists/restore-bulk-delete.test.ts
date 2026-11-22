import { beforeEach, expect, mock, test } from "bun:test";
import { Elysia } from "elysia";
import { initLogger } from "evlog";
import { asc, eq, sql } from "drizzle-orm";
import * as authSchema from "@myakiba/db/schema/auth";
import { collection, item, list, listMember } from "@myakiba/db/schema/figure";
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
const { default: collectionRouter } = await import("../collection/index");
const app = new Elysia({ prefix: "/api" }).use(listsRouter).use(collectionRouter);

const userId = "user-1";

beforeEach(async () => {
  await db.execute('TRUNCATE "user", item CASCADE');
  await db
    .insert(authSchema.user)
    .values({ id: userId, name: "Ryan", email: "r@example.com", username: "ryan" });
  await db.insert(item).values([
    { id: "item-A", ownerId: userId, externalId: 100, title: "A" },
    { id: "item-B", ownerId: userId, externalId: 101, title: "B" },
  ]);
  await db.insert(collection).values([
    { id: "collection-1", userId, itemId: "item-B", status: "Owned" },
    { id: "collection-2", userId, itemId: "item-B", status: "Owned" },
  ]);
  await db.insert(list).values({ id: "list-1", userId, title: "Favorites", position: 0 });
  await db.insert(listMember).values([
    { id: "member-A", listId: "list-1", userId, itemId: "item-A", position: 0 },
    { id: "member-c1", listId: "list-1", userId, collectionId: "collection-1", position: 1 },
    { id: "member-c2", listId: "list-1", userId, collectionId: "collection-2", position: 2 },
  ]);
});

const send = async (method: string, path: string, body: Readonly<Record<string, unknown[]>>) => {
  const response = await app.handle(
    new Request(`http://localhost/api${path}`, {
      method,
      headers: { "x-test-user": userId, "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  return response.status;
};

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

test("an Undo and a bulk delete of Collection Items in the List at once both finish", async () => {
  expect(await send("DELETE", "/lists/list-1/members", { memberIds: ["member-A"] })).toBe(200);
  const commit = await holdingMember("member-c1");

  const deleted = send("DELETE", "/collection/", { ids: ["collection-2", "collection-1"] });
  await waitForLockWaits(1);
  const undone = send("POST", "/lists/list-1/members/restore", {
    members: [{ type: "item", id: "item-A", position: 0 }],
  });
  await Promise.race([undone, waitForLockWaits(2)]);
  await commit();

  expect({ undone: await undone, deleted: await deleted }).toEqual({ undone: 200, deleted: 200 });
  const left = await db
    .select({ id: listMember.id, position: listMember.position })
    .from(listMember)
    .orderBy(asc(listMember.position));
  expect(left.map(({ position }) => position)).toEqual([0]);
});
