import { beforeEach, expect, mock, test } from "bun:test";
import { Elysia } from "elysia";
import { initLogger } from "evlog";
import * as authSchema from "@myakiba/db/schema/auth";
import * as figureSchema from "@myakiba/db/schema/figure";
import { createTestDatabase } from "../../../test/database";

const { collection, item, list, listMember } = figureSchema;

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

beforeEach(async () => {
  await db.execute('TRUNCATE "user", item CASCADE');
  await db.insert(authSchema.user).values([
    { id: userId, name: "Ryan", email: "r@example.com", username: "ryan" },
    { id: "user-2", name: "Aki", email: "a@example.com", username: "aki" },
  ]);
  await db.insert(item).values([
    { id: "item-1", externalId: 186, title: "Nendoroid Hatsune Miku" },
    { id: "item-2", externalId: 187, title: "figma Saber" },
  ]);
  await db.insert(list).values([
    { id: "list-1", userId, title: "Favorites", position: 0 },
    { id: "list-2", userId, title: "Grails", position: 1 },
    { id: "list-other", userId: "user-2", title: "Other user's list" },
  ]);
  await db.insert(listMember).values([
    { id: "member-1", listId: "list-1", itemId: "item-1", position: 0 },
    { id: "member-2", listId: "list-1", itemId: "item-2", position: 1 },
  ]);
});

const call = async (method: string, path: string, body?: Record<string, string[]>) => {
  const response = await app.handle(
    new Request(`http://localhost/api/lists${path}`, {
      method,
      headers: { "x-test-user": userId, "content-type": "application/json" },
      body: body && JSON.stringify(body),
    }),
  );
  return { status: response.status, body: await response.text() };
};

const ids = async (table: typeof list | typeof listMember) => {
  const rows = await db.select({ id: table.id }).from(table).orderBy(table.id);
  return rows.map(({ id }) => id);
};

test("deleting an owned list with another user's list deletes neither", async () => {
  expect(await call("DELETE", "/", { listIds: ["list-2", "list-other"] })).toEqual({
    status: 404,
    body: "List not found",
  });
  expect(await ids(list)).toEqual(["list-1", "list-2", "list-other"]);
});

test("removing a present and a missing member removes neither", async () => {
  expect(await call("DELETE", "/list-1/members", { memberIds: ["member-1", "missing"] })).toEqual({
    status: 404,
    body: "Selection not found",
  });
  expect(await ids(listMember)).toEqual(["member-1", "member-2"]);
});

test("a member whose target the owner cannot see stays a 500", async () => {
  await db
    .insert(collection)
    .values({ id: "c-other", userId: "user-2", itemId: "item-1", status: "Owned" });
  await db
    .insert(listMember)
    .values({ id: "member-dangling", listId: "list-1", collectionId: "c-other", position: 2 });

  expect(await call("GET", "/list-1/members")).toEqual({
    status: 500,
    body: "Failed to load List",
  });
});
