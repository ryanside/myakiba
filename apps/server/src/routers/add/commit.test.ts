import { afterAll, beforeEach, expect, mock, test } from "bun:test";
import { Elysia } from "elysia";
import { initLogger } from "evlog";
import Redis from "ioredis";
import { asc, eq, sql } from "drizzle-orm";
import type * as z from "zod";
import { addCommitResponseSchema } from "@myakiba/contracts/add/schema";
import type { addCommitSchema } from "@myakiba/contracts/add/schema";
import { EMAIL_VERIFICATION_REQUIRED } from "@myakiba/contracts/shared/messages";
import type { PositionOrderInput } from "@myakiba/contracts/shared/position-order";
import * as authSchema from "@myakiba/db/schema/auth";
import {
  addCommit,
  collection,
  item,
  item_release,
  list,
  listMember,
  order,
  wishlistItem,
} from "@myakiba/db/schema/figure";
import { lockWishlist } from "@/lib/wishlist-append";
import type { addTargetsToListsSchema, deleteListsSchema } from "../lists/model";
import { createTestDatabase } from "../../../test/database";

initLogger({ enabled: false });

const redisUrl = process.env.TEST_REDIS_URL;
if (!redisUrl) {
  throw new Error(
    "Set TEST_REDIS_URL to a Redis server, such as redis://127.0.0.1:6379: Add commits count their rate limit there",
  );
}
const redis = new Redis(redisUrl);
afterAll(() => redis.disconnect());

await mock.module("@myakiba/auth/server", () => ({
  auth: {
    handler: () => new Response(null, { status: 404 }),
    api: {
      getSession: async ({ headers }: { headers: Headers }) => {
        const id = headers.get("x-test-user");
        if (!id) return null;
        return {
          user: { id, emailVerified: headers.get("x-test-unverified") === null, currency: "JPY" },
          session: { id: `session-${id}` },
        };
      },
    },
  },
}));
await mock.module("@myakiba/redis/client", () => ({ redis }));

const db = await createTestDatabase();
const { default: addRouter } = await import("./index");
const { default: listsRouter } = await import("../lists/index");
const app = new Elysia({ prefix: "/api" }).use(addRouter).use(listsRouter);

let userId = "";
let otherUserId = "";

beforeEach(async () => {
  await db.execute('TRUNCATE "user", item CASCADE');
  userId = `user-${crypto.randomUUID()}`;
  otherUserId = `other-${crypto.randomUUID()}`;
  await db.insert(authSchema.user).values([
    { id: userId, name: "Ryan", email: `${userId}@example.com`, username: userId },
    { id: otherUserId, name: "Aki", email: `${otherUserId}@example.com`, username: otherUserId },
  ]);
  await db.insert(item).values([
    { id: "item-1", externalId: 186, title: "Nendoroid Hatsune Miku", image: "miku.jpg" },
    { id: "item-2", externalId: 1860, title: "Figma Miku" },
    { id: "item-3", externalId: null, source: "custom", title: "Custom Rin" },
  ]);
  await db.insert(item_release).values([
    { id: "00000000-0000-4000-8000-000000000001", itemId: "item-1", date: "2026-01-01" },
    {
      id: "00000000-0000-4000-8000-000000000002",
      itemId: "item-1",
      date: "2026-06-01",
      price: 4500,
      priceCurrency: "JPY",
    },
    {
      id: "00000000-0000-4000-8000-000000000003",
      itemId: "item-2",
      date: "2026-03-01",
      price: 3000,
      priceCurrency: "USD",
    },
  ]);
  await db.insert(list).values([
    { id: "list-1", userId, title: "Shelf" },
    { id: "list-2", userId, title: "Favorites" },
    { id: "list-other", userId: otherUserId, title: "Not mine" },
  ]);
  await db.insert(order).values([
    {
      id: "order-existing",
      userId,
      title: "Spring preorders",
      status: "Paid",
      shop: "AmiAmi",
      orderDate: "2026-02-01",
      paymentDate: "2026-02-02",
      shippingDate: null,
      collectionDate: null,
      shippingMethod: "EMS",
      releaseDate: "2026-02-15",
    },
    { id: "order-other", userId: otherUserId, title: "Their order" },
  ]);
});

