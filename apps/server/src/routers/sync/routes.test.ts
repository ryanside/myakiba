import { beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import path from "node:path";
import { Elysia } from "elysia";
import { initLogger } from "evlog";
import { asc, eq, sql } from "drizzle-orm";
import * as z from "zod";
import { SYNC_RUN_LEASE_MS } from "@myakiba/contracts/sync/constants";
import { SYNC_STATUS_MESSAGES } from "@myakiba/contracts/sync/messages";
import type { SyncJobStatus } from "@myakiba/contracts/sync/schema";
import * as authSchema from "@myakiba/db/schema/auth";
import {
  collection,
  item,
  item_release,
  order,
  syncSession,
  syncSessionItem,
} from "@myakiba/db/schema/figure";
import { mfcItemId } from "@myakiba/mfc/page";
import { parseMfcItemPage } from "@myakiba/mfc/parse";
import type { MfcItemPage } from "@myakiba/mfc/parse";
import {
  getJobStatusChannel,
  getJobStatusSnapshotKey,
  parseJobStatusPayload,
  writeJobStatusSnapshotAndPublish,
} from "@myakiba/redis/job-status";
import { parseMoneyToMinorUnits } from "@myakiba/utils/currency";
import { createTestDatabase } from "../../../test/database";
import { createItemImages } from "@/lib/item-images";

initLogger({ enabled: false });

const userId = "user-1";

type Listener = (channel: string, message: string) => void;

const redisValues = new Map<string, string>();
const subscribers = new Set<Listener>();
let failS3 = false;
const rateKeys: string[] = [];
let failureRequests = 1;
let statusReadFailures = 0;
const statusReads = new Map<string, number>();

function subscriber() {
  const channels = new Set<string>();
  const relays = new Map<Listener, Listener>();
  const connection = {
    on(event: string, listener: Listener) {
      if (event !== "message") return connection;
      const relay: Listener = (channel, message) => {
        if (channels.has(channel)) listener(channel, message);
      };
      relays.set(listener, relay);
      subscribers.add(relay);
      return connection;
    },
    off(_event: string, listener: Listener) {
      const relay = relays.get(listener);
      if (relay) subscribers.delete(relay);
      return connection;
    },
    subscribe: async (channel: string) => channels.add(channel).size,
    unsubscribe: async (channel: string) => Number(channels.delete(channel)),
    disconnect: () => channels.clear(),
  };
  return connection;
}

await mock.module("@myakiba/redis/client", () => ({
  redis: {
    eval: async (_script: string, _keys: number, key: string, ...args: (string | number)[]) => {
      if (key.startsWith("rl:")) {
        rateKeys.push(key);
        return [key.startsWith("rl:sync-failure:") ? failureRequests : 1, 3600];
      }
      const [channel, raw] = args;
      const decoded = z.tuple([z.string(), z.string()]).parse([channel, raw]);
      const [snapshotChannel, serialized] = decoded;
      const next = parseJobStatusPayload(serialized);
      const current = parseJobStatusPayload(redisValues.get(key) ?? "");
      if ((current?.revision ?? -1) > (next?.revision ?? 0)) return 0;
      redisValues.set(key, serialized);
      for (const relay of subscribers) relay(snapshotChannel, serialized);
      return 1;
    },
    get: async (key: string) => {
      statusReads.set(key, (statusReads.get(key) ?? 0) + 1);
      if (statusReadFailures > 0) {
        statusReadFailures -= 1;
        throw new Error("Redis temporarily unavailable");
      }
      return redisValues.get(key) ?? null;
    },
    del: async (key: string) => Number(redisValues.delete(key)),
    multi() {
      const steps: (() => void)[] = [];
      const chain = {
        set(key: string, value: string) {
          steps.push(() => redisValues.set(key, value));
          return chain;
        },
        publish(channel: string, message: string) {
          steps.push(() => {
            for (const relay of subscribers) relay(channel, message);
          });
          return chain;
        },
        async exec() {
          for (const step of steps) step();
          return steps.map(() => [null, "OK"]);
        },
      };
      return chain;
    },
    duplicate: subscriber,
  },
}));

await mock.module("@myakiba/auth/server", () => ({
  auth: {
    handler: () => new Response(null, { status: 404 }),
    api: {
      getSession: async ({ headers }: { headers: Headers }) => {
        const id = headers.get("x-test-user");
        return id ? { user: { id, emailVerified: true }, session: { id: `session-${id}` } } : null;
      },
    },
  },
}));

await mock.module("@/lib/item-images", () => ({
  createItemImages,
  itemImages: createItemImages({
    client: {
      send: async () => {
        if (failS3) throw new Error("S3 request timed out");
        return { $metadata: { httpStatusCode: 200 } };
      },
    },
    name: "pictures",
    publicUrl: "https://pictures.example.test",
  }),
}));

const db = await createTestDatabase();
const { default: syncRouter } = await import("./index");
const { ensureMfcItem } = await import("@/lib/mfc-item-ingest");
const app = new Elysia({ prefix: "/api" }).use(syncRouter);

const fixtures = path.join(import.meta.dir, "../../../../../packages/mfc/fixtures");
const page98777 = await Bun.file(path.join(fixtures, "item-98777.html")).text();

const PRESENT = 98_777;
const [X, Y, Z] = [100_001, 100_002, 100_003] as const;
const derivedPage = (id: number, releasedOn: string) =>
  page98777
    .replaceAll("98777", String(id))
    .replaceAll("Hello, Good-bye", `Item ${id}`)
    .replaceAll("11/15/2018", releasedOn);
const pages = new Map<number, string>([
  [PRESENT, page98777],
  [X, derivedPage(X, "03/20/2019")],
  [Y, derivedPage(Y, "07/01/2019")],
  [Z, derivedPage(Z, "01/10/2020")],
]);
const derivedChallengePage = await Bun.file(path.join(fixtures, "derived-challenge.html")).text();
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);

function parsedPage(id: number): MfcItemPage {
  const parsed = parseMfcItemPage(pages.get(id) ?? "", mfcItemId(id) ?? never());
  if (!parsed.ok) throw new Error(`fixture for ${id} does not parse: ${parsed.problem.kind}`);
  return parsed.page;
}

function never(): never {
  throw new Error("unreachable");
}

const importItem = (id: number) => db.transaction((tx) => ensureMfcItem(tx, parsedPage(id), null));

beforeEach(async () => {
  await db.execute(sql`TRUNCATE "user", item, entry CASCADE`);
  redisValues.clear();
  failS3 = false;
  rateKeys.length = 0;
  failureRequests = 1;
  statusReadFailures = 0;
  statusReads.clear();
  await db
    .insert(authSchema.user)
    .values({ id: userId, name: "Ryan", email: "r@example.com", username: "ryan" });
  await importItem(PRESENT);
});

type Json = z.infer<ReturnType<typeof z.json>>;

async function answer(response: Response): Promise<{ status: number; body: Json }> {
  const json = response.headers.get("content-type")?.includes("json");
  const body = json ? z.json().parse(await response.json()) : await response.text();
  return { status: response.status, body };
}

