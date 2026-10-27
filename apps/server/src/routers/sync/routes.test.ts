import { beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import path from "node:path";
import { Elysia } from "elysia";
import { initLogger } from "evlog";
import { asc, eq, sql } from "drizzle-orm";
import * as z from "zod";
import { SYNC_RUN_LEASE_MS, SYNC_SESSION_RETRY_WINDOW_MS } from "@myakiba/contracts/sync/constants";
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
import { withDeadline } from "@myakiba/utils/with-deadline";
import { parseMoneyInputToMinorUnits } from "@myakiba/utils/currency";
import { createTestDatabase } from "../../../test/database";
import { createItemImages } from "@/lib/item-images";

initLogger({ enabled: false });

const userId = "user-1";
async function setExtensionRelease(value: "released" | "in_review") {
  await mock.module("@myakiba/contracts/shared/extension-release", () => ({
    EXTENSION_RELEASE: value,
  }));
}
await setExtensionRelease("released");

type Listener = (channel: string, message: string) => void;

const redisValues = new Map<string, string>();
const subscribers = new Set<Listener>();
let failS3 = false;
let picturePuts = 0;
const rateKeys: string[] = [];
let failureRequests = 1;
let statusReadFailures = 0;
let redisStatus = "ready";
let hangPublication = false;
let publicationCalls = 0;
let hungStatusRead: ReturnType<typeof Promise.withResolvers<never>> | null = null;
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
    get status() {
      return redisStatus;
    },
    eval: async (_script: string, _keys: number, key: string, ...args: (string | number)[]) => {
      if (key.startsWith("rl:")) {
        rateKeys.push(key);
        return [key.startsWith("rl:sync-failure:") ? failureRequests : 1, 3600];
      }
      publicationCalls += 1;
      if (hangPublication) return new Promise<never>(() => {});
      const [channel, raw] = args;
      const decoded = z.tuple([z.string(), z.string()]).parse([channel, raw]);
      const [snapshotChannel, serialized] = decoded;
      const next = parseJobStatusPayload(serialized).unwrapOr(null);
      const current = parseJobStatusPayload(redisValues.get(key) ?? "").unwrapOr(null);
      if ((current?.revision ?? -1) > (next?.revision ?? 0)) return 0;
      redisValues.set(key, serialized);
      for (const relay of subscribers) relay(snapshotChannel, serialized);
      return 1;
    },
    get: async (key: string) => {
      if (hungStatusRead) return hungStatusRead.promise;
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
        picturePuts += 1;
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
  if (parsed.isErr())
    throw new Error(`fixture for ${id} does not parse: ${parsed.error.problem.kind}`);
  return parsed.value;
}

function never(): never {
  throw new Error("unreachable");
}

const importItem = (id: number) => db.transaction((tx) => ensureMfcItem(tx, parsedPage(id), null));

beforeEach(async () => {
  await setExtensionRelease("released");
  await db.execute(sql`TRUNCATE "user", item, entry CASCADE`);
  redisValues.clear();
  failS3 = false;
  picturePuts = 0;
  rateKeys.length = 0;
  failureRequests = 1;
  statusReadFailures = 0;
  redisStatus = "ready";
  hangPublication = false;
  publicationCalls = 0;
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

/** The job status the service reads back from Postgres and the Redis snapshot. */
async function storedJobStatus(jobId: string) {
  const { default: service } = await import("./service");
  const status = await service.getJobStatus(jobId, userId, db);
  return status.unwrap();
}
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
  const status = parseJobStatusPayload(
    redisValues.get(getJobStatusSnapshotKey(jobId)) ?? "",
  ).unwrapOr(null);
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
              price: parseMoneyInputToMinorUnits(row.price).unwrap(),
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
      phase: "importing",
      statusMessage: SYNC_STATUS_MESSAGES.importing(afterX, total),
      progress: { processed: afterX, total, succeeded: afterX, failed: 0 },
      recentItems: [recent(X)],
      error: null,
      terminalState: null,
    });
    expect(await userRows()).toEqual(await sync.expectedRows([PRESENT, X]));

    expect(await complete(run, Y)).toEqual(imported);
    const afterY = rows(PRESENT, X, Y);
    expect(snapshot(run.jobId)).toMatchObject({
      phase: "importing",
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
    expect(unfinished.filter((row) => row.status !== "imported")).toEqual(
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
    error: { code: "fetch_failed", message: SYNC_STATUS_MESSAGES.failedFetch },
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
    { id: Y, status: "imported", reason: null },
  ]);
  expect(snapshot(second.jobId)).toMatchObject({
    phase: "importing",
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
    { id: X, status: "imported", reason: null },
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

test("CSV and order-item completions import the same missing Item without deadlocking", async () => {
  const orderId = await seedOrder();
  const csvRun = await start("csv", [{ ...csvRow(X, "Owned", "10.00"), orderId }]);
  const orderRun = await start("order-item", { orderId, items: [orderItem(X, 2000)] });
  const held = Promise.withResolvers<null>();
  const proceed = Promise.withResolvers<null>();
  const holder = db.transaction(async (tx) => {
    await tx
      .select()
      .from(syncSession)
      .where(eq(syncSession.id, orderRun.syncSessionId))
      .for("update");
    held.resolve(null);
    await proceed.promise;
  });
  await held.promise;
  const orderCompleting = complete(orderRun, X);
  let csvCompleting: ReturnType<typeof complete> | undefined;
  try {
    await waitForLockWaiters(1);
    csvCompleting = complete(csvRun, X);
    await waitForLockWaiters(2);
  } finally {
    proceed.resolve(null);
    await holder;
    await Promise.all([orderCompleting, csvCompleting]);
  }
  expect(await orderCompleting).toEqual(imported);
  expect(await csvCompleting).toEqual(imported);
  for (const run of [orderRun, csvRun]) {
    expect(await session(run.syncSessionId)).toMatchObject({
      status: "completed",
      successCount: 1,
      failCount: 0,
    });
    expect(await results(run.syncSessionId)).toEqual([{ id: X, status: "imported", reason: null }]);
  }
  expect(await db.$count(item, eq(item.externalId, X))).toBe(1);
  expect(await userRows()).toMatchObject([
    { mfcItemId: X, orderTitle: "Existing order" },
    { mfcItemId: X, orderTitle: "Existing order" },
  ]);
}, 15_000);

test("CSV retry locks Orders from in-request rows before its session", async () => {
  const orderId = await seedOrder();
  await db.execute(
    `CREATE FUNCTION reject_csv_start() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'cannot persist'; END $$`,
  );
  await db.execute(
    `CREATE TRIGGER reject_csv_start BEFORE INSERT ON collection FOR EACH ROW EXECUTE FUNCTION reject_csv_start()`,
  );
  try {
    expect(
      await post("/csv", [
        { ...csvRow(PRESENT, "Owned", "10.00"), orderId },
        csvRow(X, "Owned", "20.00"),
      ]),
    ).toMatchObject({ status: 500 });
  } finally {
    await db.execute(`DROP TRIGGER reject_csv_start ON collection`);
    await db.execute(`DROP FUNCTION reject_csv_start()`);
  }
  const [run] = await db.select().from(syncSession);
  if (!run) throw new Error("failed CSV session missing");
  expect(run).toMatchObject({ status: "failed", failCount: 2 });
  const held = Promise.withResolvers<null>();
  const proceed = Promise.withResolvers<null>();
  const holder = db.transaction(async (tx) => {
    await tx.select().from(order).where(eq(order.id, orderId)).for("update");
    held.resolve(null);
    await proceed.promise;
    await tx.select().from(syncSession).where(eq(syncSession.id, run.id)).for("update");
  });
  await held.promise;
  const retrying = post(`/sessions/${run.id}/retry`);
  const settled = Promise.allSettled([holder, retrying]);
  try {
    await waitForLockWaiters(1);
  } finally {
    proceed.resolve(null);
    await settled;
  }
  await holder;
  const reply = await retrying;
  expect(reply.status).toBe(200);
  expect(retrySchema.parse(reply.body).missingMfcItemIds).toEqual([X]);
  expect(await session(run.id)).toMatchObject({
    status: "processing",
    successCount: 1,
    failCount: 0,
  });
  expect(await userRows()).toMatchObject([{ mfcItemId: PRESENT, orderTitle: "Existing order" }]);
}, 15_000);

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
    { id: X, status: "failed", reason: "Failed to save this item" },
    { id: Y, status: "failed", reason: "Failed to save this item" },
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
          const status = parseJobStatusPayload(data).unwrapOr(null);
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
    phase: "importing",
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
  expect(await storedJobStatus(run.jobId)).toMatchObject({
    terminalState: "success",
    progress: { succeeded: 2, failed: 0 },
  });
});

test("an S3 timeout records the item as a persistence failure", async () => {
  const run = await start("collection", [collectionEntry(X, 200)]);
  failS3 = true;
  expect(await complete(run, X)).toMatchObject({ status: 200, body: { outcome: "failed" } });
  expect(await results(run.syncSessionId)).toEqual([
    { id: X, status: "failed", reason: "Failed to save this item" },
  ]);
  expect(snapshot(run.jobId)).toMatchObject({
    terminalState: "error",
    error: { code: "persistence_failed", message: SYNC_STATUS_MESSAGES.failedPersist },
  });
});

test("a database outage during item completion records the item failure after rollback", async () => {
  const run = await start("collection", [collectionEntry(X, 200)]);
  await db.execute(`CREATE FUNCTION reject_item_write() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION USING MESSAGE = 'item storage unavailable', ERRCODE = '08006'; END $$`);
  await db.execute(`CREATE TRIGGER reject_item_write BEFORE INSERT ON item
    FOR EACH ROW EXECUTE FUNCTION reject_item_write()`);
  try {
    expect(await complete(run, X)).toMatchObject({ status: 200, body: { outcome: "failed" } });
    expect(await results(run.syncSessionId)).toEqual([
      { id: X, status: "failed", reason: "Failed to save this item" },
    ]);
    expect(await db.$count(item, eq(item.externalId, X))).toBe(0);
    expect(await db.$count(collection)).toBe(0);
    expect(await session(run.syncSessionId)).toMatchObject({ status: "failed", failCount: 1 });
  } finally {
    await db.execute(`DROP TRIGGER reject_item_write ON item`);
    await db.execute(`DROP FUNCTION reject_item_write()`);
  }
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
  expect(await storedJobStatus(run.jobId)).toMatchObject({
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

test("failure reporting accepts the full hourly ingest budget", async () => {
  const run = await start("collection", [collectionEntry(X, 200)]);
  failureRequests = 2000;
  expect(await fail(run, X)).toEqual({ status: 200, body: { outcome: "recorded" } });
  failureRequests = 2001;
  expect(await fail(run, X)).toMatchObject({ status: 429 });
});

test("polling uses durable status through a Redis blip and retries", async () => {
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
    expect(await stream.next()).toMatchObject({
      phase: "importing",
      terminalState: null,
      progress: { total: 1, processed: 0 },
    });
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
  expect(await storedJobStatus(run.jobId)).toMatchObject({
    error: { code: "persistence_failed" },
  });
  failS3 = false;
  const retried = await retry(run.syncSessionId);
  expect(await complete(retried, X)).toEqual(imported);
  redisValues.delete(getJobStatusSnapshotKey(retried.jobId));
  expect(await storedJobStatus(retried.jobId)).toMatchObject({
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
  expect(await storedJobStatus(run.jobId)).toMatchObject({
    terminalState: "error",
    error: { code: "fetch_failed", message: SYNC_STATUS_MESSAGES.failedFetch },
  });
});

test("a failed history fallback preserves the original persistence error", async () => {
  const { default: service } = await import("./service");
  const originalStart = service.startSyncRun.bind(service);
  let caught: unknown;
  const startRun = spyOn(service, "startSyncRun").mockImplementation(
    async (input, tx, afterCommit) => {
      try {
        return await originalStart(input, tx, afterCommit);
      } catch (error) {
        caught = error;
        throw error;
      }
    },
  );
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
  expect(await storedJobStatus(run.jobId)).toMatchObject({
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

async function setCsvOrder(run: Run, orderId: string) {
  const [stored] = await db
    .select({ payload: syncSession.requestPayload })
    .from(syncSession)
    .where(eq(syncSession.id, run.syncSessionId));
  if (stored?.payload?.type !== "csv") throw new Error("CSV payload missing");
  await db
    .update(syncSession)
    .set({
      requestPayload: {
        ...stored.payload,
        items: stored.payload.items.map((row) => ({ ...row, orderId })),
      },
    })
    .where(eq(syncSession.id, run.syncSessionId));
}

test("two extension CSV Items share one Order", async () => {
  const run = await start("csv", [
    { ...csvRow(X, "Ordered", "10.00"), orderId: "shared-order" },
    { ...csvRow(Y, "Owned", "20.00"), orderId: "shared-order" },
  ]);
  await setCsvOrder(run, "shared-order");
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
  await setCsvOrder(run, "foreign-order");
  expect(await complete(run, X)).toMatchObject({ status: 200, body: { outcome: "failed" } });
  expect(await db.$count(collection)).toBe(0);
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
    code: "fetch_failed",
    message: SYNC_STATUS_MESSAGES.interrupted,
  });
  redisValues.delete(getJobStatusSnapshotKey(run.jobId));
  const after = await storedJobStatus(run.jobId);
  expect(after.error).toEqual(before.error);
});

test("a 1000-item failure batch uses one transaction and rate-limit unit", async () => {
  const ids = Array.from({ length: 1000 }, (_, index) => X + index);
  const run = await start(
    "collection",
    ids.map((id) => collectionEntry(id, 100)),
  );
  const transaction = spyOn(db, "transaction");
  const rateUnits = rateKeys.filter((key) => key.startsWith("rl:sync-failure:")).length;
  try {
    const reply = await post(`/sessions/${run.syncSessionId}/failures`, {
      jobId: run.jobId,
      failures: ids.map((id) => ({ mfcItemId: id, error: "timeout" })),
    });
    expect(reply).toEqual({ status: 200, body: { outcome: "recorded" } });
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(rateKeys.filter((key) => key.startsWith("rl:sync-failure:"))).toHaveLength(
      rateUnits + 1,
    );
    expect(await session(run.syncSessionId)).toMatchObject({ status: "failed", failCount: 1000 });
    const rows = await results(run.syncSessionId);
    expect(rows.every((row) => row.status === "failed")).toBe(true);
  } finally {
    transaction.mockRestore();
  }
});

test("a mixed failure batch preserves imported Items and ignores a stale job", async () => {
  const run = await start("item", { items: [X, Y, Z] });
  await complete(run, X);
  const failures = [X, Y, Z].map((id) => ({ mfcItemId: id, error: "timeout" }));
  expect(
    await post(`/sessions/${run.syncSessionId}/failures`, { jobId: "stale", failures }),
  ).toEqual({ status: 200, body: { outcome: "ignored" } });
  expect(
    await post(`/sessions/${run.syncSessionId}/failures`, { jobId: run.jobId, failures }),
  ).toEqual({ status: 200, body: { outcome: "recorded" } });
  expect(await results(run.syncSessionId)).toEqual([
    { id: X, status: "imported", reason: null },
    { id: Y, status: "failed", reason: "MyFigureCollection took too long to answer" },
    { id: Z, status: "failed", reason: "MyFigureCollection took too long to answer" },
  ]);
});

test.each(["item", "csv", "order", "order-item", "collection"] as const)(
  "%s keeps the existing-item lookup's 500 body",
  async (type) => {
    await db.insert(order).values({ id: "lookup-order", userId, title: "Order" });
    const bodies = {
      item: { items: [X] },
      csv: [csvRow(X, "Owned", "10.00")],
      order: orderBody([orderItem(X, 100)]),
      "order-item": { orderId: "lookup-order", items: [orderItem(X, 100)] },
      collection: [collectionEntry(X, 100)],
    };
    const { default: service } = await import("./service");
    const lookup = spyOn(
      service,
      "getExistingItemsWithLatestReleaseByExternalIds",
    ).mockRejectedValue(new Error("lookup unavailable"));
    try {
      expect(await post(`/${type}`, bodies[type])).toEqual({
        status: 500,
        body: "Failed to check for existing items",
      });
    } finally {
      lookup.mockRestore();
    }
  },
);

test("the order lookup keeps its own 500 body", async () => {
  const { default: service } = await import("./service");
  const lookup = spyOn(service, "getOrderByIdForUser").mockRejectedValue(
    new Error("order lookup unavailable"),
  );
  try {
    expect(await post("/order-item", { orderId: "order", items: [orderItem(X, 100)] })).toEqual({
      status: 500,
      body: "Failed to load order",
    });
  } finally {
    lookup.mockRestore();
  }
});

test.each([1, 2])("sync SSE read %s keeps the original error in its wide event", async (failAt) => {
  const run = await start("item", { items: [X] });
  const { default: service } = await import("./service");
  const { useLogger } = await import("evlog/elysia");
  const original = service.getJobStatus.bind(service);
  let reads = 0;
  let logged: ReturnType<typeof useLogger> | undefined;
  const read = spyOn(service, "getJobStatus").mockImplementation(async (...args) => {
    logged = useLogger();
    reads += 1;
    if (reads === failAt) throw new Error("original sync read error");
    return original(...args);
  });
  initLogger({ silent: true, drain: () => {} });
  try {
    const response = await app.handle(
      new Request(`http://localhost/api/sync/job-status?jobId=${run.jobId}`, {
        headers: { "x-test-user": userId },
      }),
    );
    await response.text();
    expect(logged?.getContext()).toMatchObject({
      action: "sync.jobStatus",
      error: { message: "original sync read error" },
    });
  } finally {
    initLogger({ enabled: false });
    read.mockRestore();
  }
});

test("an unanswered status cache read uses the DB row and logs JobStatusCacheUnavailable", async () => {
  const run = await start("item", { items: [X] });
  const { default: service } = await import("./service");
  const events: unknown[] = [];
  initLogger({
    silent: true,
    drain: ({ event }) => {
      events.push(event);
    },
  });
  statusReadFailures = 1;
  try {
    const result = await service.getJobStatus(run.jobId, userId, db);
    expect(result.isOk()).toBe(true);
    if (result.isOk())
      expect(result.value).toMatchObject({
        jobId: run.jobId,
        phase: "importing",
        terminalState: null,
      });
    expect(events).toContainEqual(
      expect.objectContaining({
        action: "sync.getJobStatus",
        level: "warn",
        failure: expect.objectContaining({ _tag: "JobStatusCacheUnavailable" }),
      }),
    );
  } finally {
    initLogger({ enabled: false });
  }
});

test.each(["wait", "connecting", "connect", "reconnecting", "close", "end"])(
  "job status skips Redis while %s and warns with the unchanged DB fallback",
  async (status) => {
    const run = await start("item", { items: [X] });
    const { default: service } = await import("./service");
    redisValues.delete(getJobStatusSnapshotKey(run.jobId));
    const expected = await service.getJobStatus(run.jobId, userId, db);
    const reads = statusReads.get(getJobStatusSnapshotKey(run.jobId));
    const events: unknown[] = [];
    initLogger({
      silent: true,
      drain: ({ event }) => {
        events.push(event);
      },
    });
    redisStatus = status;
    try {
      for (let poll = 0; poll < 2; poll++) {
        expect(await service.getJobStatus(run.jobId, userId, db)).toEqual(expected);
      }
      expect(statusReads.get(getJobStatusSnapshotKey(run.jobId))).toBe(reads);
      expect(events).toHaveLength(2);
      expect(events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            action: "sync.getJobStatus",
            outcome: "warn",
            level: "warn",
            failure: expect.objectContaining({
              _tag: "JobStatusCacheUnavailable",
              jobId: run.jobId,
            }),
          }),
        ]),
      );
    } finally {
      redisStatus = "ready";
      initLogger({ enabled: false });
    }
  },
);

test.each([true, false])(
  "CSV keeps its route action when it needs a fetch: %s",
  async (missing) => {
    const { default: service } = await import("./service");
    const { useLogger } = await import("evlog/elysia");
    const original = service.getExistingItemsWithLatestReleaseByExternalIds.bind(service);
    let logged: ReturnType<typeof useLogger> | undefined;
    const read = spyOn(
      service,
      "getExistingItemsWithLatestReleaseByExternalIds",
    ).mockImplementation(async (...args) => {
      logged = useLogger();
      return original(...args);
    });
    initLogger({ silent: true, drain: () => {} });
    try {
      expect(await post("/csv", [csvRow(missing ? X : PRESENT, "Owned", "10.00")])).toMatchObject({
        status: 200,
      });
      expect(logged?.getContext()).toMatchObject({
        action: "sync.csv",
        outcome: "success",
        user: { id: userId },
      });
    } finally {
      initLogger({ enabled: false });
      read.mockRestore();
    }
  },
);

test("an item upload's wide event names its session, job, item and outcome", async () => {
  const run = await start("item", { items: [X] });
  const { default: service } = await import("./service");
  const { useLogger } = await import("evlog/elysia");
  const original = service.getExistingItemsWithLatestReleaseByExternalIds.bind(service);
  let logged: ReturnType<typeof useLogger> | undefined;
  const read = spyOn(service, "getExistingItemsWithLatestReleaseByExternalIds").mockImplementation(
    async (...args) => {
      logged = useLogger();
      return original(...args);
    },
  );
  initLogger({ silent: true, drain: () => {} });
  try {
    expect(await complete(run, X)).toEqual(imported);
    expect(logged?.getContext()).toMatchObject({
      action: "sync.completeItem",
      outcome: "imported",
      sync: { sessionId: run.syncSessionId, jobId: run.jobId },
      mfc: { itemId: X },
    });
  } finally {
    initLogger({ enabled: false });
    read.mockRestore();
  }
});

describe("answers a retry cannot start with", () => {
  test("a retry past its window answers 409 and keeps the lapse it saved", async () => {
    const run = await start("item", { items: [X, Y] });
    expect(await complete(run, X)).toEqual(imported);
    const longAgo = new Date(Date.now() - SYNC_SESSION_RETRY_WINDOW_MS - 1000);
    await db
      .update(syncSession)
      .set({ createdAt: longAgo, updatedAt: longAgo })
      .where(eq(syncSession.id, run.syncSessionId));

    expect(await post(`/sessions/${run.syncSessionId}/retry`)).toEqual({
      status: 409,
      body: "The 20-day window to retry failed item results has expired",
    });
    expect(await session(run.syncSessionId)).toMatchObject({ status: "partial", failCount: 1 });
    expect(await results(run.syncSessionId)).toContainEqual({
      id: Y,
      status: "failed",
      reason: SYNC_STATUS_MESSAGES.interrupted,
    });
  });

  test("a completed run answers 409", async () => {
    const run = await start("item", { items: [X] });
    expect(await complete(run, X)).toEqual(imported);

    expect(await post(`/sessions/${run.syncSessionId}/retry`)).toEqual({
      status: 409,
      body: "These failed item results cannot be retried",
    });
  });

  test("an unknown import answers 404", async () => {
    expect(await post("/sessions/missing/retry")).toEqual({
      status: 404,
      body: "Import not found",
    });
  });
});

describe("answers for a bad session request", () => {
  test.each(["/sessions?page=0", "/sessions?page=x", "/sessions/missing?page=0"])(
    "%s answers 400 for its page",
    async (route) => {
      expect(await get(route)).toEqual({ status: 400, body: "Invalid page parameter" });
    },
  );

  test.each(["/sessions?limit=0", "/sessions?limit=101", "/sessions/missing?limit=0"])(
    "%s answers 400 for its limit",
    async (route) => {
      expect(await get(route)).toEqual({ status: 400, body: "Invalid limit parameter" });
    },
  );

  test("an unknown import's detail answers 404", async () => {
    expect(await get("/sessions/missing")).toEqual({ status: 404, body: "Import not found" });
  });

  test.each(["/heartbeat", "/interrupt"])("%s for an unknown import answers 404", async (route) => {
    expect(await post(`/sessions/missing${route}`, { jobId: "job" })).toEqual({
      status: 404,
      body: "Import not found",
    });
  });

  test("a failure for an unknown import answers 404", async () => {
    expect(
      await post("/sessions/missing/failures", {
        jobId: "job",
        mfcItemId: X,
        error: "hidden_or_missing",
      }),
    ).toEqual({ status: 404, body: "Import not found" });
  });

  test("an item outside the import answers 404", async () => {
    const run = await start("item", { items: [X] });
    expect(await complete(run, Z)).toEqual({
      status: 404,
      body: "This item is not part of the import",
    });
  });
});

test("a broken invariant in an item upload answers a logged 500 and records nothing", async () => {
  const run = await start("item", { items: [X] });
  const { default: service } = await import("./service");
  const lookup = spyOn(service, "getExistingItemsWithLatestReleaseByExternalIds").mockResolvedValue(
    [],
  );
  try {
    expect(await complete(run, X)).toEqual({ status: 500, body: "Failed to import item" });
  } finally {
    lookup.mockRestore();
  }
  expect(await results(run.syncSessionId)).toEqual([{ id: X, status: "pending", reason: null }]);
});

test("hanging job status cache read settles within its deadline", async () => {
  const run = await start("item", { items: [X] });
  const { default: service } = await import("./service");
  const hung = Promise.withResolvers<never>();
  hungStatusRead = hung;
  const realTimer = globalThis.setTimeout;
  const timer = spyOn(globalThis, "setTimeout").mockImplementation(
    Object.assign(
      (...[fn, ms, ...args]: Parameters<typeof setTimeout>) =>
        realTimer(fn, ms === 1000 ? 5 : ms, ...args),
      { __promisify__: realTimer.__promisify__ },
    ),
  );
  const pending = service.getJobStatus(run.jobId, userId, db);
  let guard: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      pending,
      new Promise<null>((resolve) => {
        guard = realTimer(() => resolve(null), 250);
      }),
    ]);
    expect(result).not.toBeNull();
    expect(result?.isOk()).toBe(true);
    if (result?.isOk())
      expect(result.value).toMatchObject({ jobId: run.jobId, terminalState: null });
  } finally {
    clearTimeout(guard);
    timer.mockRestore();
    hungStatusRead = null;
    hung.reject(new Error("test releases hung Redis"));
    await pending;
  }
});

test("a corrupt snapshot logs JobStatusSnapshotCorrupt and serves the DB status", async () => {
  const run = await start("item", { items: [X] });
  redisValues.set(getJobStatusSnapshotKey(run.jobId), '{"jobId":');
  const { default: service } = await import("./service");
  const events: unknown[] = [];
  initLogger({
    silent: true,
    drain: ({ event }) => {
      events.push(event);
    },
  });
  try {
    const result = await service.getJobStatus(run.jobId, userId, db);
    expect(result.isOk()).toBe(true);
    if (result.isOk())
      expect(result.value).toMatchObject({ jobId: run.jobId, terminalState: null });
    expect(events).toContainEqual(
      expect.objectContaining({
        action: "sync.getJobStatus",
        failure: expect.objectContaining({
          _tag: "JobStatusSnapshotCorrupt",
          jobId: run.jobId,
          cause: expect.objectContaining({ _tag: "JobStatusPayloadInvalid" }),
        }),
      }),
    );
  } finally {
    initLogger({ enabled: false });
  }
});

test("a missing Item import completion is refused instead of reporting success", async () => {
  const { default: service } = await import("./service");
  const update = spyOn(service, "updateSyncSession").mockResolvedValue(false);
  try {
    expect(await post("/item", { items: [PRESENT] })).toEqual({
      status: 500,
      body: "Failed to update import record",
    });
  } finally {
    update.mockRestore();
  }
});

test("a corrupt retained sync payload refuses retry explicitly and logs its schema failure", async () => {
  const run = await start("item", { items: [X] });
  await fail(run, X);
  await db.execute(
    sql`UPDATE sync_session SET request_payload = '{"type":"obsolete"}'::jsonb WHERE id = ${run.syncSessionId}`,
  );
  const { createRequestLogger } = await import("evlog");
  const { serve } = await import("@/domain/kernel");
  const { Viewer } = await import("@/domain/viewer");
  const { SyncRuns } = await import("./module");
  initLogger({ silent: true, drain: () => {} });
  const log = createRequestLogger();
  try {
    await serve({ viewer: Viewer.fromSession({ user: { id: userId } }), log }, SyncRuns.retry, {
      id: run.syncSessionId,
      emailVerified: true,
    });
    expect(log.getContext()).toMatchObject({
      error: { name: "StoredSyncPayloadInvalid", cause: expect.anything() },
    });
    expect(await post(`/sessions/${run.syncSessionId}/retry`)).toEqual({
      status: 409,
      body: "This import can't be retried",
    });
    expect(await session(run.syncSessionId)).toMatchObject({ status: "failed" });
  } finally {
    initLogger({ enabled: false });
  }
});

test.each(["order", "order-item", "csv"])(
  "a malformed retained %s payload refuses retry before reading Order lock fields",
  async (type) => {
    const run = await start("item", { items: [X] });
    await fail(run, X);
    const malformed = JSON.stringify({ type, payloadVersion: 3 });
    await db.execute(
      sql`UPDATE sync_session SET request_payload = ${malformed}::jsonb WHERE id = ${run.syncSessionId}`,
    );
    expect(await post(`/sessions/${run.syncSessionId}/retry`)).toEqual({
      status: 409,
      body: "This import can't be retried",
    });
    expect(await session(run.syncSessionId)).toMatchObject({ status: "failed" });
  },
);

test.each(["order", "order-item", "csv"])(
  "completion of a malformed retained %s payload rolls back with a logged 500",
  async (type) => {
    const run = await start("item", { items: [X] });
    const malformed = JSON.stringify({ type, payloadVersion: 3 });
    await db.execute(
      sql`UPDATE sync_session SET request_payload = ${malformed}::jsonb WHERE id = ${run.syncSessionId}`,
    );
    expect(await complete(run, X)).toEqual({ status: 500, body: "Failed to import item" });
    expect(await results(run.syncSessionId)).toEqual([{ id: X, status: "pending", reason: null }]);
    expect(await db.select({ id: item.id }).from(item).where(eq(item.externalId, X))).toEqual([]);
  },
);

test("CSV imports a rejected price as zero and warns in its immediate result", async () => {
  const reply = await post("/csv", [csvRow(PRESENT, "Owned", "12,50")]);
  expect(reply).toMatchObject({
    status: 200,
    body: { isFinished: true, warnings: [{ mfcItemId: PRESENT, input: "12,50" }] },
  });
  expect(await db.select({ price: collection.price }).from(collection)).toEqual([{ price: 0 }]);
});

test("CSV price warnings survive fetched completion, retry and the DB status fallback", async () => {
  const reply = await post("/csv", [
    csvRow(PRESENT, "Owned", "12,50"),
    csvRow(X, "Owned", "1.2.3"),
  ]);
  const warnings = [
    { mfcItemId: PRESENT, input: "12,50" },
    { mfcItemId: X, input: "1.2.3" },
  ];
  expect(reply).toMatchObject({ status: 200, body: { warnings } });
  const run = startedSchema.parse(reply.body);
  expect(await storedJobStatus(run.jobId)).toMatchObject({ warnings });
  await fail(run, X);
  const retried = await retry(run.syncSessionId);
  expect(await storedJobStatus(retried.jobId)).toMatchObject({ warnings });
  expect(await complete(retried, X)).toEqual(imported);
  expect(snapshot(retried.jobId)).toMatchObject({ warnings });
  redisValues.delete(getJobStatusSnapshotKey(retried.jobId));
  expect(await storedJobStatus(retried.jobId)).toMatchObject({
    terminalState: "success",
    warnings,
  });
  expect(await db.select({ price: collection.price }).from(collection)).toEqual([
    { price: 0 },
    { price: 0 },
  ]);
});

async function checkReviewStart(entry: SyncCase) {
  const body = await entry.body();
  const before = await db.select().from(order);
  await setExtensionRelease("in_review");
  expect(await post(`/${entry.type}`, body)).toEqual({
    status: 409,
    body: "Importing is unavailable until the browser extension is released.",
  });
  expect(await db.select().from(syncSession)).toEqual([]);
  expect(await db.select().from(syncSessionItem)).toEqual([]);
  expect(await db.select().from(collection)).toEqual([]);
  expect(await db.select().from(order)).toEqual(before);
  expect(picturePuts).toBe(0);
}

async function checkReviewOperation(operation: string) {
  const run = await start("item", { items: [X] });
  const before = await db.select().from(syncSession);
  const beforeItems = await db.select().from(syncSessionItem);
  await setExtensionRelease("in_review");
  async function replyForOperation() {
    switch (operation) {
      case "complete":
        return complete(run, X);
      case "retry":
        return post(`/sessions/${run.syncSessionId}/retry`);
      case "failure":
        return fail(run, X);
      case "heartbeat":
        return heartbeat(run);
      default:
        return interrupt(run);
    }
  }
  const reply = await replyForOperation();
  expect(reply).toEqual({
    status: 409,
    body: "Importing is unavailable until the browser extension is released.",
  });
  expect(await db.select().from(syncSession)).toEqual(before);
  expect(await db.select().from(syncSessionItem)).toEqual(beforeItems);
  expect(await db.select().from(collection)).toEqual([]);
  expect(picturePuts).toBe(0);
  const detail = await get(`/sessions/${run.syncSessionId}`);
  expect(detail.status).toBe(200);
}

describe("extension release gate", () => {
  for (const entry of cases) {
    test(`in review refuses ${entry.type} start without writing`, () => checkReviewStart(entry));
  }
  for (const operation of ["complete", "retry", "failure", "heartbeat", "interrupt"]) {
    test(`in review refuses ${operation} without writing`, () => checkReviewOperation(operation));
  }
});

describe("committed sync publication", () => {
  test("a reconnecting cache skips publication and answers the committed start", async () => {
    const events: unknown[] = [];
    initLogger({
      silent: true,
      drain: ({ event }) => {
        events.push(event);
      },
    });
    try {
      redisStatus = "reconnecting";
      const run = await start("item", { items: [X] });
      expect(await session(run.syncSessionId)).toMatchObject({ status: "processing" });
      expect(publicationCalls).toBe(0);
      expect(events).toContainEqual(
        expect.objectContaining({
          action: "sync.jobStatusCache",
          level: "warn",
          outcome: "warn",
          failure: expect.objectContaining({ _tag: "PublishJobStatusFailed" }),
        }),
      );
    } finally {
      initLogger({ enabled: false });
    }
  });
  test("a cache that never settles cannot hang the committed start", async () => {
    const events: unknown[] = [];
    initLogger({
      silent: true,
      drain: ({ event }) => {
        events.push(event);
      },
    });
    try {
      hangPublication = true;
      const run = await withDeadline(() => start("item", { items: [X] }), 1800);
      expect(await session(run.syncSessionId)).toMatchObject({ status: "processing" });
      expect(publicationCalls).toBe(1);
      expect(events).toContainEqual(
        expect.objectContaining({
          action: "sync.jobStatusCache",
          level: "warn",
          outcome: "warn",
          failure: expect.objectContaining({ _tag: "PublishJobStatusFailed" }),
        }),
      );
    } finally {
      initLogger({ enabled: false });
    }
  });
});

describe("sync detail price warnings", () => {
  test.each(["12,50", "12.50"])("detail returns persisted CSV warnings for %s", async (price) => {
    const run = await start("csv", [csvRow(X, "Owned", price)]);
    const expected = price === "12,50" ? [{ mfcItemId: X, input: price }] : [];
    const reply = await get(`/sessions/${run.syncSessionId}`);
    expect(reply).toMatchObject({ status: 200, body: { session: { warnings: expected } } });
    const { default: service } = await import("./service");
    const detail = await service.getSyncSessionDetail(
      run.syncSessionId,
      userId,
      undefined,
      undefined,
      undefined,
      db,
    );
    expect(detail).toMatchObject({ session: { warnings: expected } });
    await complete(run, X);
    expect(await get(`/sessions/${run.syncSessionId}`)).toMatchObject({
      status: 200,
      body: { session: { warnings: expected } },
    });
  });
  test("non-CSV detail returns an explicit empty warning list", async () => {
    const run = await start("item", { items: [X] });
    expect(await get(`/sessions/${run.syncSessionId}`)).toMatchObject({
      status: 200,
      body: { session: { warnings: [] } },
    });
  });
});

test("main scraped results read as imported in detail, filters, counts and retry", async () => {
  const run = await start("item", { items: [PRESENT, X, Y] });
  expect(await complete(run, X)).toEqual(imported);
  await db.execute(
    sql`update sync_session_item set status = 'scraped' where sync_session_id = ${run.syncSessionId} and status = 'imported'`,
  );
  const detailReply = await get(`/sessions/${run.syncSessionId}`);
  const detail = detailSchema.parse(detailReply.body);
  expect(
    detail.session.items
      .filter((row) => row.status === "imported")
      .map((row) => row.itemExternalId)
      .toSorted(),
  ).toEqual([PRESENT, X].toSorted());
  const filteredReply = await get(`/sessions/${run.syncSessionId}?status=imported`);
  expect(detailSchema.parse(filteredReply.body).session.items).toHaveLength(2);
  expect(await complete(run, X)).toEqual({
    status: 200,
    body: { outcome: "already_imported", reason: null },
  });
  await fail(run, Y);
  expect(await session(run.syncSessionId)).toMatchObject({
    successCount: 2,
    failCount: 1,
    status: "partial",
  });
  expect(await storedJobStatus(run.jobId)).toMatchObject({
    progress: { succeeded: 2, failed: 1 },
    recentItems: expect.arrayContaining([
      expect.objectContaining({ externalId: X, outcome: "succeeded" }),
    ]),
  });
  await retry(run.syncSessionId);
  expect(await session(run.syncSessionId)).toMatchObject({ successCount: 2, failCount: 0 });
});

async function seedMainPayload(run: Run) {
  const [saved] = await db
    .select({ payload: syncSession.requestPayload })
    .from(syncSession)
    .where(eq(syncSession.id, run.syncSessionId));
  if (!saved?.payload) throw new Error("seeded session has no payload");
  const payload = saved.payload;
  const legacy = (() => {
    if (payload.type === "collection") {
      const { itemsToFetch, ...rest } = payload.collection;
      return { ...payload, collection: { ...rest, itemsToScrape: itemsToFetch } };
    }
    if (payload.type === "order" || payload.type === "order-item") {
      const { itemsToFetch, ...rest } = payload.order;
      return { ...payload, order: { ...rest, itemsToScrape: itemsToFetch } };
    }
    if (payload.type === "csv") {
      const { warnings: _warnings, ...rest } = payload;
      return {
        ...rest,
        items: payload.items.map(({ priceMinorUnits: _priceMinorUnits, ...row }) => row),
      };
    }
    throw new Error("this fixture expects a collection, order or CSV payload");
  })();
  await db.execute(
    sql`update sync_session set request_payload = ${JSON.stringify(legacy)}::text::jsonb where id = ${run.syncSessionId}`,
  );
}

describe("main retained payloads", () => {
  for (const entry of cases.filter((candidate) =>
    ["collection", "order", "order-item"].includes(candidate.type),
  )) {
    test(`retries main ${entry.type} itemsToScrape`, async () => {
      const run = await start(entry.type, await entry.body());
      await interrupt(run);
      await seedMainPayload(run);
      const retried = await retry(run.syncSessionId);
      expect(retried.missingMfcItemIds).toEqual([X, Y, Z]);
    });
  }
  test("raw main CSV prices normalize once for reads, retry and fetched completion", async () => {
    const run = await start("csv", [csvRow(X, "Owned", "12.50"), csvRow(Y, "Owned", "12,50")]);
    await interrupt(run);
    await seedMainPayload(run);
    redisValues.clear();
    const warnings = [{ mfcItemId: Y, input: "12,50" }];
    expect(await storedJobStatus(run.jobId)).toMatchObject({ warnings });
    expect(await get(`/sessions/${run.syncSessionId}`)).toMatchObject({
      status: 200,
      body: { session: { warnings } },
    });
    const retried = await retry(run.syncSessionId);
    expect(retried.missingMfcItemIds).toEqual([X, Y]);
    expect(await complete(retried, X)).toEqual(imported);
    expect(await complete(retried, Y)).toEqual(imported);
    expect(await userRows()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ mfcItemId: X, price: 1250 }),
        expect.objectContaining({ mfcItemId: Y, price: 0 }),
      ]),
    );
    expect(await storedJobStatus(retried.jobId)).toMatchObject({
      warnings,
      terminalState: "success",
    });
  });
});