type CommitBody = z.input<typeof addCommitSchema>;
type Ownership = CommitBody["ownership"];
type Shared = Extract<Ownership, { kind: "collection" }>["shared"];
type NewOrderFields = Extract<
  Extract<Ownership, { kind: "order" }>["order"],
  { kind: "new" }
>["fields"];

const toCollection = (overrides: Partial<Shared> = {}): Ownership => ({
  kind: "collection",
  shared: {
    status: "Owned",
    shop: "",
    orderDate: null,
    paymentDate: null,
    shippingDate: null,
    collectionDate: null,
    shippingMethod: "n/a",
    condition: "New",
    count: 1,
    ...overrides,
  },
});

const newOrder = (overrides: Partial<NewOrderFields> = {}): Ownership => ({
  kind: "order",
  order: {
    kind: "new",
    fields: {
      status: "Shipped",
      title: "Summer haul",
      shop: "HLJ",
      orderDate: "2026-04-01",
      releaseDate: null,
      paymentDate: "2026-04-02",
      shippingDate: "2026-04-10",
      collectionDate: null,
      shippingMethod: "DHL",
      shippingFee: 1200,
      taxes: 0,
      duties: 0,
      tariffs: 0,
      miscFees: 0,
      notes: "",
      ...overrides,
    },
  },
});

const bare = (...itemIds: string[]) => itemIds.map((itemId) => ({ itemId, price: null }));

const request = (
  choices: Omit<CommitBody, "commitId" | "wishlist"> & { readonly wishlist?: boolean },
): CommitBody => ({ commitId: crypto.randomUUID(), wishlist: false, ...choices });

