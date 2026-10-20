import { beforeEach, expect, mock, test } from "bun:test";
import { Elysia } from "elysia";
import { createRequestLogger, initLogger } from "evlog";
import * as authSchema from "@myakiba/db/schema/auth";
import * as figureSchema from "@myakiba/db/schema/figure";
import { createTestDatabase } from "../../../test/database";
import type { CollectionUpdateType } from "./model";

const { collection, item } = figureSchema;

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
const { default: collectionRouter } = await import("./index");
const { Collection } = await import("./module");
const { run } = await import("@/domain/kernel");
const { Viewer } = await import("@/domain/viewer");
const app = new Elysia({ prefix: "/api" }).use(collectionRouter);

const userId = "user-1";
const viewer = Viewer.fromSession({ user: { id: userId } });
const createdAt = new Date("2026-01-05T10:20:30.456Z");
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const edit: CollectionUpdateType = {
  status: "Owned",
  count: 1,
  score: "0",
  price: 0,
  shop: "AmiAmi",
  orderDate: null,
  paymentDate: null,
  shippingDate: null,
  collectionDate: "2026-02-01",
  shippingMethod: "EMS",
  tags: [],
  notes: "",
  releaseId: null,
  releaseDate: null,
  releasePrice: null,
  releaseCurrency: null,
  releaseBarcode: null,
  releaseType: null,
  condition: "New",
};

beforeEach(async () => {
  await db.execute('TRUNCATE "user", item CASCADE');
  await db
    .insert(authSchema.user)
    .values({ id: userId, name: "Ryan", email: "r@example.com", username: "ryan" });
  await db.insert(item).values({ id: "item-1", externalId: 186, title: "Nendoroid Hatsune Miku" });
  await db.insert(collection).values({
    id: "c-1",
    userId,
    itemId: "item-1",
    status: "Owned",
    collectionDate: "2026-01-04",
    createdAt,
    updatedAt: createdAt,
  });
});

const call = async (method: string, body?: CollectionUpdateType) => {
  const response = await app.handle(
    new Request("http://localhost/api/collection/c-1", {
      method,
      headers: { "x-test-user": userId, "content-type": "application/json" },
      body: body && JSON.stringify(body),
    }),
  );
  return { status: response.status, body: await response.json() };
};

test("an edit answers its row with ISO timestamp strings and YYYY-MM-DD dates", async () => {
  expect(await call("PUT", edit)).toMatchObject({
    status: 200,
    body: {
      update: {
        id: "c-1",
        collectionDate: "2026-02-01",
        createdAt: createdAt.toISOString(),
        updatedAt: expect.stringMatching(ISO),
      },
    },
  });
});

test("a delete answers its row with ISO timestamp strings", async () => {
  expect(await call("DELETE")).toMatchObject({
    status: 200,
    body: { deleted: { id: "c-1", createdAt: createdAt.toISOString() } },
  });
});

test("the edit and delete operations return strings, so Eden types them as strings", async () => {
  const log = createRequestLogger();
  const updated = await run(viewer, Collection.update, { id: "c-1", update: edit }, log);
  const deleted = await run(viewer, Collection.remove, { id: "c-1" }, log);
  const update = updated.ok ? updated.value.update : undefined;
  if (!update || !deleted.ok) throw new Error("expected both operations to succeed");

  const rows: readonly { readonly createdAt: string; readonly updatedAt: string }[] = [
    update,
    deleted.value.deleted,
  ];
  const timestamps = { createdAt: createdAt.toISOString(), updatedAt: expect.stringMatching(ISO) };
  expect(rows).toMatchObject([timestamps, timestamps]);
});
