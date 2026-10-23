import { beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import path from "node:path";
import { Elysia } from "elysia";
import { initLogger } from "evlog";
import { asc, eq } from "drizzle-orm";
import * as z from "zod";
import { dataTransferImportSchema } from "@myakiba/contracts/data-transfer/schema";
import type {
  DataTransferArchiveV1,
  DataTransferCollectionItemV1,
  DataTransferImportItemFailure,
  DataTransferImportRequest,
} from "@myakiba/contracts/data-transfer/schema";
import { syncJobStatusSchema } from "@myakiba/contracts/sync/schema";
import type { SyncJobStatus } from "@myakiba/contracts/sync/schema";
import { parseJson } from "@myakiba/utils/parse-json";
import * as authSchema from "@myakiba/db/schema/auth";
import {
  collection,
  dataTransferImport,
  dataTransferImportItem,
  item,
  item_release,
  order,
} from "@myakiba/db/schema/figure";
import { createItemImages } from "@/lib/item-images";
import { createTestDatabase } from "../../../test/database";

initLogger({ enabled: false });

const userId = "user-1";

await mock.module("@myakiba/auth/server", () => ({
  auth: {
    handler: () => new Response(null, { status: 404 }),
    api: {
      getSession: async ({ headers }: { headers: Headers }) => {
        const id = headers.get("x-test-user");
        const emailVerified = headers.get("x-test-unverified") === null;
        return id ? { user: { id, emailVerified }, session: { id: `session-${id}` } } : null;
      },
    },
  },
}));

let failS3 = false;
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
const snapshots = new Map<string, string>();

type MessageListener = (channel: string, payload: string) => void;
type Subscriber = { readonly channels: Set<string>; readonly listeners: Set<MessageListener> };
const subscribers = new Set<Subscriber>();

const fakeRedis = {
  status: "ready",
  get: async (key: string) => snapshots.get(key) ?? null,
  eval: async () => [1, 1800],
  multi() {
    const writes: (() => void)[] = [];
    const chain = {
      set: (key: string, value: string) => {
        writes.push(() => snapshots.set(key, value));
        return chain;
      },
      publish: (channel: string, payload: string) => {
        writes.push(() =>
          queueMicrotask(() => {
            for (const subscriber of subscribers) {
              if (!subscriber.channels.has(channel)) continue;
              for (const listener of subscriber.listeners) listener(channel, payload);
            }
          }),
        );
        return chain;
      },
      exec: async () =>
        writes.map((write) => {
          write();
          return [null, "OK"];
        }),
    };
    return chain;
  },
  duplicate() {
    const subscriber: Subscriber = { channels: new Set(), listeners: new Set() };
    subscribers.add(subscriber);
    return {
      on: (event: string, listener: MessageListener) => {
        if (event === "message") subscriber.listeners.add(listener);
      },
      off: (_event: string, listener: MessageListener) => subscriber.listeners.delete(listener),
      subscribe: async (channel: string) => subscriber.channels.add(channel),
      unsubscribe: async (channel: string) => subscriber.channels.delete(channel),
      disconnect: () => subscribers.delete(subscriber),
    };
  },
};

await mock.module("@myakiba/redis/client", () => ({ redis: fakeRedis }));

const db = await createTestDatabase();
const { default: dataTransferRouter } = await import("./index");
const app = new Elysia({ prefix: "/api" }).use(dataTransferRouter);

const fixtures = path.join(import.meta.dir, "../../../../../packages/mfc/fixtures");
const page98777 = await Bun.file(path.join(fixtures, "item-98777.html")).text();
const derivedPage = (id: number) =>
  page98777.replaceAll("/item/98777", `/item/${id}`).replaceAll("objectId=98777", `objectId=${id}`);

const headers = { "x-test-user": userId };

async function answer(response: Response) {
  const json = response.headers.get("content-type")?.includes("json");
  return { status: response.status, body: json ? await response.json() : await response.text() };
}

type PostBody =
  | DataTransferImportRequest
  | DataTransferImportItemFailure
  | { readonly jobId: string };

async function post(route: string, body?: PostBody) {
  return answer(
    await app.handle(
      new Request(`http://localhost/api/data-transfer${route}`, {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    ),
  );
}

async function current() {
  return answer(
    await app.handle(
      new Request("http://localhost/api/data-transfer/imports/current", { headers }),
    ),
  );
}

async function complete(jobId: string, mfcItemId: number, extraHeaders?: Record<string, string>) {
  const form = new FormData();
  form.set("jobId", jobId);
  form.set("mfcItemId", String(mfcItemId));
  form.set(
    "picture",
    new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], "picture", { type: "image/jpeg" }),
  );
  form.set("page", new File([derivedPage(mfcItemId)], "page.html", { type: "text/html" }));
  return answer(
    await app.handle(
      new Request("http://localhost/api/data-transfer/imports/current/items", {
        method: "POST",
        headers: { ...headers, ...extraHeaders },
        body: form,
      }),
    ),
  );
}

const fail = (jobId: string, mfcItemId: number, reason = "MyFigureCollection timed out") =>
  post("/imports/current/items/failure", { jobId, mfcItemId, reason });

function orderRecord(orderKey: string): DataTransferArchiveV1["orders"][number] {
  return {
    orderKey,
    title: `Order ${orderKey}`,
    shop: "AmiAmi",
    orderDate: "2024-01-02",
    releaseDate: null,
    paymentDate: null,
    shippingDate: null,
    collectionDate: null,
    shippingMethod: "EMS",
    status: "Ordered",
    shippingFee: 1500,
    taxes: 0,
    duties: 0,
    tariffs: 0,
    miscFees: 0,
    notes: "",
    createdAt: "2024-01-02T03:04:05.000Z",
    updatedAt: "2024-01-03T03:04:05.000Z",
  };
}

function collectionRecord(
  collectionKey: string,
  externalId: number,
  options: {
    readonly orderKey?: string | null;
    readonly release?: DataTransferCollectionItemV1["item"]["selectedRelease"];
  } = {},
): DataTransferCollectionItemV1 {
  return {
    collectionKey,
    orderKey: options.orderKey ?? null,
    status: "Owned",
    count: 1,
    score: "8.5",
    price: 12_000,
    shop: "AmiAmi",
    orderDate: null,
    paymentDate: null,
    shippingDate: null,
    collectionDate: "2024-03-04",
    shippingMethod: "n/a",
    soldFor: null,
    soldDate: null,
    tags: ["shelf"],
    condition: "New",
    notes: `row ${collectionKey}`,
    createdAt: "2024-02-02T03:04:05.000Z",
    updatedAt: "2024-02-03T03:04:05.000Z",
    item: {
      source: "mfc",
      externalId,
      sourceTitle: `Item ${externalId}`,
      selectedRelease: options.release ?? null,
    },
  };
}

function archiveOf(
  orders: DataTransferArchiveV1["orders"],
  collectionItems: DataTransferArchiveV1["collectionItems"],
): DataTransferArchiveV1 {
  return {
    format: "myakiba-data-transfer",
    version: 1,
    exportId: "export-1",
    exportedAt: "2024-05-01T00:00:00.000Z",
    source: { application: "myakiba" },
    orders,
    collectionItems,
  };
}

async function seedItem(externalId: number, releaseDates: readonly string[] = []) {
  const [saved] = await db
    .insert(item)
    .values({ externalId, source: "mfc", title: `Seeded ${externalId}`, category: "Prepainted" })
    .returning({ id: item.id });
  if (!saved) throw new Error("item not seeded");
  for (const [index, date] of releaseDates.entries()) {
    await db.insert(item_release).values({
      id: crypto.randomUUID(),
      itemId: saved.id,
      date,
      type: index === 0 ? "Limited" : "Resale",
      price: 15_000,
      priceCurrency: "JPY",
      barcode: null,
    });
  }
  return saved.id;
}

const start = (archive: DataTransferArchiveV1, fileName = "export.json") =>
  post("/imports", { fileName, archive });

const importRunSchema = dataTransferImportSchema.extend({
  missingMfcItemIds: z.array(z.number()),
});

async function startRun(archive: DataTransferArchiveV1) {
  const started = await start(archive);
  return importRunSchema.parse(started.body);
}

async function retryRun() {
  const retried = await post("/imports/current/retry");
  return importRunSchema.parse(retried.body);
}

async function currentImport() {
  const found = await current();
  return found.body;
}

async function heartbeat(jobId: string) {
  const answered = await post("/imports/current/heartbeat", { jobId });
  return answered.body;
}

async function collectionRows() {
  return db
    .select({
      notes: collection.notes,
      itemExternalId: item.externalId,
      orderTitle: order.title,
      releaseDate: item_release.date,
    })
    .from(collection)
    .innerJoin(item, eq(item.id, collection.itemId))
    .leftJoin(order, eq(order.id, collection.orderId))
    .leftJoin(item_release, eq(item_release.id, collection.releaseId))
    .where(eq(collection.userId, userId))
    .orderBy(asc(collection.notes));
}

async function expireLease() {
  await db
    .update(dataTransferImport)
    .set({ heartbeatAt: new Date(Date.now() - 121_000) })
    .where(eq(dataTransferImport.userId, userId));
}

beforeEach(async () => {
  await db.execute('TRUNCATE "user", item, entry CASCADE');
  await db
    .insert(authSchema.user)
    .values({ id: userId, name: "Ryan", email: "r@example.com", username: "ryan" });
  snapshots.clear();
});

describe("starting an import", () => {
  test("writes every order and every row whose item exists, and returns the missing items", async () => {
    await seedItem(1, ["2024-04-01"]);
    const archive = archiveOf(
      [orderRecord("order-1")],
      [
        collectionRecord("c1", 1, {
          orderKey: "order-1",
          release: {
            date: "2024-04-01",
            type: "Limited",
            price: 15_000,
            priceCurrency: "JPY",
            barcode: null,
          },
        }),
        collectionRecord("c2", 98_777, { orderKey: "order-1" }),
        collectionRecord("c3", 98_777),
        collectionRecord("c4", 98_778),
      ],
    );

    const started = await startRun(archive);

    expect(started).toMatchObject({
      status: "running",
      importedOrders: 1,
      importedCollectionItems: 1,
      failedCollectionItems: 0,
    });
    expect(started.missingMfcItemIds.toSorted()).toEqual([98_777, 98_778]);
    expect(await collectionRows()).toEqual([
      {
        notes: "row c1",
        itemExternalId: 1,
        orderTitle: "Order order-1",
        releaseDate: "2024-04-01",
      },
    ]);
    const [savedOrder] = await db.select({ releaseDate: order.releaseDate }).from(order);
    expect(savedOrder?.releaseDate).toBe("2024-04-01");
  });

  test("ends completed in the request when every item exists", async () => {
    await seedItem(1, ["2024-04-01", "2024-06-01"]);
    const archive = archiveOf(
      [orderRecord("order-1")],
      [
        collectionRecord("c1", 1, {
          release: {
            date: "2024-05-01",
            type: null,
            price: null,
            priceCurrency: null,
            barcode: null,
          },
        }),
      ],
    );

    const started = await startRun(archive);

    expect(started).toMatchObject({
      status: "completed",
      importedOrders: 1,
      importedCollectionItems: 1,
      failedCollectionItems: 0,
      report: { failureReasons: [], releaseSubstitutions: 1, missingReleases: 0 },
      missingMfcItemIds: [],
    });
    const [saved] = await db
      .select({ archive: dataTransferImport.archive })
      .from(dataTransferImport);
    expect(saved?.archive).toBeNull();
    const [row] = await collectionRows();
    expect(row?.releaseDate).toBe("2024-06-01");
  });

  test("refuses a second import while one is running", async () => {
    await start(archiveOf([], [collectionRecord("c1", 98_777)]));

    const second = await start(archiveOf([orderRecord("order-1")], []));

    expect(second).toEqual({ status: 409, body: "Another data import is already active." });
  });
});

describe("items fetched through the extension", () => {
  test("one completed and one failed ends partial, and retrying the failed one completes", async () => {
    const archive = archiveOf(
      [orderRecord("order-1")],
      [
        collectionRecord("c1", 98_777, { orderKey: "order-1" }),
        collectionRecord("c2", 98_777),
        collectionRecord("c3", 98_778),
      ],
    );
    const started = await startRun(archive);
    const jobId = started.id;

    const completed = await complete(jobId, 98_777);
    expect(completed.body).toMatchObject({ status: "running", importedCollectionItems: 2 });

    const failed = await fail(jobId, 98_778);
    expect(failed.body).toMatchObject({
      status: "partial",
      importedOrders: 1,
      importedCollectionItems: 2,
      failedCollectionItems: 1,
      report: { failureReasons: [{ reason: "MyFigureCollection timed out", count: 1 }] },
    });

    const retried = await retryRun();
    expect(retried).toMatchObject({ status: "running", missingMfcItemIds: [98_778] });
    expect(retried.id).not.toBe(jobId);

    const finished = await complete(retried.id, 98_778);
    expect(finished.body).toMatchObject({
      status: "completed",
      importedOrders: 1,
      importedCollectionItems: 3,
      failedCollectionItems: 0,
      report: { failureReasons: [] },
    });
    const rows = await collectionRows();
    expect(rows.map((row) => [row.notes, row.orderTitle])).toEqual([
      ["row c1", "Order order-1"],
      ["row c2", null],
      ["row c3", null],
    ]);
  });

  test("the same item uploaded twice writes once", async () => {
    const started = await startRun(archiveOf([], [collectionRecord("c1", 98_777)]));
    const jobId = started.id;

    const [first, second] = await Promise.all([complete(jobId, 98_777), complete(jobId, 98_777)]);
    const third = await complete(jobId, 98_777);

    expect([first.status, second.status, third.status]).toEqual([200, 200, 200]);
    expect(third.body).toMatchObject({ status: "completed", importedCollectionItems: 1 });
    expect(await collectionRows()).toHaveLength(1);
    expect(await db.select({ id: item.id }).from(item)).toHaveLength(1);
  });

  test("a failure from an earlier run is ignored, and a late success still imports", async () => {
    const started = await startRun(
      archiveOf([], [collectionRecord("c1", 98_777), collectionRecord("c2", 98_778)]),
    );
    const firstRun = started.id;
    await fail(firstRun, 98_778);
    await fail(firstRun, 98_777);
    const retried = await retryRun();
    expect(retried.missingMfcItemIds.toSorted()).toEqual([98_777, 98_778]);

    const stale = await fail(firstRun, 98_777);
    expect(stale.body).toMatchObject({ status: "running", failedCollectionItems: 0 });

    await fail(retried.id, 98_777);
    await fail(retried.id, 98_778);
    const late = await complete(firstRun, 98_778);

    expect(late.body).toMatchObject({
      status: "partial",
      importedCollectionItems: 1,
      failedCollectionItems: 1,
    });
  });

  test("a page MyFigureCollection would not show fails the item with its reason", async () => {
    const started = await startRun(
      archiveOf([orderRecord("order-1")], [collectionRecord("c1", 98_777)]),
    );
    const notFound = await Bun.file(
      path.join(fixtures, "derived-not-found-signed-out.html"),
    ).text();
    const form = new FormData();
    form.set("jobId", started.id);
    form.set("mfcItemId", "98777");
    form.set("page", new File([notFound], "page.html", { type: "text/html" }));

    const rejected = await answer(
      await app.handle(
        new Request("http://localhost/api/data-transfer/imports/current/items", {
          method: "POST",
          headers,
          body: form,
        }),
      ),
    );

    expect(rejected).toEqual({ status: 400, body: "MyFigureCollection did not show this item" });
    expect(await currentImport()).toMatchObject({
      status: "partial",
      report: {
        failureReasons: [{ reason: "MyFigureCollection did not show this item", count: 1 }],
      },
    });
  });

  test("an unverified email cannot upload an item", async () => {
    const started = await startRun(archiveOf([], [collectionRecord("c1", 98_777)]));

    const rejected = await complete(started.id, 98_777, { "x-test-unverified": "1" });

    expect(rejected.status).toBe(403);
    expect(await db.select({ id: item.id }).from(item)).toHaveLength(0);
  });

  test("a row whose order was deleted meanwhile imports without it", async () => {
    const started = await startRun(
      archiveOf(
        [orderRecord("order-1")],
        [collectionRecord("c1", 98_777, { orderKey: "order-1" })],
      ),
    );
    await db.delete(order).where(eq(order.userId, userId));

    const completed = await complete(started.id, 98_777);

    expect(completed.body).toMatchObject({ status: "completed", importedCollectionItems: 1 });
    const rows = await collectionRows();
    expect(rows.map((row) => row.orderTitle)).toEqual([null]);
  });
});

describe("an interrupted import", () => {
  test("an interrupt fails every pending item as interrupted", async () => {
    const started = await startRun(
      archiveOf(
        [orderRecord("order-1")],
        [collectionRecord("c1", 98_777), collectionRecord("c2", 98_778)],
      ),
    );

    const interrupted = await post("/imports/current/interrupt", { jobId: started.id });

    expect(interrupted.body).toMatchObject({
      status: "partial",
      failedCollectionItems: 2,
      report: { failureReasons: [{ reason: "import interrupted", count: 2 }] },
    });
    const items = await db
      .select({ status: dataTransferImportItem.status, reason: dataTransferImportItem.errorReason })
      .from(dataTransferImportItem);
    expect(items).toEqual([
      { status: "failed", reason: "import interrupted" },
      { status: "failed", reason: "import interrupted" },
    ]);
    const retried = await retryRun();
    expect(retried.missingMfcItemIds.toSorted()).toEqual([98_777, 98_778]);
  });

  test("a lapsed heartbeat reads as interrupted, and the next write records it", async () => {
    const started = await startRun(archiveOf([], [collectionRecord("c1", 98_777)]));
    expect(await heartbeat(started.id)).toEqual({
      running: true,
    });
    await expireLease();

    expect(await currentImport()).toMatchObject({
      status: "failed",
      failedCollectionItems: 1,
      error: "No orders or collection items could be imported.",
      report: { failureReasons: [{ reason: "import interrupted", count: 1 }] },
    });
    const [beforeWrite] = await db
      .select({ status: dataTransferImport.status })
      .from(dataTransferImport);
    expect(beforeWrite?.status).toBe("running");

    expect(await heartbeat(started.id)).toEqual({
      running: false,
    });
    const [afterWrite] = await db
      .select({ status: dataTransferImport.status })
      .from(dataTransferImport);
    expect(afterWrite?.status).toBe("failed");
    const next = await start(archiveOf([orderRecord("order-1")], []));
    expect(next.status).toBe(200);
  });

  test("worker-era imports keep their worker lease for a day", async () => {
    await db.insert(dataTransferImport).values({
      userId,
      importId: "legacy",
      jobId: "legacy",
      fileName: "export.json",
      status: "queued",
      phase: "queued",
      updatedAt: new Date(Date.now() - 180_000),
    });
    expect(await currentImport()).toMatchObject({ status: "queued", error: null });
    expect(await post("/imports/current/retry")).toMatchObject({ status: 409 });
  });
});

describe("retry and delete", () => {
  test("a completed import cannot be retried", async () => {
    await startRun(archiveOf([orderRecord("order-1")], []));

    const retried = await post("/imports/current/retry");

    expect(retried).toEqual({
      status: 409,
      body: "The import does not exist or cannot be retried in its current state.",
    });
  });

  test("a running import cannot be deleted until its lease lapses", async () => {
    await startRun(archiveOf([], [collectionRecord("c1", 98_777)]));
    const remove = () =>
      app.handle(
        new Request("http://localhost/api/data-transfer/imports/current", {
          method: "DELETE",
          headers,
        }),
      );

    const refused = await remove();
    expect(refused.status).toBe(409);
    await expireLease();
    const removed = await remove();

    expect(removed.status).toBe(200);
    expect(await db.select().from(dataTransferImportItem)).toEqual([]);
  });
});

describe("the import status stream", () => {
  test("sends an update for each item the page reports", async () => {
    const started = await startRun(
      archiveOf([], [collectionRecord("c1", 98_777), collectionRecord("c2", 98_778)]),
    );
    const abort = new AbortController();
    const response = await app.handle(
      new Request("http://localhost/api/data-transfer/imports/current/status", {
        headers,
        signal: abort.signal,
      }),
    );
    const reader = response.body?.getReader();
    if (!reader) throw new Error("no stream");
    let buffered = "";
    const nextStatus = async (): Promise<SyncJobStatus> => {
      while (!buffered.includes("\n\n")) {
        const chunk = await reader.read();
        if (chunk.done) throw new Error("stream ended");
        // Elysia enqueues each event as a string, which Response reads like bytes.
        buffered += await new Response(chunk.value).text();
      }
      const end = buffered.indexOf("\n\n");
      const event = buffered.slice(0, end);
      buffered = buffered.slice(end + 2);
      const data = event
        .split("\n")
        .find((line) => line.startsWith("data:"))
        ?.slice(5);
      const parsed = parseJson(syncJobStatusSchema, data ?? "");
      if (parsed.error) throw parsed.error;
      return parsed.data;
    };

    expect(await nextStatus()).toMatchObject({
      phase: "scraping",
      progress: { processed: 0, total: 2, succeeded: 0, failed: 0 },
      recentItems: [],
      terminalState: null,
    });

    await complete(started.id, 98_777);
    expect(await nextStatus()).toMatchObject({
      progress: { processed: 1, total: 2, succeeded: 1, failed: 0 },
      recentItems: [{ externalId: 98_777, outcome: "succeeded", failureReason: null }],
      terminalState: null,
    });

    await fail(started.id, 98_778);
    expect(await nextStatus()).toMatchObject({
      phase: "completed",
      progress: { processed: 2, total: 2, succeeded: 1, failed: 1 },
      recentItems: [
        { externalId: 98_778, outcome: "failed", failureReason: "MyFigureCollection timed out" },
        { externalId: 98_777, outcome: "succeeded" },
      ],
      terminalState: "partial",
    });
    abort.abort();
  });
});

describe("a large archive", () => {
  test("applies 20,000 records within 20 seconds", async () => {
    const itemIds = Array.from({ length: 200 }, (_, index) => index + 1);
    for (const externalId of itemIds) await seedItem(externalId, ["2024-04-01"]);
    const orders = Array.from({ length: 2000 }, (_, index) => orderRecord(`order-${index + 1}`));
    const rows = Array.from({ length: 18_000 }, (_, index) =>
      collectionRecord(`collection-${index + 1}`, itemIds[index % itemIds.length] ?? 1, {
        orderKey: `order-${(index % 2000) + 1}`,
      }),
    );

    const startedAt = performance.now();
    const started = await startRun(archiveOf(orders, rows));
    const elapsedMs = performance.now() - startedAt;

    console.info(`20,000-record import applied in ${Math.round(elapsedMs)} ms`);
    expect(started).toMatchObject({
      status: "completed",
      importedOrders: 2000,
      importedCollectionItems: 18_000,
    });
    expect(elapsedMs).toBeLessThan(20_000);
  }, 60_000);
});

test("scraped payloads are cleared while failed rows remain available for retry", async () => {
  const run = await startRun(archiveOf([], [collectionRecord("c1", 1), collectionRecord("c2", 2)]));
  await complete(run.id, 1);
  await fail(run.id, 2);
  const waiting = await db
    .select()
    .from(dataTransferImportItem)
    .orderBy(asc(dataTransferImportItem.itemExternalId));
  expect(waiting[0]?.rows).toEqual([]);
  expect(waiting[1]?.rows).toHaveLength(1);
  const retried = await retryRun();
  await complete(retried.id, 2);
  const cleared = await db.select().from(dataTransferImportItem);
  expect(cleared.every((row) => row.rows.length === 0)).toBe(true);
  const [finished] = await db.select().from(dataTransferImport);
  expect(finished?.archive).toBeNull();
});

for (const outcome of ["complete", "fail"] as const) {
  test(`${outcome} uploads renew the import lease`, async () => {
    const run = await startRun(
      archiveOf([], [collectionRecord("c1", 1), collectionRecord("c2", 2)]),
    );
    const before = new Date(Date.now() - 110_000);
    await db
      .update(dataTransferImport)
      .set({ heartbeatAt: before })
      .where(eq(dataTransferImport.userId, userId));
    if (outcome === "complete") await complete(run.id, 1);
    else await fail(run.id, 1);
    const [row] = await db.select().from(dataTransferImport);
    expect(row?.heartbeatAt?.getTime()).toBeGreaterThan(before.getTime() + 100_000);
  });
}

test("retrying a worker-written partial import uses the worker ids without duplicating rows", async () => {
  const firstId = await seedItem(1);
  const archive = archiveOf(
    [orderRecord("order-1")],
    [collectionRecord("c1", 1, { orderKey: "order-1" }), collectionRecord("c2", 2)],
  );
  const { createImportId } = await import("./import-plan");
  const run = { userId, importId: "worker-partial" };
  const orderId = createImportId({ ...run, kind: "order", localKey: "order-1" });
  const collectionId = createImportId({ ...run, kind: "collection", localKey: "c1" });
  await db.insert(order).values({ id: orderId, userId, title: "Worker order" });
  await db.insert(collection).values({ id: collectionId, userId, itemId: firstId, orderId });
  await db.insert(dataTransferImport).values({
    ...run,
    jobId: "worker-partial",
    fileName: "export.json",
    archive,
    status: "partial",
    phase: "completed",
    importedOrders: 1,
    importedCollectionItems: 1,
    failedCollectionItems: 1,
    totalCollectionItems: 2,
  });
  const retried = await retryRun();
  expect(retried).toMatchObject({
    status: "running",
    importedOrders: 1,
    importedCollectionItems: 1,
    missingMfcItemIds: [2],
  });
  expect(await db.$count(order)).toBe(1);
  expect(await db.$count(collection)).toBe(1);
  await complete(retried.id, 2);
  expect(await currentImport()).toMatchObject({ status: "completed", importedCollectionItems: 2 });
  expect(await db.$count(collection)).toBe(2);
});

test("status reads stay in one snapshot when a retry commits between reads", async () => {
  const run = await startRun(archiveOf([], [collectionRecord("c1", 1)]));
  await fail(run.id, 1);
  const held = Promise.withResolvers<null>();
  const proceed = Promise.withResolvers<null>();
  const retrying = db.transaction(async (tx) => {
    await tx.execute("LOCK TABLE data_transfer_import_item IN ACCESS EXCLUSIVE MODE");
    await tx
      .update(dataTransferImport)
      .set({
        jobId: "retry-after-read",
        status: "running",
        phase: "preparing_items",
        heartbeatAt: new Date(),
      })
      .where(eq(dataTransferImport.userId, userId));
    await tx
      .update(dataTransferImportItem)
      .set({ status: "pending", errorReason: null })
      .where(eq(dataTransferImportItem.userId, userId));
    held.resolve(null);
    await proceed.promise;
  });
  await held.promise;
  const { readView, toImport } = await import("./import-state");
  const reading = readView(db, userId, new Date());
  try {
    const deadline = Date.now() + 2000;
    for (;;) {
      const [waiting] = await db.execute<{ count: number }>(
        "SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'",
      );
      if (waiting?.count) break;
      if (Date.now() > deadline) throw new Error("status did not reach waiting-items read");
      await Bun.sleep(10);
    }
    proceed.resolve(null);
    await retrying;
    const view = await reading;
    if (!view) throw new Error("missing import");
    const expected =
      view.row.jobId === run.id
        ? { id: run.id, status: "failed", failedCollectionItems: 1 }
        : { id: "retry-after-read", status: "running", failedCollectionItems: 0 };
    expect(toImport(view)).toMatchObject(expected);
  } finally {
    proceed.resolve(null);
    await retrying;
  }
});

test("a lost worker-era import lapses just past 24 hours and retries its archive", async () => {
  const archive = archiveOf([], [collectionRecord("lost", 98_777)]);
  await db.insert(dataTransferImport).values({
    userId,
    importId: "lost-worker",
    jobId: "lost-worker",
    fileName: "export.json",
    archive,
    status: "running",
    phase: "preparing_items",
    totalCollectionItems: 1,
    updatedAt: new Date(Date.now() - 24 * 60 * 60 * 1000 - 1000),
  });
  expect(await currentImport()).toMatchObject({
    status: "failed",
    error: "The import was interrupted. Try again to continue.",
  });
  const retried = await post("/imports/current/retry");
  expect(retried.status).toBe(200);
  const run = dataTransferImportSchema
    .extend({ missingMfcItemIds: z.array(z.number()) })
    .parse(retried.body);
  expect(run.id).not.toBe("lost-worker");
  expect(await complete(run.id, 98_777)).toMatchObject({
    status: 200,
    body: { status: "completed", importedCollectionItems: 1 },
  });
});

test("an S3 preparation timeout records a retryable import item failure", async () => {
  const run = await startRun(archiveOf([], [collectionRecord("c1", 98_777)]));
  failS3 = true;
  try {
    const response = await complete(run.id, 98_777);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      status: "failed",
      failedCollectionItems: 1,
      report: {
        failureReasons: [{ reason: "Persistence failed while saving scraped items", count: 1 }],
      },
    });
    expect(
      await db.select({ status: dataTransferImportItem.status }).from(dataTransferImportItem),
    ).toEqual([{ status: "failed" }]);
  } finally {
    failS3 = false;
  }
  const retried = await post("/imports/current/retry");
  const retry = dataTransferImportSchema
    .extend({ missingMfcItemIds: z.array(z.number()) })
    .parse(retried.body);
  expect(await complete(retry.id, 98_777)).toMatchObject({
    status: 200,
    body: { status: "completed" },
  });
});

