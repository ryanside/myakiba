import { beforeEach, describe, expect, mock, test } from "bun:test";
import { Elysia } from "elysia";
import { initLogger } from "evlog";
import path from "node:path";
import { asc, eq } from "drizzle-orm";
import * as z from "zod";
import * as authSchema from "@myakiba/db/schema/auth";
import {
  collection,
  entry,
  entry_to_item,
  item,
  item_release,
  list,
} from "@myakiba/db/schema/figure";
import type { addCommitSchema } from "@myakiba/contracts/add/schema";

import { createTestDatabase } from "../../test/database";
import type { CollectionUpdateType } from "./collection/model";
import type { addTargetsToListsSchema } from "./lists/model";

initLogger({ enabled: false });

await mock.module("@myakiba/auth/server", () => ({
  auth: {
    handler: () => new Response(null, { status: 404 }),
    api: {
      getSession: async ({ headers }: { headers: Headers }) => {
        const id = headers.get("x-test-user");
        if (!id) return null;
        return { user: { id, emailVerified: true, currency: "JPY" }, session: { id: `s-${id}` } };
      },
    },
  },
}));
await mock.module("@myakiba/redis/client", () => ({
  redis: { eval: async () => [1, 1800] },
}));

const db = await createTestDatabase();
const { default: itemRouter } = await import("./item/index");
const { default: mfcItemsRouter } = await import("./mfc-items/index");
const { default: searchRouter } = await import("./search/index");
const { default: addRouter } = await import("./add/index");
const { default: wishlistRouter } = await import("./wishlist/index");
const { default: listsRouter } = await import("./lists/index");
const { default: collectionRouter } = await import("./collection/index");
const app = new Elysia({ prefix: "/api" })
  .use(itemRouter)
  .use(mfcItemsRouter)
  .use(searchRouter)
  .use(addRouter)
  .use(wishlistRouter)
  .use(listsRouter)
  .use(collectionRouter);

const ALICE = "user-alice";
const BOB = "user-bob";
const MFC_ID = 98_777;
const fixtures = path.join(import.meta.dir, "../../../../packages/mfc/fixtures");
const page = await Bun.file(path.join(fixtures, "item-98777.html")).text();

function edit(html: string, from: string, to: string): string {
  if (!html.includes(from)) throw new Error(`fixture has no ${from}`);
  return html.replaceAll(from, to);
}

const FORGED_TITLE = "Hello, Good-bye - Yukishiro May - 1/7 (Forged)";
const forgedPage = edit(
  edit(page, "(Orchid Seed)</h1>", "(Forged)</h1>"),
  ">Minheru</span>",
  ">Forged Sculptor</span>",
);

type RequestBody =
  | FormData
  | z.input<typeof addCommitSchema>
  | z.input<typeof addTargetsToListsSchema>
  | CollectionUpdateType;

function requestOf(as: string, method: string, url: string, body?: RequestBody): Request {
  const headers = new Headers({ "x-test-user": as });
  if (body === undefined || body instanceof FormData) {
    return new Request(`http://localhost/api${url}`, { method, headers, body });
  }
  headers.set("content-type", "application/json");
  return new Request(`http://localhost/api${url}`, {
    method,
    headers,
    body: JSON.stringify(body),
  });
}

async function call(as: string, method: string, url: string, body?: RequestBody) {
  const response = await app.handle(requestOf(as, method, url, body));
  const json = response.headers.get("content-type")?.includes("json");
  return { status: response.status, body: json ? await response.json() : await response.text() };
}

async function bodyOf(as: string, method: string, url: string, body?: RequestBody) {
  const answered = await call(as, method, url, body);
  return answered.body;
}

function pageForm(html: string, mfcItemId?: number) {
  const form = new FormData();
  if (mfcItemId !== undefined) form.set("mfcItemId", String(mfcItemId));
  form.set("page", new File([html], "page.html", { type: "text/html" }));
  return form;
}

const savedSchema = z.object({ saved: z.enum(["created", "existing"]), itemId: z.string() });
const releasesSchema = z.object({ releases: z.array(z.object({ id: z.string() })) });
const itemPageSchema = z.object({
  item: z.object({
    title: z.string(),
    entries: z.array(z.object({ id: z.string(), name: z.string() })),
  }),
});

async function ingest(as: string, html = page) {
  return savedSchema.parse(await bodyOf(as, "POST", "/mfc-items", pageForm(html, MFC_ID)));
}

const toCollection = {
  kind: "collection",
  shared: { shop: "", collectionDate: null, shippingMethod: "n/a", condition: "New", count: 1 },
} as const;