const post = async (route: string, body?: Json) =>
  answer(
    await app.handle(
      new Request(`http://localhost/api/sync${route}`, {
        method: "POST",
        headers: { "x-test-user": userId, "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    ),
  );

const get = async (route: string) =>
  answer(
    await app.handle(
      new Request(`http://localhost/api/sync${route}`, { headers: { "x-test-user": userId } }),
    ),
  );

const startedSchema = z.object({
  status: z.string(),
  isFinished: z.boolean(),
  syncSessionId: z.string(),
  jobId: z.string(),
  missingMfcItemIds: z.array(z.number()),
});
type Run = { readonly syncSessionId: string; readonly jobId: string };

async function start(type: string, body: Json) {
  const reply = await post(`/${type}`, body);
  expect(reply.status).toBe(200);
  return startedSchema.parse(reply.body);
}

async function complete(run: Run, id: number, page = pages.get(id) ?? "") {
  const form = new FormData();
  form.set("jobId", run.jobId);
  form.set("mfcItemId", String(id));
  form.set("page", new File([page], "page.html", { type: "text/html" }));
  form.set("picture", new File([JPEG], "picture", { type: "image/jpeg" }));
  return answer(
    await app.handle(
      new Request(`http://localhost/api/sync/sessions/${run.syncSessionId}/items`, {
        method: "POST",
        headers: { "x-test-user": userId },
        body: form,
      }),
    ),
  );
}

const fail = (run: Run, id: number, error = "hidden_or_missing") =>
  post(`/sessions/${run.syncSessionId}/failures`, { jobId: run.jobId, mfcItemId: id, error });
const heartbeat = (run: Run) =>
  post(`/sessions/${run.syncSessionId}/heartbeat`, { jobId: run.jobId });
const interrupt = (run: Run) =>
  post(`/sessions/${run.syncSessionId}/interrupt`, { jobId: run.jobId });

const retrySchema = z.object({ jobId: z.string(), missingMfcItemIds: z.array(z.number()) });
async function retry(syncSessionId: string): Promise<Run & { missingMfcItemIds: number[] }> {
  const reply = await post(`/sessions/${syncSessionId}/retry`);
  expect(reply.status).toBe(200);
  return { syncSessionId, ...retrySchema.parse(reply.body) };
}

const imported = { status: 200, body: { outcome: "imported", reason: null } };
const outcomeSchema = z.object({ outcome: z.string() });

const listedSchema = z.object({
  sessions: z.array(
    z.object({
      status: z.string(),
      statusMessage: z.string(),
      failCount: z.number(),
      canRetry: z.boolean(),
      isRetrying: z.boolean(),
    }),
  ),
});
async function listed(query = "") {
  const reply = await get(`/sessions${query}`);
  return listedSchema.parse(reply.body).sessions;
}

const detailSchema = z.object({
  session: z.object({
    status: z.string(),
    failCount: z.number(),
    items: z.array(
      z.object({
        itemExternalId: z.number(),
        status: z.string(),
        errorReason: z.string().nullable(),
      }),
    ),
  }),
});
const HIDDEN = "MyFigureCollection hides this item. Check your MyFigureCollection content settings";

function snapshot(jobId: string): SyncJobStatus {
  const status = parseJobStatusPayload(redisValues.get(getJobStatusSnapshotKey(jobId)) ?? "");
  if (!status) throw new Error(`no snapshot for ${jobId}`);
  return status;
}

async function session(id: string) {
  const [row] = await db
    .select({
      status: syncSession.status,
      statusMessage: syncSession.statusMessage,
      jobId: syncSession.jobId,
      orderId: syncSession.orderId,
      totalItems: syncSession.totalItems,
      successCount: syncSession.successCount,
      failCount: syncSession.failCount,
    })
    .from(syncSession)
    .where(eq(syncSession.id, id));
  return row;
}

const results = (id: string) =>
  db
    .select({
      id: syncSessionItem.itemExternalId,
      status: syncSessionItem.status,
      reason: syncSessionItem.errorReason,
    })
    .from(syncSessionItem)
    .where(eq(syncSessionItem.syncSessionId, id))
    .orderBy(asc(syncSessionItem.itemExternalId), asc(syncSessionItem.status));

async function release(id: number) {
  const [row] = await db
    .select({ id: item_release.id, date: item_release.date })
    .from(item_release)
    .innerJoin(item, eq(item.id, item_release.itemId))
    .where(eq(item.externalId, id));
  if (!row) throw new Error(`Item ${id} has no release`);
  return row;
}

async function releaseIdOf(id: number) {
  const { id: releaseId } = await release(id);
  return releaseId;
}

async function releaseDateOf(id: number) {
  const { date } = await release(id);
  return date;
}

const userRows = () =>
  db
    .select({
      mfcItemId: item.externalId,
      releaseId: collection.releaseId,
      status: collection.status,
      price: collection.price,
      count: collection.count,
      orderTitle: order.title,
      orderReleaseDate: order.releaseDate,
    })
    .from(collection)
    .innerJoin(item, eq(item.id, collection.itemId))
    .leftJoin(order, eq(order.id, collection.orderId))
    .orderBy(asc(item.externalId), asc(collection.price));

const recent = (id: number) => ({
  externalId: id,
  title: parsedPage(id).title,
  outcome: "succeeded",
  failureReason: null,
});

const dates = (...ids: readonly number[]) => Promise.all(ids.map(releaseDateOf));
const latest = (values: readonly string[]) => values.toSorted().at(-1) ?? null;

async function seedOrder(title = "Existing order") {
  const [row] = await db
    .insert(order)
    .values({ userId, title, status: "Ordered" })
    .returning({ id: order.id });
  if (!row) throw new Error("order was not saved");
  return row.id;
}

const orderItem = (id: number, price: number) => ({
  itemExternalId: id,
  price,
  count: 1,
  status: "Ordered",
  condition: "New",
  shippingMethod: "n/a",
  orderDate: "2026-01-02",
  paymentDate: null,
  shippingDate: null,
  collectionDate: null,
});

const collectionEntry = (id: number, price: number) => ({
  itemExternalId: id,
  price,
  count: 2,
  score: "9.0",
  shop: "AmiAmi",
  orderDate: null,
  paymentDate: null,
  shippingDate: null,
  collectionDate: "2026-01-03",
  shippingMethod: "n/a",
  tags: ["shelf"],
  condition: "New",
  notes: "boxed",
});

const csvRow = (id: number, status: "Owned" | "Ordered", price: string) => ({
  itemExternalId: id,
  status,
  count: 1,
  score: "",
  payment_date: null,
  shipping_date: null,
  collecting_date: null,
  price,
  shop: "Mandarake",
  shipping_method: "n/a",
  note: "from csv",
  orderId: null,
  orderDate: "2026-02-01",
});

type ExpectedRow = Awaited<ReturnType<typeof userRows>>[number];

type SyncCase = {
  readonly type: "item" | "collection" | "order" | "order-item" | "csv";
  readonly rowsPerItem: Readonly<Record<number, number>>;
  readonly body: () => Promise<Json>;
  readonly expectedRows: (ids: readonly number[]) => Promise<ExpectedRow[]>;
};

const orderEntries = [
  orderItem(PRESENT, 1000),
  orderItem(X, 2000),
  orderItem(Y, 3000),
  orderItem(Z, 4000),
];
const collectionEntries = [
  collectionEntry(PRESENT, 100),
  collectionEntry(X, 200),
  collectionEntry(X, 250),
  collectionEntry(Y, 300),
  collectionEntry(Z, 400),
];
const csvRows = [
  csvRow(PRESENT, "Ordered", "10.00"),
  csvRow(X, "Ordered", "20.00"),
  csvRow(Y, "Owned", "30.00"),
  csvRow(Z, "Ordered", "40.00"),
];

async function orderRows(ids: readonly number[], title: string, entries = orderEntries) {
  const orderReleaseDate = latest(await dates(...ids));
  return Promise.all(
    entries
      .filter((entry) => ids.includes(entry.itemExternalId))
      .map(async (entry) => ({
        mfcItemId: entry.itemExternalId,
        releaseId: await releaseIdOf(entry.itemExternalId),
        status: "Ordered" as const,
        price: entry.price,
        count: 1,
        orderTitle: title,
        orderReleaseDate,
      })),
  );
}

let seededOrderId = "";

const orderBody = (items: ReturnType<typeof orderItem>[]) => ({
  status: "Ordered",
  title: "Spring preorders",
  shop: "AmiAmi",
  orderDate: "2026-01-02",
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
  items,
});

const cases: SyncCase[] = [
  {
    type: "item",
    rowsPerItem: { [PRESENT]: 1, [X]: 1, [Y]: 1, [Z]: 1 },
    body: async () => ({ items: [PRESENT, X, Y, Z] }),
    expectedRows: async () => [],
  },
  {
    type: "collection",
    rowsPerItem: { [PRESENT]: 1, [X]: 2, [Y]: 1, [Z]: 1 },
    body: async () => collectionEntries,
    expectedRows: async (ids) =>
      Promise.all(
        collectionEntries
          .filter((entry) => ids.includes(entry.itemExternalId))
          .map(async (entry) => ({
            mfcItemId: entry.itemExternalId,
            releaseId: await releaseIdOf(entry.itemExternalId),
            status: "Owned" as const,
            price: entry.price,
            count: entry.count,
            orderTitle: null,
            orderReleaseDate: null,
          })),
      ),
  },
  {
    type: "order",
    rowsPerItem: { [PRESENT]: 1, [X]: 1, [Y]: 1, [Z]: 1 },
    body: async () => orderBody(orderEntries),
    expectedRows: (ids) => orderRows(ids, "Spring preorders"),
  },
  {
    type: "order-item",
    rowsPerItem: { [PRESENT]: 1, [X]: 1, [Y]: 1, [Z]: 1 },
    body: async () => {
      seededOrderId = await seedOrder();
      return { orderId: seededOrderId, items: orderEntries };
    },
    expectedRows: (ids) => orderRows(ids, "Existing order"),
  },
  {
    type: "csv",
    rowsPerItem: { [PRESENT]: 1, [X]: 1, [Y]: 1, [Z]: 1 },
    body: async () => csvRows,
    expectedRows: async (ids) =>
      Promise.all(
        csvRows
          .filter((row) => ids.includes(row.itemExternalId))
          .map(async (row) => {
            const { id: releaseId, date } = await release(row.itemExternalId);
            const ordered = row.status === "Ordered";
            return {
              mfcItemId: row.itemExternalId,
              releaseId,
              status: row.status,
              price: parseMoneyToMinorUnits(row.price),
              count: 1,
              orderTitle: ordered ? parsedPage(row.itemExternalId).title : null,
              orderReleaseDate: ordered ? date : null,
            };
          }),
      ),
  },
];

describe.each(cases)("a $type sync", (sync) => {
  test("imports its missing items one by one, then ends partial when one fails", async () => {
    const rows = (...ids: number[]) =>
      ids.reduce((sum, id) => sum + (sync.rowsPerItem[id] ?? 0), 0);
    const total = rows(PRESENT, X, Y, Z);
    const run = await start(sync.type, await sync.body());
    expect(run).toMatchObject({
      status: SYNC_STATUS_MESSAGES.queued,
      isFinished: false,
      jobId: run.syncSessionId,
      missingMfcItemIds: [X, Y, Z],
    });
    expect(await session(run.syncSessionId)).toMatchObject({
      status: "processing",
      totalItems: total,
      successCount: rows(PRESENT),
      failCount: 0,
    });
    expect(snapshot(run.jobId)).toMatchObject({
      phase: "queued",
      statusMessage: SYNC_STATUS_MESSAGES.queued,
      progress: null,
      terminalState: null,
    });
    expect(await userRows()).toEqual(await sync.expectedRows([PRESENT]));

    expect(await complete(run, X)).toEqual(imported);
    const afterX = rows(PRESENT, X);
    expect(snapshot(run.jobId)).toMatchObject({
      phase: "scraping",
      statusMessage: SYNC_STATUS_MESSAGES.scraping(afterX, total),
      progress: { processed: afterX, total, succeeded: afterX, failed: 0 },
      recentItems: [recent(X)],
      error: null,
      terminalState: null,
    });
    expect(await userRows()).toEqual(await sync.expectedRows([PRESENT, X]));

    expect(await complete(run, Y)).toEqual(imported);
    const afterY = rows(PRESENT, X, Y);
    expect(snapshot(run.jobId)).toMatchObject({
      phase: "scraping",
      progress: { processed: afterY, total, succeeded: afterY, failed: 0 },
      recentItems: [recent(Y), recent(X)],
      terminalState: null,
    });
    expect(await userRows()).toEqual(await sync.expectedRows([PRESENT, X, Y]));

    expect(await fail(run, Z)).toEqual({ status: 200, body: { outcome: "recorded" } });
    const failed = rows(Z);
    const statusMessage =
      sync.type === "item"
        ? `${afterY}/${total} items in the item database. ${failed} failed.`
        : SYNC_STATUS_MESSAGES.partial(afterY, total, failed);
    expect(await session(run.syncSessionId)).toMatchObject({
      status: "partial",
      statusMessage,
      successCount: afterY,
      failCount: failed,
    });
    expect(snapshot(run.jobId)).toMatchObject({
      phase: "completed",
      statusMessage,
      progress: { processed: total, total, succeeded: afterY, failed },
      recentItems: [
        { externalId: Z, title: null, outcome: "failed", failureReason: HIDDEN },
        recent(Y),
        recent(X),
      ],
      error: null,
      terminalState: "partial",
    });
    const unfinished = await results(run.syncSessionId);
    expect(unfinished.filter((row) => row.status !== "scraped")).toEqual(
      Array.from({ length: failed }, () => ({ id: Z, status: "failed", reason: HIDDEN })),
    );
    expect(await userRows()).toEqual(await sync.expectedRows([PRESENT, X, Y]));
  });
});

test("an order sync with no Item in the database creates its Order with the first import", async () => {
  const run = await start("order", orderBody([orderItem(X, 2000), orderItem(Y, 3000)]));
  expect(await db.$count(order)).toBe(0);
  expect(await session(run.syncSessionId)).toMatchObject({ orderId: null });

  expect(await complete(run, X)).toEqual(imported);
  const [created] = await db.select().from(order);
  expect(created).toMatchObject({
    title: "Spring preorders",
    releaseDate: await releaseDateOf(X),
  });
  expect(await session(run.syncSessionId)).toMatchObject({ orderId: created?.id });

  expect(await complete(run, Y)).toEqual(imported);
  expect(await db.$count(order)).toBe(1);
  expect(await session(run.syncSessionId)).toMatchObject({ status: "completed" });
});

test("uploading the same item twice writes it once", async () => {
  const run = await start("collection", [collectionEntry(X, 200), collectionEntry(Y, 300)]);

  const replies = await Promise.all([complete(run, X), complete(run, X)]);
  expect(replies.map((reply) => outcomeSchema.parse(reply.body).outcome).toSorted()).toEqual([
    "already_imported",
    "imported",
  ]);
  expect(await complete(run, X)).toEqual({
    status: 200,
    body: { outcome: "already_imported", reason: null },
  });
  expect(await db.$count(item, eq(item.externalId, X))).toBe(1);
  expect(await userRows()).toMatchObject([{ mfcItemId: X }]);
  expect(await session(run.syncSessionId)).toMatchObject({ successCount: 1, failCount: 0 });
});

test("a page that is not the item fails it with the reason", async () => {
  const run = await start("item", { items: [X] });

  expect(await complete(run, X, derivedChallengePage)).toEqual({
    status: 200,
    body: {
      outcome: "failed",
      reason: "MyFigureCollection showed a security check instead of the item",
    },
  });
  expect(await results(run.syncSessionId)).toEqual([
    {
      id: X,
      status: "failed",
      reason: "MyFigureCollection showed a security check instead of the item",
    },
  ]);
  expect(snapshot(run.jobId)).toMatchObject({
    terminalState: "error",
    error: { code: "scrape_failed", message: SYNC_STATUS_MESSAGES.failedScrape },
  });
  expect(await db.$count(item, eq(item.externalId, X))).toBe(0);
  expect(await complete({ ...run, syncSessionId: "missing" }, X)).toMatchObject({ status: 404 });
});

test("a stale job's failure is ignored and its late success still imports", async () => {
  const first = await start("collection", [collectionEntry(X, 200), collectionEntry(Y, 300)]);
  await fail(first, X);
  await fail(first, Y);
  expect(await session(first.syncSessionId)).toMatchObject({ status: "failed" });

  const second = await retry(first.syncSessionId);
  expect(second.jobId).not.toBe(first.jobId);
  expect(second.missingMfcItemIds).toEqual([X, Y]);

  expect(await fail(first, X)).toEqual({ status: 200, body: { outcome: "ignored" } });
  expect(await complete(first, Y)).toEqual(imported);
  expect(await results(first.syncSessionId)).toEqual([
    { id: X, status: "pending", reason: null },
    { id: Y, status: "scraped", reason: null },
  ]);
  expect(snapshot(second.jobId)).toMatchObject({
    phase: "scraping",
    progress: { processed: 1, total: 2, succeeded: 1, failed: 0 },
  });

  expect(await complete(second, X)).toEqual(imported);
  expect(await session(first.syncSessionId)).toMatchObject({
    status: "completed",
    jobId: second.jobId,
    successCount: 2,
  });
  expect(await userRows()).toMatchObject([{ mfcItemId: X }, { mfcItemId: Y }]);
});

test("a retry imports failed items now in the database and returns the rest to fetch", async () => {
  const run = await start("csv", csvRows.slice(0, 3));
  await fail(run, X);
  await fail(run, Y, "timeout");
  expect(await session(run.syncSessionId)).toMatchObject({ status: "partial", failCount: 2 });
  expect(await listed()).toMatchObject([{ canRetry: true, isRetrying: false }]);

  await importItem(Y);
  const second = await retry(run.syncSessionId);
  expect(second.missingMfcItemIds).toEqual([X]);
  expect(await session(run.syncSessionId)).toMatchObject({
    status: "processing",
    statusMessage: SYNC_STATUS_MESSAGES.retryQueued,
    jobId: second.jobId,
    successCount: 2,
    failCount: 0,
  });
  expect(snapshot(second.jobId)).toMatchObject({
    phase: "queued",
    statusMessage: SYNC_STATUS_MESSAGES.retryQueued,
    terminalState: null,
  });
  expect(await listed()).toMatchObject([
    { status: "processing", canRetry: false, isRetrying: true },
  ]);
  expect(await post(`/sessions/${run.syncSessionId}/retry`)).toMatchObject({ status: 409 });

  expect(await complete(second, X)).toEqual(imported);
  expect(await session(run.syncSessionId)).toMatchObject({
    status: "completed",
    statusMessage: SYNC_STATUS_MESSAGES.completed(3, 3),
  });
  expect(snapshot(second.jobId)).toMatchObject({ terminalState: "success" });
  expect(await userRows()).toEqual(
    await (cases.find((sync) => sync.type === "csv") ?? never()).expectedRows([PRESENT, X, Y]),
  );
  expect(await post(`/sessions/${run.syncSessionId}/retry`)).toMatchObject({ status: 409 });
});

test("an interrupted run fails its pending items, which a retry fetches again", async () => {
  const run = await start("item", { items: [X, Y] });
  expect(await heartbeat(run)).toEqual({ status: 200, body: { active: true } });
  expect(await complete(run, X)).toEqual(imported);

  expect(await interrupt(run)).toEqual({ status: 200, body: { outcome: "interrupted" } });
  expect(await results(run.syncSessionId)).toEqual([
    { id: X, status: "scraped", reason: null },
    { id: Y, status: "failed", reason: SYNC_STATUS_MESSAGES.interrupted },
  ]);
  expect(await session(run.syncSessionId)).toMatchObject({
    status: "partial",
    statusMessage: "1/2 items in the item database. 1 failed.",
  });
  expect(snapshot(run.jobId)).toMatchObject({
    terminalState: "partial",
    recentItems: [
      { externalId: Y, outcome: "failed", failureReason: SYNC_STATUS_MESSAGES.interrupted },
      recent(X),
    ],
  });
  expect(await interrupt(run)).toEqual({ status: 200, body: { outcome: "ignored" } });
  expect(await heartbeat(run)).toEqual({ status: 200, body: { active: false } });

  const second = await retry(run.syncSessionId);
  expect(second.missingMfcItemIds).toEqual([Y]);
});

test("a run whose lease lapsed reads as interrupted until the next write saves it", async () => {
  const run = await start("collection", [collectionEntry(X, 200), collectionEntry(Y, 300)]);
  expect(await complete(run, X)).toEqual(imported);
  await db
    .update(syncSession)
    .set({ updatedAt: new Date(Date.now() - SYNC_RUN_LEASE_MS - 1000) })
    .where(eq(syncSession.id, run.syncSessionId));

  const partial = SYNC_STATUS_MESSAGES.partial(1, 2, 1);
  expect(await listed()).toMatchObject([
    { status: "partial", statusMessage: partial, failCount: 1, canRetry: true, isRetrying: false },
  ]);
  expect(await listed("?status=processing")).toEqual([]);
  const failedOnly = await get(`/sessions/${run.syncSessionId}?status=failed`);
  const detail = detailSchema.parse(failedOnly.body);
  expect(detail.session).toMatchObject({ status: "partial", failCount: 1 });
  expect(detail.session.items).toMatchObject([
    { itemExternalId: Y, status: "failed", errorReason: SYNC_STATUS_MESSAGES.interrupted },
  ]);
  const stream = await openStream(run.jobId);
  expect(await stream.next()).toMatchObject({
    statusMessage: partial,
    progress: { processed: 2, total: 2, succeeded: 1, failed: 1 },
    terminalState: "partial",
  });
  await stream.close();
  expect(await session(run.syncSessionId)).toMatchObject({ status: "processing", failCount: 0 });

  expect(await heartbeat(run)).toEqual({ status: 200, body: { active: false } });
  expect(await session(run.syncSessionId)).toMatchObject({
    status: "partial",
    statusMessage: partial,
    failCount: 1,
  });
  expect(await results(run.syncSessionId)).toContainEqual({
    id: Y,
    status: "failed",
    reason: SYNC_STATUS_MESSAGES.interrupted,
  });

  expect(await complete(run, Y)).toEqual(imported);
  expect(await session(run.syncSessionId)).toMatchObject({ status: "completed", failCount: 0 });
});

async function waitForLockWaiters(count: number) {
  const deadline = Date.now() + 5000;
  while (true) {
    const [waiting] = await db.execute<{ count: number }>(
      sql`SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'`,
    );
    if ((waiting?.count ?? 0) >= count) return;
    if (Date.now() > deadline) throw new Error(`${waiting?.count} queries wait on locks`);
    await Bun.sleep(10);
  }
}

test("a complete takes the Order lock before the session, so an Order delete never deadlocks it", async () => {
  const orderId = await seedOrder();
  const run = await start("order-item", {
    orderId,
    items: [orderItem(X, 2000), orderItem(Y, 3000)],
  });
  const locked = Promise.withResolvers<null>();
  const proceed = Promise.withResolvers<null>();
  const deleting = db.transaction(async (tx) => {
    await tx.select({ id: order.id }).from(order).where(eq(order.id, orderId)).for("update");
    locked.resolve(null);
    await proceed.promise;
    // Holding the session lock while waiting on the Order would stall this delete's FK update.
    await tx.execute(sql`SET LOCAL lock_timeout = '2s'`);
    await tx.delete(order).where(eq(order.id, orderId));
  });
  await locked.promise;

  const completing = complete(run, X);
  await waitForLockWaiters(1);
  proceed.resolve(null);
  await deleting;

  expect(await completing).toEqual({
    status: 200,
    body: { outcome: "failed", reason: SYNC_STATUS_MESSAGES.failedPersist },
  });
  expect(await session(run.syncSessionId)).toMatchObject({
    status: "failed",
    statusMessage: SYNC_STATUS_MESSAGES.failedPersist,
    orderId: null,
    failCount: 2,
  });
  expect(await results(run.syncSessionId)).toEqual([
    { id: X, status: "failed", reason: "Persistence failed while saving scraped items" },
    { id: Y, status: "failed", reason: "Persistence failed while saving scraped items" },
  ]);
  expect(snapshot(run.jobId)).toMatchObject({
    terminalState: "error",
    error: { code: "persistence_failed", message: SYNC_STATUS_MESSAGES.failedPersist },
  });
  expect(await db.$count(collection)).toBe(0);
  expect(await post(`/sessions/${run.syncSessionId}/retry`)).toMatchObject({ status: 409 });
});

async function openStream(jobId: string) {
  const abort = new AbortController();
  const response = await app.handle(
    new Request(`http://localhost/api/sync/job-status?jobId=${jobId}`, {
      headers: { "x-test-user": userId },
      signal: abort.signal,
    }),
  );
  const reader = response.body?.getReader() ?? never();
  let buffer = "";
  return {
    async next(): Promise<SyncJobStatus> {
      while (true) {
        const end = buffer.indexOf("\n\n");
        if (end !== -1) {
          const event = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          const data = event
            .split("\n")
            .filter((line) => line.startsWith("data:"))
            .map((line) => line.slice("data:".length).trim())
            .join("");
          const status = parseJobStatusPayload(data);
          if (status) return status;
          continue;
        }
        const { value, done } = await reader.read();
        if (done) throw new Error("the stream ended");
        buffer += await new Blob([value]).text();
      }
    },
    async close() {
      abort.abort();
      await reader.cancel();
    },
  };
}

test("the job-status stream sends each item's update", async () => {
  const run = await start("item", { items: [X, Y] });
  const stream = await openStream(run.jobId);
  expect(await stream.next()).toMatchObject({ phase: "queued", terminalState: null });

  expect(await complete(run, X)).toEqual(imported);
  expect(await stream.next()).toMatchObject({
    phase: "scraping",
    progress: { processed: 1, total: 2, succeeded: 1, failed: 0 },
    recentItems: [recent(X)],
  });

  await fail(run, Y);
  expect(await stream.next()).toMatchObject({
    terminalState: "partial",
    recentItems: [{ externalId: Y, outcome: "failed", failureReason: HIDDEN }, recent(X)],
  });
  await stream.close();
});

async function waitForReplay(jobId: string) {
  const deadline = Date.now() + 1000;
  while ((statusReads.get(getJobStatusSnapshotKey(jobId)) ?? 0) < 2) {
    if (Date.now() > deadline) throw new Error("stream did not finish its replay read");
    await Bun.sleep(5);
  }
}

test("an open stream notices an expired lease on its next poll", async () => {
  const run = await start("item", { items: [X] });
  const stream = await openStream(run.jobId);
  expect(await stream.next()).toMatchObject({ terminalState: null });
  await waitForReplay(run.jobId);
  await db
    .update(syncSession)
    .set({ updatedAt: new Date(Date.now() - SYNC_RUN_LEASE_MS - 1000) })
    .where(eq(syncSession.id, run.syncSessionId));
  const clock = spyOn(Date, "now").mockReturnValue(Date.now() + 31_000);
  try {
    expect(await stream.next()).toMatchObject({
      terminalState: "error",
      statusMessage: SYNC_STATUS_MESSAGES.interrupted,
    });
    await expect(stream.next()).rejects.toThrow("the stream ended");
  } finally {
    clock.mockRestore();
    await stream.close();
  }
}, 40_000);

test("a cached partial status cannot hide a later successful completion", async () => {
  const run = await start("item", { items: [X, Y] });
  await complete(run, X);
  await fail(run, Y);
  const stale = redisValues.get(getJobStatusSnapshotKey(run.jobId)) ?? "";
  await complete(run, Y);
  redisValues.set(getJobStatusSnapshotKey(run.jobId), stale);
  const { default: service } = await import("./service");
  expect(await service.getJobStatus(run.jobId, userId)).toMatchObject({
    terminalState: "success",
    progress: { succeeded: 2, failed: 0 },
  });
});

test("an S3 timeout records the item as a persistence failure", async () => {
  const run = await start("collection", [collectionEntry(X, 200)]);
  failS3 = true;
  expect(await complete(run, X)).toMatchObject({ status: 200, body: { outcome: "failed" } });
  expect(await results(run.syncSessionId)).toEqual([
    { id: X, status: "failed", reason: "Persistence failed while saving scraped items" },
  ]);
  expect(snapshot(run.jobId)).toMatchObject({
    terminalState: "error",
    error: { code: "persistence_failed", message: SYNC_STATUS_MESSAGES.failedPersist },
  });
});

test("worker-era sync runs stay active past the extension lease", async () => {
  const { default: service } = await import("./service");
  await db.insert(syncSession).values({
    id: "worker-run",
    jobId: "worker-run",
    userId,
    syncType: "item",
    status: "processing",
    totalItems: 1,
    updatedAt: new Date(Date.now() - 180_000),
  });
  await db.insert(syncSessionItem).values({ syncSessionId: "worker-run", itemExternalId: X });
  expect(await service.getJobStatus("worker-run", userId)).toMatchObject({ terminalState: null });
  expect(await listed("?status=processing")).toHaveLength(1);
  expect(await post("/sessions/worker-run/retry")).toMatchObject({ status: 409 });
});

test("two concurrent first completes create one Order and import both items", async () => {
  const run = await start("order", orderBody([orderItem(X, 2000), orderItem(Y, 3000)]));
  const held = Promise.withResolvers<null>();
  const proceed = Promise.withResolvers<null>();
  const holder = db.transaction(async (tx) => {
    await tx.select().from(syncSession).where(eq(syncSession.id, run.syncSessionId)).for("update");
    held.resolve(null);
    await proceed.promise;
  });
  await held.promise;
  const completing = Promise.all([complete(run, X), complete(run, Y)]);
  await waitForLockWaiters(2);
  proceed.resolve(null);
  await holder;
  expect(await completing).toEqual([imported, imported]);
  expect(await db.$count(order)).toBe(1);
  expect(await db.$count(collection)).toBe(2);
  expect(await session(run.syncSessionId)).toMatchObject({ status: "completed", successCount: 2 });
});

test("an Order deleted mid-run fails the remaining items without ingesting them", async () => {
  const run = await start("order", orderBody([orderItem(PRESENT, 1000), orderItem(X, 2000)]));
  const current = await session(run.syncSessionId);
  if (!current?.orderId) throw new Error("Order missing");
  await db.delete(order).where(eq(order.id, current.orderId));
  await db.execute(`CREATE SEQUENCE ingest_attempts MINVALUE 0 START 0`);
  await db.execute(
    `CREATE FUNCTION count_ingest() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM nextval('ingest_attempts'); RETURN NEW; END $$`,
  );
  await db.execute(
    `CREATE TRIGGER count_ingest BEFORE INSERT ON item FOR EACH ROW EXECUTE FUNCTION count_ingest()`,
  );
  try {
    expect(await complete(run, X)).toMatchObject({ body: { outcome: "failed" } });
    const [attempt] = await db.execute<{ count: number }>(
      `SELECT (CASE WHEN is_called THEN last_value + 1 ELSE 0 END)::int AS count FROM ingest_attempts`,
    );
    expect(attempt?.count).toBe(0);
  } finally {
    await db.execute(`DROP TRIGGER count_ingest ON item`);
    await db.execute(`DROP FUNCTION count_ingest()`);
    await db.execute(`DROP SEQUENCE ingest_attempts`);
  }
  expect(await db.$count(item, eq(item.externalId, X))).toBe(0);
  expect(await session(run.syncSessionId)).toMatchObject({ status: "partial", failCount: 1 });
});

test("control and failure requests use separate per-user rate limits", async () => {
  const run = await start("item", { items: [X] });
  await heartbeat(run);
  await fail(run, X);
  await interrupt(run);
  expect(rateKeys).toContain(`rl:sync-control:${userId}`);
  expect(rateKeys).toContain(`rl:sync-failure:${userId}`);
  expect(rateKeys).not.toContain(`rl:mfc-ingest:${userId}`);
});

test("publishing an older revision cannot replace a newer snapshot", async () => {
  const run = await start("item", { items: [X, Y] });
  const old = snapshot(run.jobId);
  await complete(run, X);
  const newest = snapshot(run.jobId);
  const { redis } = await import("@myakiba/redis/client");
  await writeJobStatusSnapshotAndPublish(redis, run.jobId, old);
  expect(snapshot(run.jobId)).toEqual(newest);
});

test("the stream ignores a delayed event from an older revision", async () => {
  const run = await start("item", { items: [X, Y] });
  const stale = snapshot(run.jobId);
  const stream = await openStream(run.jobId);
  await stream.next();
  await complete(run, X);
  expect(await stream.next()).toMatchObject({ progress: { succeeded: 1 } });
  for (const relay of subscribers) relay(getJobStatusChannel(run.jobId), JSON.stringify(stale));
  await fail(run, Y);
  try {
    expect(await stream.next()).toMatchObject({ terminalState: "partial" });
  } finally {
    await stream.close();
  }
});

test("a start that fails while writing existing rows keeps failed import history", async () => {
  await db.execute(
    `CREATE FUNCTION reject_collection() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'persistence unavailable'; END $$`,
  );
  await db.execute(
    `CREATE TRIGGER reject_collection BEFORE INSERT ON collection FOR EACH ROW EXECUTE FUNCTION reject_collection()`,
  );
  try {
    expect(
      await post("/collection", [collectionEntry(PRESENT, 100), collectionEntry(X, 200)]),
    ).toMatchObject({ status: 500 });
    const [saved] = await db.select().from(syncSession);
    expect(saved).toMatchObject({
      status: "failed",
      statusMessage: SYNC_STATUS_MESSAGES.failedBeforeStart,
      totalItems: 2,
      successCount: 0,
      failCount: 2,
    });
    expect(await results(saved?.id ?? "")).toHaveLength(2);
  } finally {
    await db.execute(`DROP TRIGGER reject_collection ON collection`);
    await db.execute(`DROP FUNCTION reject_collection()`);
  }
});

test("recent items include five distinct finished items even after many repeated results", async () => {
  const ids = [X, Y, Z, 100_004, 100_005];
  const run = await start("collection", [
    ...ids.map((id) => collectionEntry(id, 100)),
    ...Array.from({ length: 60 }, () => collectionEntry(X, 100)),
  ]);
  for (const id of ids.toReversed())
    await complete(run, id, pages.get(id) ?? derivedPage(id, "01/10/2020"));
  expect(snapshot(run.jobId).recentItems.map((row) => row.externalId)).toEqual(ids);
});

test("a cached partial snapshot cannot hide a newer partial revision", async () => {
  const run = await start("item", { items: [X, Y, Z] });
  await complete(run, X);
  await fail(run, Y);
  await fail(run, Z);
  const stale = redisValues.get(getJobStatusSnapshotKey(run.jobId)) ?? "";
  await complete(run, Y);
  redisValues.set(getJobStatusSnapshotKey(run.jobId), stale);
  const { default: service } = await import("./service");
  expect(await service.getJobStatus(run.jobId, userId)).toMatchObject({
    terminalState: "partial",
    progress: { succeeded: 2, failed: 1 },
  });
});

test("a persistence failure after an imported item retains the partial-success message", async () => {
  const run = await start("collection", [collectionEntry(PRESENT, 100), collectionEntry(X, 200)]);
  failS3 = true;
  expect(await complete(run, X)).toMatchObject({ status: 200, body: { outcome: "failed" } });
  expect(snapshot(run.jobId)).toMatchObject({
    terminalState: "partial",
    statusMessage: SYNC_STATUS_MESSAGES.partial(1, 2, 1),
    error: null,
  });
});

test("a poll whose session was deleted sends a terminal error and closes", async () => {
  const run = await start("item", { items: [X] });
  const stream = await openStream(run.jobId);
  await stream.next();
  await waitForReplay(run.jobId);
  await db.delete(syncSession).where(eq(syncSession.id, run.syncSessionId));
  const clock = spyOn(Date, "now").mockReturnValue(Date.now() + 31_000);
  try {
    expect(await stream.next()).toMatchObject({
      terminalState: "error",
      error: { code: "unknown", message: "Job not found" },
    });
    await expect(stream.next()).rejects.toThrow("the stream ended");
  } finally {
    clock.mockRestore();
    await stream.close();
  }
}, 40_000);

test("CSV completion imports an Owned row whose Order does not exist yet", async () => {
  const run = await start("csv", [{ ...csvRow(X, "Owned", "10.00"), orderId: "missing-order" }]);
  expect(await complete(run, X)).toEqual(imported);
  expect(await session(run.syncSessionId)).toMatchObject({ status: "completed", successCount: 1 });
  expect(await userRows()).toMatchObject([
    { mfcItemId: X, status: "Owned", orderTitle: parsedPage(X).title },
  ]);
});

for (const age of [180_000, 24 * 60 * 60 * 1000 + 1000]) {
  test(`worker-era controls leave a ${age}ms-old session untouched`, async () => {
    const updatedAt = new Date(Date.now() - age);
    await db.insert(syncSession).values({
      id: "worker-control",
      jobId: "worker-control",
      userId,
      syncType: "item",
      status: "processing",
      totalItems: 1,
      updatedAt,
    });
    await db.insert(syncSessionItem).values({ syncSessionId: "worker-control", itemExternalId: X });
    const before = await db.select().from(syncSession);
    const run = { syncSessionId: "worker-control", jobId: "worker-control" };
    expect(await heartbeat(run)).toEqual({ status: 200, body: { active: false } });
    expect(await interrupt(run)).toEqual({ status: 200, body: { outcome: "ignored" } });
    expect(await db.select().from(syncSession)).toEqual(before);
    expect(await results(run.syncSessionId)).toEqual([{ id: X, status: "pending", reason: null }]);
  });
}

test("worker-era sync lapses just past 24 hours in status and SQL filters", async () => {
  const { default: service } = await import("./service");
  await db.insert(syncSession).values({
    id: "lost-worker",
    jobId: "lost-worker",
    userId,
    syncType: "item",
    status: "processing",
    totalItems: 1,
    updatedAt: new Date(Date.now() - 24 * 60 * 60 * 1000 - 1000),
  });
  await db.insert(syncSessionItem).values({ syncSessionId: "lost-worker", itemExternalId: X });
  expect(await service.getJobStatus("lost-worker", userId)).toMatchObject({
    terminalState: "error",
    statusMessage: SYNC_STATUS_MESSAGES.interrupted,
  });
  expect(await listed("?status=processing")).toEqual([]);
  expect(await listed("?status=failed")).toMatchObject([{ status: "failed", failCount: 1 }]);
});

test("failure reporting accepts the full hourly ingest budget", async () => {
  const run = await start("collection", [collectionEntry(X, 200)]);
  failureRequests = 2000;
  expect(await fail(run, X)).toEqual({ status: 200, body: { outcome: "recorded" } });
  failureRequests = 2001;
  expect(await fail(run, X)).toMatchObject({ status: 429 });
});

test("polling keeps the last status through a Redis blip and retries", async () => {
  const run = await start("item", { items: [X] });
  const stream = await openStream(run.jobId);
  const clock = spyOn(Date, "now");
  try {
    const initial = await stream.next();
    await waitForReplay(run.jobId);
    const reads = statusReads.get(getJobStatusSnapshotKey(run.jobId));
    expect(await stream.next()).toEqual(initial);
    expect(statusReads.get(getJobStatusSnapshotKey(run.jobId))).toBe(reads);
    statusReadFailures = 1;
    const now = Date.now();
    clock.mockReturnValue(now + 31_000);
    expect(await stream.next()).toEqual(initial);
    expect(statusReadFailures).toBe(0);
    clock.mockReturnValue(now + 62_000);
    expect(await stream.next()).toMatchObject({ terminalState: null });
    expect(statusReads.get(getJobStatusSnapshotKey(run.jobId))).toBe((reads ?? 0) + 2);
    await complete(run, X);
    expect(await stream.next()).toMatchObject({ terminalState: "success" });
  } finally {
    clock.mockRestore();
    await stream.close();
  }
}, 25_000);

test("persistence failure survives cache expiry and a changed display message", async () => {
  const run = await start("collection", [collectionEntry(X, 200)]);
  failS3 = true;
  await complete(run, X);
  redisValues.delete(getJobStatusSnapshotKey(run.jobId));
  await db
    .update(syncSession)
    .set({ statusMessage: "Translated persistence failure" })
    .where(eq(syncSession.id, run.syncSessionId));
  const { default: service } = await import("./service");
  expect(await service.getJobStatus(run.jobId, userId)).toMatchObject({
    error: { code: "persistence_failed" },
  });
  failS3 = false;
  const retried = await retry(run.syncSessionId);
  expect(await complete(retried, X)).toEqual(imported);
  redisValues.delete(getJobStatusSnapshotKey(retried.jobId));
  expect(await service.getJobStatus(retried.jobId, userId)).toMatchObject({
    terminalState: "success",
    error: null,
  });
});

test("display text alone cannot classify a persistence failure", async () => {
  const run = await start("item", { items: [X] });
  await db
    .update(syncSession)
    .set({ status: "failed", statusMessage: SYNC_STATUS_MESSAGES.failedPersist, failCount: 1 })
    .where(eq(syncSession.id, run.syncSessionId));
  await db
    .update(syncSessionItem)
    .set({ status: "failed", errorReason: SYNC_STATUS_MESSAGES.failedPersist })
    .where(eq(syncSessionItem.syncSessionId, run.syncSessionId));
  redisValues.delete(getJobStatusSnapshotKey(run.jobId));
  const { default: service } = await import("./service");
  expect(await service.getJobStatus(run.jobId, userId)).toMatchObject({
    terminalState: "error",
    error: { code: "scrape_failed", message: SYNC_STATUS_MESSAGES.failedScrape },
  });
});

test("a failed history fallback preserves the original persistence error", async () => {
  const { default: service } = await import("./service");
  const originalStart = service.startSyncRun.bind(service);
  let caught: unknown;
  const startRun = spyOn(service, "startSyncRun").mockImplementation(async (input) => {
    try {
      return await originalStart(input);
    } catch (error) {
      caught = error;
      throw error;
    }
  });
  await db.execute(`CREATE SEQUENCE session_attempts`);
  await db.execute(
    `CREATE FUNCTION reject_history() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF nextval('session_attempts') > 1 THEN RAISE EXCEPTION 'history unavailable'; END IF; RETURN NEW; END $$`,
  );
  await db.execute(
    `CREATE TRIGGER reject_history BEFORE INSERT ON sync_session FOR EACH ROW EXECUTE FUNCTION reject_history()`,
  );
  await db.execute(
    `CREATE FUNCTION reject_collection() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'persistence unavailable'; END $$`,
  );
  await db.execute(
    `CREATE TRIGGER reject_collection BEFORE INSERT ON collection FOR EACH ROW EXECUTE FUNCTION reject_collection()`,
  );
  try {
    expect(
      await post("/collection", [collectionEntry(PRESENT, 100), collectionEntry(X, 200)]),
    ).toMatchObject({ status: 500 });
    if (!(caught instanceof Error)) throw new Error("the failed start did not throw");
    expect(caught.cause).toMatchObject({ message: "persistence unavailable" });
  } finally {
    startRun.mockRestore();
    await db.execute(`DROP TRIGGER reject_collection ON collection`);
    await db.execute(`DROP FUNCTION reject_collection()`);
    await db.execute(`DROP TRIGGER reject_history ON sync_session`);
    await db.execute(`DROP FUNCTION reject_history()`);
    await db.execute(`DROP SEQUENCE session_attempts`);
  }
});

test("a fetch failure cannot hide a recorded persistence failure", async () => {
  const run = await start("collection", [collectionEntry(X, 200), collectionEntry(Y, 300)]);
  await fail(run, X);
  failS3 = true;
  await complete(run, Y);
  expect(snapshot(run.jobId)).toMatchObject({ error: { code: "persistence_failed" } });
  redisValues.delete(getJobStatusSnapshotKey(run.jobId));
  const { default: service } = await import("./service");
  expect(await service.getJobStatus(run.jobId, userId)).toMatchObject({
    error: { code: "persistence_failed" },
  });
});

test("CSV request retains the original empty-title fallback", async () => {
  await db.update(item).set({ title: "" }).where(eq(item.externalId, PRESENT));
  const reply = await post("/csv", [csvRow(PRESENT, "Ordered", "10.00")]);
  expect(reply.status).toBe(200);
  const [saved] = await db.select().from(order);
  expect(saved?.title).toBe(`Order ${saved?.id}`);
});

test("two extension CSV Items share one Order", async () => {
  const run = await start("csv", [
    { ...csvRow(X, "Ordered", "10.00"), orderId: "shared-order" },
    { ...csvRow(Y, "Owned", "20.00"), orderId: "shared-order" },
  ]);
  expect(await complete(run, X)).toEqual(imported);
  expect(await complete(run, Y)).toEqual(imported);
  expect(await db.$count(order)).toBe(1);
  expect(await userRows()).toMatchObject([
    { mfcItemId: X, orderTitle: parsedPage(X).title },
    { mfcItemId: Y, orderTitle: parsedPage(X).title },
  ]);
  expect(await session(run.syncSessionId)).toMatchObject({ status: "completed", successCount: 2 });
});

test("extension CSV cannot reuse another user's Order", async () => {
  await db
    .insert(authSchema.user)
    .values({ id: "other", name: "Other", email: "o@example.test", username: "other" });
  await db.insert(order).values({ id: "foreign-order", userId: "other", title: "Private" });
  const run = await start("csv", [{ ...csvRow(X, "Ordered", "10.00"), orderId: "foreign-order" }]);
  expect(await complete(run, X)).toMatchObject({ status: 200, body: { outcome: "failed" } });
  expect(await db.$count(collection)).toBe(0);
});

test("worker-era sync stays processing one second before 24 hours", async () => {
  const { default: service } = await import("./service");
  await db.insert(syncSession).values({
    id: "live-worker",
    jobId: "live-worker",
    userId,
    syncType: "item",
    status: "processing",
    totalItems: 1,
    updatedAt: new Date(Date.now() - 24 * 60 * 60 * 1000 + 1000),
  });
  await db.insert(syncSessionItem).values({ syncSessionId: "live-worker", itemExternalId: X });
  expect(await service.getJobStatus("live-worker", userId)).toMatchObject({ terminalState: null });
  expect(await listed("?status=processing")).toMatchObject([
    { status: "processing", failCount: 0 },
  ]);
  expect(await listed("?status=failed")).toEqual([]);
});

test("failedBeforeStart does not label item results as persistence failures", async () => {
  await db.execute(
    `CREATE FUNCTION reject_start() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'cannot start'; END $$`,
  );
  await db.execute(
    `CREATE TRIGGER reject_start BEFORE INSERT ON collection FOR EACH ROW EXECUTE FUNCTION reject_start()`,
  );
  try {
    expect(
      await post("/collection", [collectionEntry(PRESENT, 100), collectionEntry(X, 200)]),
    ).toMatchObject({ status: 500 });
    const rows = await db.select().from(syncSessionItem);
    expect(rows).toHaveLength(2);
    expect(
      rows.every(
        (row) =>
          row.errorCode === null && row.errorReason === SYNC_STATUS_MESSAGES.failedBeforeStart,
      ),
    ).toBe(true);
  } finally {
    await db.execute(`DROP TRIGGER reject_start ON collection`);
    await db.execute(`DROP FUNCTION reject_start()`);
  }
});

test("in-request persistence failure keeps its original item reasons", async () => {
  await db.execute(
    `CREATE FUNCTION reject_request() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'cannot persist'; END $$`,
  );
  await db.execute(
    `CREATE TRIGGER reject_request BEFORE INSERT ON collection FOR EACH ROW EXECUTE FUNCTION reject_request()`,
  );
  try {
    expect(await post("/collection", [collectionEntry(PRESENT, 100)])).toMatchObject({
      status: 500,
    });
    expect(await db.select({ reason: syncSessionItem.errorReason }).from(syncSessionItem)).toEqual([
      { reason: SYNC_STATUS_MESSAGES.failedPersist },
    ]);
  } finally {
    await db.execute(`DROP TRIGGER reject_request ON collection`);
    await db.execute(`DROP FUNCTION reject_request()`);
  }
});

test("interruption keeps its error after an earlier persistence failure and cache expiry", async () => {
  const run = await start("collection", [collectionEntry(X, 100), collectionEntry(Y, 200)]);
  failS3 = true;
  await complete(run, X);
  await interrupt(run);
  const before = snapshot(run.jobId);
  expect(before.error).toEqual({
    code: "scrape_failed",
    message: SYNC_STATUS_MESSAGES.interrupted,
  });
  redisValues.delete(getJobStatusSnapshotKey(run.jobId));
  const { default: service } = await import("./service");
  expect((await service.getJobStatus(run.jobId, userId)).error).toEqual(before.error);
});

test("worker persistence failure keeps its error without a snapshot", async () => {
  await db.insert(syncSession).values({
    id: "failed-worker",
    jobId: "failed-worker",
    userId,
    syncType: "collection",
    status: "failed",
    statusMessage: SYNC_STATUS_MESSAGES.failedPersist,
    totalItems: 1,
    successCount: 0,
    failCount: 1,
  });
  await db.insert(syncSessionItem).values({
    syncSessionId: "failed-worker",
    itemExternalId: X,
    status: "failed",
  });
  const { default: service } = await import("./service");
  expect(await service.getJobStatus("failed-worker", userId)).toMatchObject({
    error: { code: "persistence_failed", message: SYNC_STATUS_MESSAGES.failedPersist },
  });
});

test("a 1000-item failure batch uses one transaction and rate-limit unit", async () => {
  const ids = Array.from({ length: 1000 }, (_, index) => X + index);
  const run = await start("item", { items: ids });
  const transaction = spyOn(db, "transaction");
  const rateUnits = rateKeys.filter((key) => key.startsWith("rl:sync-failure:")).length;
  try {
    const reply = await post(`/sessions/${run.syncSessionId}/failures`, {
      jobId: run.jobId,
      failures: ids.map((mfcItemId) => ({ mfcItemId, error: "timeout" })),
    });
    expect(reply).toEqual({ status: 200, body: { outcome: "recorded" } });
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(rateKeys.filter((key) => key.startsWith("rl:sync-failure:"))).toHaveLength(
      rateUnits + 1,
    );
    expect(await session(run.syncSessionId)).toMatchObject({ status: "failed", failCount: 1000 });
    expect((await results(run.syncSessionId)).every((row) => row.status === "failed")).toBe(true);
  } finally {
    transaction.mockRestore();
  }
});

test("a mixed failure batch preserves imported Items and ignores a stale job", async () => {
  const run = await start("item", { items: [X, Y, Z] });
  await complete(run, X);
  const failures = [X, Y, Z].map((mfcItemId) => ({ mfcItemId, error: "timeout" }));
  expect(
    await post(`/sessions/${run.syncSessionId}/failures`, { jobId: "stale", failures }),
  ).toEqual({ status: 200, body: { outcome: "ignored" } });
  expect(
    await post(`/sessions/${run.syncSessionId}/failures`, { jobId: run.jobId, failures }),
  ).toEqual({ status: 200, body: { outcome: "recorded" } });
  expect(await results(run.syncSessionId)).toEqual([
    { id: X, status: "scraped", reason: null },
    { id: Y, status: "failed", reason: "MyFigureCollection took too long to answer" },
    { id: Z, status: "failed", reason: "MyFigureCollection took too long to answer" },
  ]);
});