test("import polling keeps its last status through a database blip and retries", async () => {
  await startRun(archiveOf([], [collectionRecord("c1", 98_777)]));
  const { default: service } = await import("./service");
  const original = service.getImportJobStatus;
  let failRead = false;
  const read = spyOn(service, "getImportJobStatus").mockImplementation(async (id) => {
    if (failRead) {
      failRead = false;
      throw new Error("Postgres temporarily unavailable");
    }
    return original(id);
  });
  const clock = spyOn(Date, "now");
  const abort = new AbortController();
  const response = await app.handle(
    new Request("http://localhost/api/data-transfer/imports/current/status", {
      headers,
      signal: abort.signal,
    }),
  );
  const reader = response.body?.getReader();
  try {
    if (!reader) throw new Error("no stream");
    const readStatus = async () => {
      const chunk = await reader?.read();
      if (!chunk || chunk.done) throw new Error("stream ended");
      const text = await new Response(chunk.value).text();
      const raw =
        text
          .split("\n")
          .find((line) => line.startsWith("data:"))
          ?.slice(5) ?? "";
      const result = parseJson(syncJobStatusSchema, raw);
      if (result.error) throw result.error;
      return result.data;
    };
    const initial = await readStatus();
    await Bun.sleep(20);
    const reads = read.mock.calls.length;
    expect(reads).toBe(2);
    expect(await readStatus()).toEqual(initial);
    expect(read.mock.calls.length).toBe(reads);
    const now = Date.now();
    clock.mockReturnValue(now + 31_000);
    failRead = true;
    expect(await readStatus()).toEqual(initial);
    expect(failRead).toBe(false);
    clock.mockReturnValue(now + 62_000);
    expect(await readStatus()).toMatchObject({ terminalState: null });
    expect(read.mock.calls.length).toBe(reads + 2);
  } finally {
    clock.mockRestore();
    read.mockRestore();
    abort.abort();
    await reader?.cancel();
  }
}, 25_000);