async function commit(body: CommitBody, headers: Readonly<Record<string, string>> = {}) {
  const response = await app.handle(
    new Request("http://localhost/api/add/commit", {
      method: "POST",
      headers: { "x-test-user": userId, "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    }),
  );
  const json = response.headers.get("content-type")?.includes("json");
  return {
    status: response.status,
    body: json ? await response.json() : await response.text(),
    headers: response.headers,
  };
}

type ListsBody =
  | z.input<typeof addTargetsToListsSchema>
  | z.input<typeof deleteListsSchema>
  | PositionOrderInput;

async function callLists(method: string, path: string, body: ListsBody) {
  const response = await app.handle(
    new Request(`http://localhost/api/lists${path}`, {
      method,
      headers: { "x-test-user": userId, "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  return { status: response.status, body: await response.text() };
}

const answerOf = (sent: { readonly body: unknown }) => addCommitResponseSchema.parse(sent.body);

const ownedRows = () =>
  db.select().from(collection).where(eq(collection.userId, userId)).orderBy(asc(collection.itemId));
const ownOrders = () =>
  db.select().from(order).where(eq(order.userId, userId)).orderBy(asc(order.createdAt));
const wished = () =>
  db
    .select({ itemId: wishlistItem.itemId, position: wishlistItem.position })
    .from(wishlistItem)
    .where(eq(wishlistItem.userId, userId))
    .orderBy(asc(wishlistItem.position));
const records = () =>
  db
    .select({ userId: addCommit.userId, commitId: addCommit.commitId })
    .from(addCommit)
    .orderBy(asc(addCommit.userId), asc(addCommit.commitId));
const age = (commitId: string) =>
  db.execute(
    sql`update add_commit set created_at = created_at - interval '11 minutes' where commit_id = ${commitId}`,
  );
const members = () =>
  db
    .select({
      listId: listMember.listId,
      itemId: listMember.itemId,
      collectionId: listMember.collectionId,
    })
    .from(listMember)
    .orderBy(asc(listMember.listId), asc(listMember.position));

const untouched = {
  collection: [],
  orders: [expect.objectContaining({ id: "order-existing", releaseDate: "2026-02-15" })],
  wishlist: [],
  members: [],
};

async function written() {
  return {
    collection: await ownedRows(),
    orders: await ownOrders(),
    wishlist: await wished(),
    members: await members(),
  };
}

test("a Collection commit answers each row with its new Collection Item", async () => {
  const sent = await commit(request({ rows: bare("item-1", "item-3"), ownership: toCollection() }));

  const rows = await ownedRows();
  expect(sent.status).toBe(200);
  expect(sent.body).toEqual({
    committed: [
      {
        itemId: "item-1",
        externalId: 186,
        title: "Nendoroid Hatsune Miku",
        image: "miku.jpg",
        collectionId: rows[0]?.id,
      },
      {
        itemId: "item-3",
        externalId: null,
        title: "Custom Rin",
        image: null,
        collectionId: rows[1]?.id,
      },
    ],
    orderId: null,
    wishlistAdded: 0,
    listIds: [],
  });
  expect(rows.map((row) => row.itemId)).toEqual(["item-1", "item-3"]);
});

test.each([
  { status: "Owned", dateField: "collectionDate" },
  { status: "Ordered", dateField: "orderDate" },
  { status: "Paid", dateField: "paymentDate" },
  { status: "Shipped", dateField: "shippingDate" },
] as const)("a Collection commit with status $status keeps its $dateField", async (choice) => {
  const dated: Partial<Shared> = { status: choice.status };
  dated[choice.dateField] = "2026-05-05";
  const sent = await commit(request({ rows: bare("item-1"), ownership: toCollection(dated) }));

  expect(sent.status).toBe(200);
  const [row] = await ownedRows();
  expect(row?.status).toBe(choice.status);
  expect(row?.[choice.dateField]).toBe("2026-05-05");
});

test("a row's own details win over the shared ones, including a cleared date", async () => {
  const sent = await commit(
    request({
      rows: [
        {
          itemId: "item-1",
          price: 3000,
          shop: "Mandarake",
          count: 2,
          condition: "Pre-Owned",
          orderDate: null,
          collectionDate: "2026-07-07",
          score: "9.5",
          tags: ["shelf"],
          notes: "Box dented",
        },
        { itemId: "item-2", price: null },
      ],
      ownership: toCollection({
        shop: "AmiAmi",
        orderDate: "2026-01-10",
        collectionDate: "2026-06-30",
        shippingMethod: "SAL",
        count: 1,
        condition: "New",
      }),
    }),
  );

  expect(sent.status).toBe(200);
  const [first, second] = await ownedRows();
  expect(first).toMatchObject({
    shop: "Mandarake",
    count: 2,
    condition: "Pre-Owned",
    orderDate: null,
    collectionDate: "2026-07-07",
    shippingMethod: "SAL",
    price: 3000,
    score: "9.5",
    tags: ["shelf"],
    notes: "Box dented",
  });
  expect(second).toMatchObject({
    shop: "AmiAmi",
    count: 1,
    condition: "New",
    orderDate: "2026-01-10",
    collectionDate: "2026-06-30",
    shippingMethod: "SAL",
    score: "0.0",
    tags: [],
    notes: "",
  });
});

test("a blank price takes the latest release price only in the user's currency", async () => {
  const sent = await commit(
    request({ rows: bare("item-1", "item-2", "item-3"), ownership: toCollection() }),
  );

  expect(sent.status).toBe(200);
  const rows = await ownedRows();
  expect(rows.map(({ itemId, price, releaseId }) => ({ itemId, price, releaseId }))).toEqual([
    { itemId: "item-1", price: 4500, releaseId: "00000000-0000-4000-8000-000000000002" },
    { itemId: "item-2", price: 0, releaseId: "00000000-0000-4000-8000-000000000003" },
    { itemId: "item-3", price: 0, releaseId: null },
  ]);
});

test("a new Order's items take its status, shop, dates and shipping and advance its release date", async () => {
  const sent = await commit(
    request({
      rows: [
        { itemId: "item-1", price: null, count: 2, shop: "ignored", orderDate: "2020-01-01" },
        { itemId: "item-2", price: 2500, condition: "Pre-Owned", notes: "Loose" },
      ],
      ownership: newOrder(),
    }),
  );

  const [created] = await db.select().from(order).where(eq(order.title, "Summer haul"));
  expect(sent.status).toBe(200);
  expect(answerOf(sent).orderId).toBe(created?.id ?? "no order");
  expect(created).toMatchObject({ status: "Shipped", shop: "HLJ", releaseDate: "2026-06-01" });
  const terms = {
    orderId: created?.id,
    status: "Shipped",
    shop: "HLJ",
    orderDate: "2026-04-01",
    paymentDate: "2026-04-02",
    shippingDate: "2026-04-10",
    collectionDate: null,
    shippingMethod: "DHL",
  };
  expect(await ownedRows()).toMatchObject([
    { ...terms, itemId: "item-1", price: 4500, count: 2, condition: "New" },
    { ...terms, itemId: "item-2", price: 2500, count: 1, condition: "Pre-Owned", notes: "Loose" },
  ]);
});

test("an existing Order's new items inherit its terms and advance its release date", async () => {
  const sent = await commit(
    request({
      rows: bare("item-1"),
      ownership: { kind: "order", order: { kind: "existing", orderId: "order-existing" } },
    }),
  );

  expect(sent.status).toBe(200);
  expect(answerOf(sent).orderId).toBe("order-existing");
  expect(await ownedRows()).toMatchObject([
    {
      orderId: "order-existing",
      status: "Paid",
      shop: "AmiAmi",
      orderDate: "2026-02-01",
      paymentDate: "2026-02-02",
      shippingDate: null,
      collectionDate: null,
      shippingMethod: "EMS",
    },
  ]);
  const [existing] = await db.select().from(order).where(eq(order.id, "order-existing"));
  expect(existing?.releaseDate).toBe("2026-06-01");
});

test.each(["order-other", "order-missing"])(
  "a commit to %s answers 404 and writes nothing",
  async (orderId) => {
    const sent = await commit(
      request({
        rows: bare("item-1"),
        ownership: { kind: "order", order: { kind: "existing", orderId } },
        wishlist: true,
      }),
    );

    expect(sent).toMatchObject({ status: 404, body: "Order not found" });
    expect(await written()).toEqual(untouched);
    expect(await db.select().from(collection)).toEqual([]);
  },
);

test("Not owned with Wishlist adds each Item once and keeps an earlier Wishlist entry", async () => {
  await db.insert(wishlistItem).values({ userId, itemId: "item-2", position: 0 });

  const sent = await commit(
    request({ rows: bare("item-1", "item-2"), ownership: { kind: "none" }, wishlist: true }),
  );

  expect(sent.status).toBe(200);
  expect(sent.body).toMatchObject({
    committed: [
      { itemId: "item-1", collectionId: null },
      { itemId: "item-2", collectionId: null },
    ],
    orderId: null,
    wishlistAdded: 1,
  });
  expect(await wished()).toEqual([
    { itemId: "item-2", position: 0 },
    { itemId: "item-1", position: 1 },
  ]);
  expect(await ownedRows()).toEqual([]);
});

test.each([
  { destination: "Collection", ownership: toCollection(), member: "collectionItem" },
  { destination: "a new Order", ownership: newOrder(), member: "collectionItem" },
  { destination: "Not owned", ownership: { kind: "none" }, member: "item" },
] as const)("$destination with Lists adds each row to every List as a $member", async (choice) => {
  const sent = await commit(
    request({
      rows: bare("item-1", "item-2"),
      ownership: choice.ownership,
      listIds: ["list-1", "list-2"],
    }),
  );

  expect(sent.status).toBe(200);
  expect(answerOf(sent).listIds).toEqual(["list-1", "list-2"]);
  const owned = await ownedRows();
  const targets =
    choice.member === "item"
      ? ["item-1", "item-2"].map((itemId) => ({ itemId, collectionId: null }))
      : owned.map((row) => ({ itemId: null, collectionId: row.id }));
  expect(owned).toHaveLength(choice.member === "item" ? 0 : 2);
  expect(await members()).toEqual(
    ["list-1", "list-2"].flatMap((listId) => targets.map((target) => ({ listId, ...target }))),
  );
});

test("an Item deleted from the item database answers ItemsMissing and writes nothing", async () => {
  const sent = await commit(
    request({ rows: bare("item-1", "item-gone"), ownership: newOrder(), wishlist: true }),
  );

  expect(sent).toMatchObject({
    status: 404,
    body: "Some items are no longer in the item database",
  });
  expect(await written()).toEqual(untouched);
});

test("a List the viewer does not own rolls back the Collection Items, the Order and the Wishlist", async () => {
  const before = await written();

  const sent = await commit(
    request({
      rows: bare("item-1", "item-2"),
      ownership: newOrder(),
      wishlist: true,
      listIds: ["list-1", "list-other"],
    }),
  );

  expect(sent).toMatchObject({ status: 404, body: "List or selection not found" });
  expect(await written()).toEqual(before);
});

test("an unverified email answers 403 and writes nothing", async () => {
  const sent = await commit(
    request({ rows: bare("item-1"), ownership: toCollection(), wishlist: true }),
    { "x-test-unverified": "1" },
  );

  expect(sent).toMatchObject({ status: 403, body: EMAIL_VERIFICATION_REQUIRED });
  expect(await ownedRows()).toEqual([]);
  expect(await wished()).toEqual([]);
});

test("the 121st commit in an hour answers 429", async () => {
  const body = request({ rows: bare("item-1"), ownership: { kind: "none" }, wishlist: true });
  for (let count = 1; count <= 120; count += 1) {
    const sent = await commit(body);
    expect(sent.status).toBe(200);
  }

  const limited = await commit(body);

  expect(limited.status).toBe(429);
  expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
});

test("a repeat of a commit answers its first answer and writes nothing more", async () => {
  const body = request({
    rows: bare("item-1", "item-2"),
    ownership: newOrder(),
    wishlist: true,
    listIds: ["list-1"],
  });
  const first = await commit(body);
  const afterFirst = await written();

  const repeat = await commit(body);

  expect(first.status).toBe(200);
  expect(repeat).toMatchObject({ status: 200, body: first.body });
  expect(await written()).toEqual(afterFirst);
  expect(afterFirst.collection).toHaveLength(2);
});

test("a commit id reused with different choices answers 409 and writes nothing more", async () => {
  const body = request({ rows: bare("item-1"), ownership: toCollection() });
  const first = await commit(body);
  expect(first.status).toBe(200);
  const afterFirst = await written();

  const reused = await commit({ ...body, rows: bare("item-2") });

  expect(reused).toMatchObject({
    status: 409,
    body: "These items were already added with different choices",
  });
  expect(await written()).toEqual(afterFirst);
});

test("a commit that failed leaves no answer, so its retry writes", async () => {
  const body = request({ rows: bare("item-1", "item-late"), ownership: toCollection() });
  const failed = await commit(body);
  expect(failed.status).toBe(404);
  expect(await records()).toEqual([]);
  await db.insert(item).values({ id: "item-late", externalId: 2000, title: "Late arrival" });

  const retried = await commit(body);

  expect(retried.status).toBe(200);
  const rows = await ownedRows();
  expect(rows.map((row) => row.itemId)).toEqual(["item-1", "item-late"]);
});

test("a commit whose transaction fails at COMMIT leaves no answer, so its retry writes", async () => {
  await db.execute(sql`
    CREATE FUNCTION refuse_commit() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'refused at commit'; END $$`);
  await db.execute(sql`
    CREATE CONSTRAINT TRIGGER refuse_commit AFTER INSERT ON collection
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION refuse_commit()`);
  const body = request({ rows: bare("item-1"), ownership: toCollection() });
  let refused;
  try {
    refused = await commit(body);
  } finally {
    await db.execute(sql`DROP TRIGGER refuse_commit ON collection`);
    await db.execute(sql`DROP FUNCTION refuse_commit()`);
  }
  const recordsAfterRefusal = await records();

  const retried = await commit(body);

  const rows = await ownedRows();
  expect(refused).toMatchObject({ status: 500, body: "Failed to add the items" });
  expect(recordsAfterRefusal).toEqual([]);
  expect(retried.status).toBe(200);
  expect(rows).toHaveLength(1);
  expect(answerOf(retried).committed[0]?.collectionId).toBe(rows[0]?.id);
});

async function lockWaiters() {
  const [row] = await db.execute<{ waiting: number }>(
    sql`select count(*)::integer as waiting from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock'`,
  );
  return row?.waiting ?? 0;
}

async function untilLockWaiters(count: number) {
  for (let polls = 0; (await lockWaiters()) < count; polls += 1) {
    if (polls > 200) throw new Error(`${count} requests never waited on a lock`);
    await Bun.sleep(10);
  }
}

test("two requests with one commit id at once write once and answer alike", async () => {
  const body = request({ rows: bare("item-1"), ownership: toCollection(), listIds: ["list-1"] });
  const locked = Promise.withResolvers<null>();
  const release = Promise.withResolvers<null>();
  // Holding the List lock keeps the first request inside its transaction, past its writes.
  const holder = db.transaction(async (tx) => {
    await tx.select({ id: list.id }).from(list).where(eq(list.id, "list-1")).for("update");
    locked.resolve(null);
    await release.promise;
  });
  await locked.promise;

  const both = Promise.all([commit(body), commit(body)]);
  await untilLockWaiters(2);
  release.resolve(null);
  await holder;
  const [first, second] = await both;

  expect(first.status).toBe(200);
  expect(second).toMatchObject({ status: 200, body: first.body });
  expect(await ownedRows()).toHaveLength(1);
  expect(await members()).toHaveLength(1);
  expect(await records()).toEqual([{ userId, commitId: body.commitId }]);
});

test("a repeat after 10 minutes is a new commit and takes over the expired record", async () => {
  const body = request({ rows: bare("item-1"), ownership: toCollection() });
  const first = await commit(body);
  await age(body.commitId);

  const late = await commit({ ...body, rows: bare("item-2") });

  const rows = await ownedRows();
  expect(first.status).toBe(200);
  expect(late.status).toBe(200);
  expect(rows.map((row) => row.itemId)).toEqual(["item-1", "item-2"]);
  expect(await records()).toEqual([{ userId, commitId: body.commitId }]);
  expect(await commit({ ...body, rows: bare("item-2") })).toMatchObject({ body: late.body });
});

test("a commit deletes the viewer's expired records and keeps live ones and other users'", async () => {
  const wish = () => request({ rows: bare("item-1"), ownership: { kind: "none" }, wishlist: true });
  const [expired, live, theirs, next] = [wish(), wish(), wish(), wish()];
  await commit(expired);
  await commit(live);
  await commit(theirs, { "x-test-user": otherUserId });
  await age(expired.commitId);
  await age(theirs.commitId);

  const sent = await commit(next);

  const kept = await records();
  expect(sent.status).toBe(200);
  expect(kept).toHaveLength(3);
  expect(kept).toEqual(
    expect.arrayContaining([
      { userId, commitId: live.commitId },
      { userId, commitId: next.commitId },
      { userId: otherUserId, commitId: theirs.commitId },
    ]),
  );
});

/** Holds list-1 so requests stop inside their transactions, past their claim of the commit id. */
function holdList() {
  const locked = Promise.withResolvers<null>();
  const release = Promise.withResolvers<null>();
  const holder = db.transaction(async (tx) => {
    await tx.select({ id: list.id }).from(list).where(eq(list.id, "list-1")).for("update");
    locked.resolve(null);
    await release.promise;
  });
  return {
    locked: locked.promise,
    release: async () => {
      release.resolve(null);
      await holder;
    },
  };
}

test("a request waiting on a commit id claims it when the holder rolls back", async () => {
  await db.execute(sql`CREATE SEQUENCE refuse_once`);
  await db.execute(sql`
    CREATE FUNCTION refuse_once() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF nextval('refuse_once') = 1 THEN RAISE EXCEPTION 'refused once at commit'; END IF;
      RETURN NULL;
    END $$`);
  await db.execute(sql`
    CREATE CONSTRAINT TRIGGER refuse_once AFTER INSERT ON collection
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION refuse_once()`);
  const body = request({ rows: bare("item-1"), ownership: toCollection(), listIds: ["list-1"] });
  const held = holdList();
  await held.locked;
  let answers;
  try {
    const both = Promise.all([commit(body), commit(body)]);
    await untilLockWaiters(2);
    await held.release();
    answers = await both;
  } finally {
    await db.execute(sql`DROP TRIGGER refuse_once ON collection`);
    await db.execute(sql`DROP FUNCTION refuse_once()`);
    await db.execute(sql`DROP SEQUENCE refuse_once`);
  }

  const rows = await ownedRows();
  expect(answers.map((answer) => answer.status).toSorted()).toEqual([200, 500]);
  const saved = answers.find((answer) => answer.status === 200);
  expect(rows).toHaveLength(1);
  expect(saved && answerOf(saved).committed[0]?.collectionId).toBe(rows[0]?.id);
  expect(await records()).toEqual([{ userId, commitId: body.commitId }]);
});

test("two repeats of an expired commit at once write once more and answer alike", async () => {
  const body = request({ rows: bare("item-1"), ownership: toCollection(), listIds: ["list-1"] });
  const first = await commit(body);
  await age(body.commitId);
  const held = holdList();
  await held.locked;

  const both = Promise.all([commit(body), commit(body)]);
  await untilLockWaiters(2);
  await held.release();
  const [one, other] = await both;

  const rows = await ownedRows();
  expect(first.status).toBe(200);
  expect(one.status).toBe(200);
  expect(other).toMatchObject({ status: 200, body: one.body });
  expect(one.body).not.toEqual(first.body);
  expect(rows).toHaveLength(2);
  expect(await records()).toEqual([{ userId, commitId: body.commitId }]);
});

test("a commit to an Order with Lists and adding that Order to the List at once both succeed", async () => {
  const locked = Promise.withResolvers<null>();
  const release = Promise.withResolvers<null>();
  // Holding the Wishlist lock stops the commit after it has locked its Lists and Order.
  const holder = db.transaction(async (tx) => {
    await lockWishlist(tx, userId);
    locked.resolve(null);
    await release.promise;
  });
  await locked.promise;

  const committing = commit(
    request({
      rows: bare("item-1"),
      ownership: { kind: "order", order: { kind: "existing", orderId: "order-existing" } },
      wishlist: true,
      listIds: ["list-1"],
    }),
  );
  await untilLockWaiters(1);
  const listing = callLists("PUT", "/targets", {
    targets: [{ type: "order", id: "order-existing" }],
    listIds: ["list-1"],
  });
  await untilLockWaiters(2);
  release.resolve(null);
  await holder;
  const [committed, listed] = await Promise.all([committing, listing]);

  expect(committed.status).toBe(200);
  expect(listed.status).toBe(200);
  expect(
    await db.select().from(listMember).where(eq(listMember.orderId, "order-existing")),
  ).toHaveLength(1);
});

test.each([
  {
    route: "moving Lists",
    call: () =>
      callLists("PATCH", "/order", {
        movedIds: ["list-z"],
        anchorId: "list-a",
        placement: "after",
      }),
  },
  {
    route: "deleting Lists",
    call: () => callLists("DELETE", "/", { listIds: ["list-z", "list-a"] }),
  },
])("a commit to several Lists and $route at once both finish", async ({ call }) => {
  // list-z comes first by position and by table order, so only an id-ordered lock agrees with Add.
  await db.insert(list).values([
    { id: "list-z", userId, title: "Z", position: 0 },
    { id: "list-a", userId, title: "A", position: 1 },
  ]);
  const locked = Promise.withResolvers<null>();
  const release = Promise.withResolvers<null>();
  const holder = db.transaction(async (tx) => {
    await tx.select({ id: list.id }).from(list).where(eq(list.id, "list-a")).for("update");
    locked.resolve(null);
    await release.promise;
  });
  await locked.promise;

  const committing = commit(
    request({ rows: bare("item-1"), ownership: toCollection(), listIds: ["list-a", "list-z"] }),
  );
  await untilLockWaiters(1);
  const other = call();
  await untilLockWaiters(2);
  release.resolve(null);
  await holder;
  const [committed, answered] = await Promise.all([committing, other]);

  expect(committed.status).toBe(200);
  expect(answered.status).toBe(200);
});