function addCommit(
  rows: readonly { itemId: string; releaseId?: string }[],
  listIds: string[] = [],
) {
  return {
    commitId: crypto.randomUUID(),
    wishlist: false,
    rows: rows.map((row) => ({ price: null, ...row })),
    ownership: toCollection,
    listIds,
  };
}

async function aliceHolds() {
  const { itemId } = await ingest(ALICE);
  const { releases } = releasesSchema.parse(await bodyOf(ALICE, "GET", `/item/${itemId}/releases`));
  const { item: shown } = itemPageSchema.parse(await bodyOf(ALICE, "GET", `/item/${MFC_ID}`));
  const sculptor = shown.entries.find((shownEntry) => shownEntry.name === "Minheru");
  const [release] = releases;
  if (!sculptor || !release) throw new Error("the fixture page has no Minheru or no release");
  await db.insert(list).values({ id: "list-alice", userId: ALICE, title: "Alice's shelf" });
  expect(
    await call(ALICE, "POST", "/add/commit", addCommit([{ itemId }], ["list-alice"])),
  ).toMatchObject({ status: 200 });
  const [collected] = await db
    .select({ id: collection.id })
    .from(collection)
    .where(eq(collection.userId, ALICE));
  if (!collected) throw new Error("Alice's commit wrote no Collection Item");
  return {
    itemId,
    releaseId: release.id,
    entryId: sculptor.id,
    listId: "list-alice",
    collectionId: collected.id,
  };
}

type Held = Awaited<ReturnType<typeof aliceHolds>>;

async function aliceSees(held: Held) {
  const [itemRow] = await db.select().from(item).where(eq(item.id, held.itemId));
  const links = await db
    .select()
    .from(entry_to_item)
    .where(eq(entry_to_item.itemId, held.itemId))
    .orderBy(asc(entry_to_item.entryId));
  const entries = await db
    .select()
    .from(entry)
    .innerJoin(entry_to_item, eq(entry_to_item.entryId, entry.id))
    .where(eq(entry_to_item.itemId, held.itemId))
    .orderBy(asc(entry.id));
  const releases = await db
    .select()
    .from(item_release)
    .where(eq(item_release.itemId, held.itemId))
    .orderBy(asc(item_release.id));
  const collected = await db.select().from(collection).where(eq(collection.userId, ALICE));
  return {
    itemPage: await call(ALICE, "GET", `/item/${MFC_ID}`),
    search: await call(ALICE, "GET", `/search/items?query=${MFC_ID}`),
    members: await call(ALICE, "GET", `/lists/${held.listId}/members`),
    rows: { itemRow, links, entries, releases, collected },
  };
}

beforeEach(async () => {
  await db.execute('TRUNCATE "user", item, entry CASCADE');
  await db.insert(authSchema.user).values([
    { id: ALICE, name: "Alice", email: "alice@example.com", username: "alice" },
    { id: BOB, name: "Bob", email: "bob@example.com", username: "bob" },
  ]);
  await db.insert(list).values({ id: "list-bob", userId: BOB, title: "Bob's shelf" });
});

const NOT_IN_DATABASE = { status: 404, body: "Some items are no longer in the item database" };
const NOT_A_RELEASE = { status: 404, body: "A chosen release is not a release of its item" };

describe("Bob sends Alice's ids, gets 404 or nothing, and Alice's rows stay as they were", () => {
  const cases: readonly [string, (held: Held) => ReturnType<typeof call>, object][] = [
    [
      "the Item page of her MFC id",
      () => call(BOB, "GET", `/item/${MFC_ID}`),
      { status: 404, body: "Item not found" },
    ],
    [
      "her Item's releases",
      (held) => call(BOB, "GET", `/item/${held.itemId}/releases`),
      { status: 200, body: { releases: [] } },
    ],
    [
      "an Item Refresh of her MFC id",
      () => call(BOB, "POST", `/item/${MFC_ID}/resync`, pageForm(forgedPage)),
      { status: 404, body: "Item not found" },
    ],
    [
      "the Add page's items for her Item",
      (held) => call(BOB, "GET", `/add/items?ids=${held.itemId}`),
      { status: 200, body: { items: [] } },
    ],
    [
      "an Add commit of her Item",
      (held) => call(BOB, "POST", "/add/commit", addCommit([{ itemId: held.itemId }])),
      NOT_IN_DATABASE,
    ],
    [
      "a Wishlist add of her Item",
      (held) => call(BOB, "PUT", `/wishlist/${held.itemId}`),
      { status: 404, body: "Item not found" },
    ],
    [
      "a List add of her Item",
      (held) =>
        call(BOB, "PUT", "/lists/targets", {
          targets: [{ type: "item", id: held.itemId }],
          listIds: ["list-bob"],
        }),
      { status: 404, body: "List or selection not found" },
    ],
    [
      "a List add into her List",
      (held) =>
        call(BOB, "PUT", "/lists/targets", {
          targets: [{ type: "item", id: held.itemId }],
          listIds: [held.listId],
        }),
      { status: 404, body: "List or selection not found" },
    ],
    [
      "her List's members",
      (held) => call(BOB, "GET", `/lists/${held.listId}/members`),
      { status: 404, body: "List not found" },
    ],
    [
      "the item database search for her MFC id",
      () => call(BOB, "GET", `/search/items?query=${MFC_ID}`),
      { status: 200, body: { items: [], totalCount: 0 } },
    ],
    [
      "the entry search for her Item Entry",
      () => call(BOB, "GET", "/search/entries?search=Minheru"),
      { status: 200, body: { entries: [] } },
    ],
    [
      "a Collection filter by her Item Entry",
      (held) => call(BOB, "GET", `/collection?entries=${held.entryId}`),
      { status: 200, body: { items: [], totalCount: 0 } },
    ],
  ];

  test.each(cases)("%s", async (_, send, answer) => {
    const held = await aliceHolds();
    const before = await aliceSees(held);

    expect(await send(held)).toMatchObject(answer);

    expect(await aliceSees(held)).toEqual(before);
  });

  test("an Add commit of his own Item with her release", async () => {
    const held = await aliceHolds();
    const before = await aliceSees(held);
    const { itemId } = await ingest(BOB);

    expect(
      await call(BOB, "POST", "/add/commit", addCommit([{ itemId, releaseId: held.releaseId }])),
    ).toEqual(NOT_A_RELEASE);

    expect(await aliceSees(held)).toEqual(before);
  });

  test("an edit of his own Collection Item that selects her release", async () => {
    const held = await aliceHolds();
    const before = await aliceSees(held);
    const { itemId } = await ingest(BOB);
    expect(await call(BOB, "POST", "/add/commit", addCommit([{ itemId }]))).toMatchObject({
      status: 200,
    });
    const [own] = await db.select().from(collection).where(eq(collection.userId, BOB));
    if (!own) throw new Error("Bob's commit wrote no Collection Item");

    const edited = await call(BOB, "PUT", `/collection/${own.id}`, {
      status: own.status,
      count: own.count,
      score: own.score,
      price: own.price,
      shop: own.shop,
      orderDate: own.orderDate,
      paymentDate: own.paymentDate,
      shippingDate: own.shippingDate,
      collectionDate: own.collectionDate,
      shippingMethod: own.shippingMethod,
      tags: own.tags,
      notes: "",
      releaseId: held.releaseId,
      releaseDate: null,
      releasePrice: null,
      releaseCurrency: null,
      releaseBarcode: null,
      releaseType: null,
      condition: own.condition,
    });

    expect(edited).toEqual(NOT_A_RELEASE);
    expect(await aliceSees(held)).toEqual(before);
  });
});

test("Bob's forged page for an MFC id Alice holds makes his own Item and changes nothing Alice reads", async () => {
  const held = await aliceHolds();
  const before = await aliceSees(held);

  const saved = await ingest(BOB, forgedPage);

  expect(saved.saved).toBe("created");
  expect(saved.itemId).not.toBe(held.itemId);
  expect(await aliceSees(held)).toEqual(before);
  const { item: bobs } = itemPageSchema.parse(await bodyOf(BOB, "GET", `/item/${MFC_ID}`));
  expect(bobs.title).toBe(FORGED_TITLE);
  expect(bobs.entries.map((shown) => shown.name)).toContain("Forged Sculptor");
});

test("Bob's Item Refresh renames only his own Item Entries", async () => {
  const held = await aliceHolds();
  await ingest(BOB);
  const before = await aliceSees(held);

  expect(await call(BOB, "POST", `/item/${MFC_ID}/resync`, pageForm(forgedPage))).toEqual({
    status: 200,
    body: { saved: "refreshed" },
  });

  expect(await aliceSees(held)).toEqual(before);
  const { item: bobs } = itemPageSchema.parse(await bodyOf(BOB, "GET", `/item/${MFC_ID}`));
  expect(bobs.entries.map((shown) => shown.name)).toContain("Forged Sculptor");
  expect(bobs.entries.map((shown) => shown.id)).not.toContain(held.entryId);
});

test("the item database search shows each user only their own Items", async () => {
  const held = await aliceHolds();
  const { itemId } = await ingest(BOB);

  const searched = z
    .object({ items: z.array(z.object({ itemId: z.string() })), totalCount: z.number() })
    .parse(await bodyOf(BOB, "GET", "/search/items"));

  expect(searched).toEqual({ items: [{ itemId }], totalCount: 1 });
  expect(itemId).not.toBe(held.itemId);
});
