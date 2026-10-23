import { beforeEach, describe, expect, mock, test } from "bun:test";
import { Elysia } from "elysia";
import { initLogger } from "evlog";
import path from "node:path";
import { asc, eq } from "drizzle-orm";
import * as z from "zod";
import type { PutObjectCommand } from "@aws-sdk/client-s3";
import * as authSchema from "@myakiba/db/schema/auth";
import {
  collection,
  entry,
  entry_to_item,
  item,
  item_release,
  order,
} from "@myakiba/db/schema/figure";
import { mfcItemId } from "@myakiba/mfc/page";
import { mfcReleaseId } from "@myakiba/mfc/parse";
import type { MfcItemId } from "@myakiba/mfc/page";
import { createTestDatabase } from "../../../test/database";
import { createItemImages } from "@/lib/item-images";

initLogger({ enabled: false });

const userId = "user-1";
const redisKeys = new Map<string, { readonly value: string; readonly expiresAt: number }>();
const liveKey = (key: string) => {
  const stored = redisKeys.get(key);
  return stored !== undefined && stored.expiresAt > Date.now() ? stored : undefined;
};

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

const rateLimited: string[] = [];
let resyncsThisHour = 1;
let redisLost = false;
let loseRedis: "at the cooldown write" | "after the cooldown write" | null = null;
let dropTransactionAtCooldown = false;
const reachRedis = () => {
  if (redisLost) throw new Error("Connection is closed.");
};
const isCooldown = (key: string) => key.startsWith("item-resync:cooldown:");

await mock.module("@myakiba/redis/client", () => ({
  redis: {
    eval: async (_script: string, _keys: number, key: string) => {
      reachRedis();
      rateLimited.push(key);
      return [key.startsWith("rl:item-resync:") ? resyncsThisHour : 1, 3600];
    },
    set: async (key: string, value: string, _mode: "EX", seconds: number) => {
      if (isCooldown(key) && loseRedis === "at the cooldown write") redisLost = true;
      reachRedis();
      redisKeys.set(key, { value, expiresAt: Date.now() + seconds * 1000 });
      if (isCooldown(key) && loseRedis === "after the cooldown write") redisLost = true;
      if (isCooldown(key) && dropTransactionAtCooldown) await dropOpenTransaction();
      return "OK";
    },
    get: async (key: string) => {
      reachRedis();
      return liveKey(key)?.value ?? null;
    },
    ttl: async (key: string) => {
      reachRedis();
      const stored = liveKey(key);
      return stored === undefined ? -2 : Math.ceil((stored.expiresAt - Date.now()) / 1000);
    },
    exists: async (key: string) => {
      reachRedis();
      return liveKey(key) === undefined ? 0 : 1;
    },
    del: async (key: string) => {
      reachRedis();
      return redisKeys.delete(key) ? 1 : 0;
    },
  },
}));

await mock.module("@/lib/item-images", () => ({
  createItemImages,
  itemImages: { store: (id: MfcItemId, picture: Blob) => store.images.store(id, picture) },
}));

const db = await createTestDatabase();

async function dropOpenTransaction() {
  const dropped = await db.execute<{ pid: number }>(
    "SELECT pid FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid() AND state = 'idle in transaction' AND pg_terminate_backend(pid)",
  );
  if (dropped.length !== 1) throw new Error(`dropped ${dropped.length} transactions`);
}

// Bun's pool can hand out the dropped connection once more before it notices the close.
async function poolRecovered() {
  const deadline = Date.now() + 2000;
  for (;;) {
    try {
      await db.execute("SELECT 1");
      return;
    } catch (error) {
      if (Date.now() > deadline) throw error;
    }
  }
}
const { default: itemRouter } = await import("./index");
const { default: mfcItemsRouter } = await import("../mfc-items/index");
const app = new Elysia({ prefix: "/api" }).use(itemRouter).use(mfcItemsRouter);

const fixtures = path.join(import.meta.dir, "../../../../../packages/mfc/fixtures");
const fixture = (name: string) => Bun.file(path.join(fixtures, name)).text();

function edit(html: string, from: string, to: string): string {
  if (!html.includes(from)) throw new Error(`fixture has no ${from}`);
  return html.replaceAll(from, to);
}

const page98777 = await fixture("item-98777.html");
const RETITLED = "Hello, Good-bye - Yukishiro May - 1/7 (Orchid Seed) Re-release";
const derivedRetitledPage = edit(page98777, "(Orchid Seed)</h1>", "(Orchid Seed) Re-release</h1>");
const derivedRescheduledPage = edit(
  edit(derivedRetitledPage, ">11/15/2018<", ">12/20/2018<"),
  "13,500 <small>JPY",
  "14,800 <small>JPY",
);
const limitedRelease = (date: string, price: string) =>
  `<div class="data-field"><div class="data-value"><a href="/?_tb=item" class="time">${date}</a> <small class="light">as <em>Limited (Japan)</em></small><br/>${price} <small>JPY</small> &bull; 4582292609999</div></div>`;
const materials = '<div class="data-field"><div class="data-label">Materials<';
const derivedTwoReleasesPage = edit(
  page98777,
  materials,
  limitedRelease("03/20/2019", "16,000") + materials,
);
const derivedTwoRepricedPage = edit(
  edit(derivedTwoReleasesPage, "13,500 <small>JPY", "13,800 <small>JPY"),
  ">16,000 <small>JPY",
  ">16,500 <small>JPY",
);

const RELEASE_98777 = {
  date: "2018-11-15",
  type: "Standard (Japan)",
  price: 1_350_000,
  priceCurrency: "JPY",
  barcode: "4582292601715",
};
const RESCHEDULED_98777 = { ...RELEASE_98777, date: "2018-12-20", price: 1_480_000 };
const REPRICED_98777 = { ...RELEASE_98777, price: 1_380_000 };
const REPRICED_LIMITED_98777 = {
  date: "2019-03-20",
  type: "Limited (Japan)",
  price: 1_650_000,
  priceCurrency: "JPY",
  barcode: "4582292609999",
};

const ID_98777 = mfcItemId(98_777);
if (ID_98777 === null) throw new Error("98777 is an MFC item id");

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
const NOT_AN_IMAGE = new TextEncoder().encode("not a picture");
const RECENTLY_REFRESHED = { status: 429, body: "Item details were recently refreshed" };

function memoryStore() {
  const objects = new Map<string, PutObjectCommand["input"]>();
  let gate: (() => Promise<null>) | null = null;
  const images = createItemImages({
    client: {
      send: async (command) => {
        await gate?.();
        objects.set(command.input.Key ?? "", command.input);
        return { $metadata: { httpStatusCode: 200 } };
      },
    },
    name: "pictures",
    publicUrl: "https://pictures.example.test",
  });
  const holdPut = () => {
    const arrived = Promise.withResolvers<null>();
    const release = Promise.withResolvers<null>();
    gate = () => {
      arrived.resolve(null);
      return release.promise;
    };
    return { arrived: arrived.promise, release: () => release.resolve(null) };
  };
  const failPut = () => {
    gate = () => Promise.reject(new Error("bucket unreachable"));
  };
  return { images, objects, holdPut, failPut };
}

let store = memoryStore();

beforeEach(async () => {
  await db.execute('TRUNCATE "user", item, entry CASCADE');
  await db
    .insert(authSchema.user)
    .values({ id: userId, name: "Ryan", email: "r@example.com", username: "ryan" });
  store = memoryStore();
  redisKeys.clear();
  rateLimited.length = 0;
  resyncsThisHour = 1;
  redisLost = false;
  loseRedis = null;
  dropTransactionAtCooldown = false;
});

async function answer(response: Response) {
  const json = response.headers.get("content-type")?.includes("json");
  return { status: response.status, body: json ? await response.json() : await response.text() };
}

function pageForm(page: string, picture?: Uint8Array) {
  const form = new FormData();
  form.set("page", new File([page], "page.html", { type: "text/html" }));
  if (picture) form.set("picture", new File([picture], "picture", { type: "image/png" }));
  return form;
}

async function upload(page: string, picture?: Uint8Array) {
  const form = pageForm(page, picture);
  form.set("mfcItemId", "98777");
  const response = await app.handle(
    new Request("http://localhost/api/mfc-items", {
      method: "POST",
      headers: { "x-test-user": userId },
      body: form,
    }),
  );
  const { body } = await answer(response);
  return z.object({ itemId: z.string() }).parse(body).itemId;
}

async function resync(page: string, picture?: Uint8Array, externalId = 98_777) {
  const response = await app.handle(
    new Request(`http://localhost/api/item/${externalId}/resync`, {
      method: "POST",
      headers: { "x-test-user": userId },
      body: pageForm(page, picture),
    }),
  );
  return answer(response);
}

async function resyncStatus(externalId = 98_777) {
  const response = await app.handle(
    new Request(`http://localhost/api/item/${externalId}/resync-status`, {
      headers: { "x-test-user": userId },
    }),
  );
  return answer(response);
}

const IDLE = { status: 200, body: { status: "idle", cooldownExpiresAt: null } };

const refreshed = (saved: "refreshed" | "unchanged") => ({
  status: 200,
  body: { status: "cooldown", cooldownExpiresAt: expect.any(String), saved },
});

async function itemRows() {
  const [row] = await db
    .select({ title: item.title, image: item.image, updatedAt: item.updatedAt })
    .from(item)
    .where(eq(item.externalId, 98_777));
  const links = await db
    .select({ entry: entry.externalId, roles: entry_to_item.roles })
    .from(entry_to_item)
    .innerJoin(entry, eq(entry.id, entry_to_item.entryId))
    .orderBy(asc(entry.externalId));
  const releases = await db
    .select({
      id: item_release.id,
      date: item_release.date,
      type: item_release.type,
      price: item_release.price,
      priceCurrency: item_release.priceCurrency,
      barcode: item_release.barcode,
    })
    .from(item_release)
    .orderBy(asc(item_release.date));
  return { item: row, links, releases };
}

async function collectEveryRelease(itemId: string, releaseDate: string) {
  const [placed] = await db
    .insert(order)
    .values({ userId, title: "Preorder", releaseDate })
    .returning({ id: order.id });
  if (!placed) throw new Error("order was not saved");
  const releases = await db
    .select({ id: item_release.id })
    .from(item_release)
    .where(eq(item_release.itemId, itemId))
    .orderBy(asc(item_release.date));
  await db
    .insert(collection)
    .values(
      releases.map((release) => ({ userId, itemId, orderId: placed.id, releaseId: release.id })),
    );
  return placed.id;
}

async function selectedReleases() {
  const rows = await db.select({ releaseId: collection.releaseId }).from(collection);
  return rows.map((row) => row.releaseId);
}

async function orderReleaseDate(orderId: string) {
  const [row] = await db
    .select({ releaseDate: order.releaseDate })
    .from(order)
    .where(eq(order.id, orderId));
  return row?.releaseDate;
}

async function requestsWaitingOnLocks(expected: number) {
  const deadline = Date.now() + 2000;
  for (;;) {
    const [waiting] = await db.execute<{ count: number }>(
      "SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'",
    );
    if (waiting?.count === expected) return;
    if (Date.now() > deadline) throw new Error(`${waiting?.count} requests wait on locks`);
    await Bun.sleep(10);
  }
}

describe("POST /api/item/:id/resync refreshes the item from the page the extension fetched", () => {
  test("a new title and one rescheduled release remap the selection and advance the order", async () => {
    const itemId = await upload(page98777, JPEG);
    const orderId = await collectEveryRelease(itemId, "2018-11-15");
    const { item: imported } = await itemRows();

    expect(await resync(derivedRescheduledPage)).toEqual(refreshed("refreshed"));

    const rows = await itemRows();
    expect(rows.item).toMatchObject({ title: RETITLED, image: imported?.image });
    expect(rows.links).toHaveLength(7);
    const rescheduled = mfcReleaseId(ID_98777, RESCHEDULED_98777);
    expect(rows.releases).toEqual([{ id: rescheduled, ...RESCHEDULED_98777 }]);
    expect(await selectedReleases()).toEqual([rescheduled]);
    expect(await orderReleaseDate(orderId)).toBe("2018-12-20");
  });

  test("two repriced releases clear both selections and leave only the new releases", async () => {
    const itemId = await upload(derivedTwoReleasesPage);
    await collectEveryRelease(itemId, "2019-03-20");
    expect(await selectedReleases()).toHaveLength(2);

    expect(await resync(derivedTwoRepricedPage)).toEqual(refreshed("refreshed"));

    expect(await selectedReleases()).toEqual([null, null]);
    const { releases } = await itemRows();
    expect(releases).toEqual([
      { id: mfcReleaseId(ID_98777, REPRICED_98777), ...REPRICED_98777 },
      { id: mfcReleaseId(ID_98777, REPRICED_LIMITED_98777), ...REPRICED_LIMITED_98777 },
    ]);
  });

  test("a material share finer than the stored 2 decimals reads unchanged on the next refresh", async () => {
    const thirds = edit(
      page98777,
      '<span switch="塩ビ">PVC</span></a></div>',
      '<span switch="塩ビ">PVC</span></a> <small class="light">33.333%</small></div>',
    );
    await upload(thirds);
    const before = await itemRows();

    expect(await resync(thirds)).toEqual(refreshed("unchanged"));

    expect(await itemRows()).toEqual(before);
  });

  test.each(["1.005", "33.335", "0.0000001"])(
    "a material share of %s percent rounds as Postgres after import",
    async (percentage) => {
      const page = edit(
        page98777,
        '<span switch="塩ビ">PVC</span></a></div>',
        `<span switch="塩ビ">PVC</span></a> <small class="light">${percentage}%</small></div>`,
      );
      await upload(page);
      expect(await resync(page)).toEqual(refreshed("unchanged"));
    },
  );

  test("a stored 1.00 share changes when the page shows 1.005 percent", async () => {
    const page = edit(
      page98777,
      '<span switch="塩ビ">PVC</span></a></div>',
      '<span switch="塩ビ">PVC</span></a> <small class="light">1.005%</small></div>',
    );
    await upload(page);
    const reset = await db
      .update(entry_to_item)
      .set({ materialPercentage: 1 })
      .where(eq(entry_to_item.materialPercentage, 1.01))
      .returning({ materialPercentage: entry_to_item.materialPercentage });
    expect(reset).toEqual([{ materialPercentage: 1 }, { materialPercentage: 1 }]);
    expect(await resync(page)).toEqual(refreshed("refreshed"));
  });

  test("the page as it is stored answers unchanged, writes nothing and still starts the cooldown", async () => {
    await upload(page98777, JPEG);
    const before = await itemRows();

    expect(await resync(page98777, JPEG)).toEqual(refreshed("unchanged"));

    expect(await itemRows()).toEqual(before);
    expect(await resyncStatus()).toMatchObject({ body: { status: "cooldown" } });
  });

  test("a challenge page answers 400, leaves the item as it was and starts no cooldown", async () => {
    await upload(page98777);
    const before = await itemRows();

    expect(await resync(await fixture("derived-challenge.html"))).toEqual({
      status: 400,
      body: "MyFigureCollection showed a security check instead of the item",
    });

    expect(await itemRows()).toEqual(before);
    expect(await resyncStatus()).toEqual(IDLE);
  });

  test("an item that was never imported answers 404 on both routes and stores nothing", async () => {
    const notFound = { status: 404, body: "Item not found" };
    expect(await resync(page98777, JPEG)).toEqual(notFound);
    expect(await resyncStatus()).toEqual(notFound);
    expect(store.objects.size).toBe(0);
  });
});

describe("the 3-day cooldown and resync-status", () => {
  test("a resync inside the cooldown is refused with the old message and status reports it", async () => {
    await upload(page98777);
    expect(await resyncStatus()).toEqual(IDLE);

    expect(await resync(derivedRetitledPage)).toEqual(refreshed("refreshed"));
    expect(await resync(derivedRescheduledPage)).toEqual(RECENTLY_REFRESHED);

    const { body } = await resyncStatus();
    const { cooldownExpiresAt } = z
      .object({ status: z.literal("cooldown"), cooldownExpiresAt: z.iso.datetime() })
      .parse(body);
    const threeDays = 3 * 24 * 60 * 60 * 1000;
    expect(Math.abs(Date.parse(cooldownExpiresAt) - Date.now() - threeDays)).toBeLessThan(5000);
    const { item: row } = await itemRows();
    expect(row?.title).toBe(RETITLED);
  });

  test("status reads idle while a posted page is being written, then cooldown", async () => {
    await upload(page98777);
    const put = store.holdPut();

    const pending = resync(derivedRetitledPage, JPEG);
    await put.arrived;
    expect(await resyncStatus()).toEqual(IDLE);
    put.release();

    expect(await pending).toEqual(refreshed("refreshed"));
    expect(await resyncStatus()).toMatchObject({ body: { status: "cooldown" } });
  });

  test("two concurrent resyncs of one item run one after the other and only one refreshes", async () => {
    const itemId = await upload(page98777);
    await collectEveryRelease(itemId, "2018-11-15");

    const answers = await db.transaction(async (tx) => {
      await tx.select({ id: item.id }).from(item).where(eq(item.id, itemId)).for("update");
      const both = Promise.all([resync(derivedRescheduledPage), resync(derivedRetitledPage)]);
      await requestsWaitingOnLocks(2);
      return { both };
    });

    const replies = await answers.both;
    expect(replies.map((reply) => reply.status).toSorted((a, b) => a - b)).toEqual([200, 429]);
    const { item: row, links, releases } = await itemRows();
    expect(row?.title).toBe(RETITLED);
    expect(links).toHaveLength(7);
    expect(releases).toHaveLength(1);
    expect(await selectedReleases()).toEqual(releases.map((release) => release.id));
  });
});

describe("a resync that fails part way leaves no cooldown and no refresh", () => {
  test("a picture store that throws answers 500 and status reads idle", async () => {
    await upload(page98777);
    const before = await itemRows();
    store.failPut();

    expect(await resync(derivedRetitledPage, PNG)).toEqual({
      status: 500,
      body: "Failed to request item refresh",
    });

    expect(await itemRows()).toEqual(before);
    expect(await resyncStatus()).toEqual(IDLE);
  });

  test("Redis lost at the cooldown write rolls the refresh back, and a retry refreshes", async () => {
    await upload(page98777);
    const before = await itemRows();
    loseRedis = "at the cooldown write";

    expect(await resync(derivedRetitledPage)).toMatchObject({ status: 500 });

    redisLost = false;
    loseRedis = null;
    expect(await itemRows()).toEqual(before);
    expect(await resyncStatus()).toEqual(IDLE);
    expect(await resync(derivedRetitledPage)).toEqual(refreshed("refreshed"));
  });

  test("Redis lost right after the cooldown write still commits the refresh the cooldown names", async () => {
    await upload(page98777);
    loseRedis = "after the cooldown write";

    expect(await resync(derivedRetitledPage)).toEqual(refreshed("refreshed"));

    redisLost = false;
    loseRedis = null;
    const { item: row } = await itemRows();
    expect(row?.title).toBe(RETITLED);
    expect(await resyncStatus()).toMatchObject({ body: { status: "cooldown" } });
  });

  test("a commit that fails after the cooldown write answers 500, keeps no cooldown, and a retry refreshes", async () => {
    await upload(page98777);
    const before = await itemRows();
    dropTransactionAtCooldown = true;

    expect(await resync(derivedRetitledPage)).toEqual({
      status: 500,
      body: "Failed to request item refresh",
    });

    dropTransactionAtCooldown = false;
    await poolRecovered();
    expect(await itemRows()).toEqual(before);
    expect(await resyncStatus()).toEqual(IDLE);
    expect(await resync(derivedRetitledPage)).toEqual(refreshed("refreshed"));
  });
});

describe("the per-user resync rate limit", () => {
  test("the 61st resync in an hour answers 429 and refreshes nothing", async () => {
    await upload(page98777);
    const before = await itemRows();
    resyncsThisHour = 61;

    const refused = await resync(derivedRetitledPage);

    expect(refused.status).toBe(429);
    expect(refused.body).toStartWith("Rate limit exceeded");
    expect(rateLimited).toContain(`rl:item-resync:${userId}`);
    expect(await itemRows()).toEqual(before);
    expect(await resyncStatus()).toEqual(IDLE);
  });
});

describe("the posted picture", () => {
  test("a different picture replaces the item's image", async () => {
    await upload(page98777, JPEG);
    const { item: imported } = await itemRows();

    expect(await resync(page98777, PNG)).toEqual(refreshed("refreshed"));

    const { item: row } = await itemRows();
    expect(row?.image).toEndWith(".png");
    expect(row?.image).not.toBe(imported?.image);
    expect(store.objects.size).toBe(2);
  });

  test("a rejected picture keeps the old image", async () => {
    await upload(page98777, JPEG);
    const { item: imported } = await itemRows();

    expect(await resync(derivedRetitledPage, NOT_AN_IMAGE)).toEqual(refreshed("refreshed"));

    const { item: row } = await itemRows();
    expect(row).toMatchObject({ title: RETITLED, image: imported?.image });
  });

  test("no picture keeps the old image, where the worker wrote whatever it scraped", async () => {
    await upload(page98777, JPEG);
    const { item: imported } = await itemRows();

    expect(await resync(derivedRetitledPage)).toEqual(refreshed("refreshed"));

    const { item: row } = await itemRows();
    expect(row).toMatchObject({ title: RETITLED, image: imported?.image });
  });
});

async function storedVersion(itemId: string) {
  const [row] = await db.select({ version: item.version }).from(item).where(eq(item.id, itemId));
  return row?.version;
}

describe("pages the refresh refuses or rewrites", () => {
  test("a page for a different item answers 400 and starts no cooldown", async () => {
    await db.insert(item).values({ source: "mfc", externalId: 12_345, title: "Another item" });

    expect(await resync(page98777, JPEG, 12_345)).toEqual({
      status: 400,
      body: "The page is for a different item",
    });

    const [other] = await db
      .select({ title: item.title, image: item.image })
      .from(item)
      .where(eq(item.externalId, 12_345));
    expect(other).toEqual({ title: "Another item", image: null });
    expect(await resyncStatus(12_345)).toEqual(IDLE);
    expect(store.objects.size).toBe(0);
  });

  test("a legacy scraper row reads as changed, is rewritten, and then reads unchanged", async () => {
    const itemId = await upload(page98777);
    const imported = await itemRows();
    const version = await storedVersion(itemId);
    expect(imported.links.some((link) => link.roles.length > 0)).toBe(true);
    expect(version).not.toBeNull();
    await db.update(item).set({ version: null }).where(eq(item.id, itemId));
    await db.execute(
      "UPDATE entry_to_item SET roles = '{}', role = COALESCE(roles[1], '') WHERE roles <> '{}'",
    );

    expect(await resync(page98777)).toEqual(refreshed("refreshed"));

    const rewritten = await itemRows();
    expect(rewritten.links).toEqual(imported.links);
    expect(await storedVersion(itemId)).toEqual(version);

    redisKeys.clear();
    expect(await resync(page98777)).toEqual(refreshed("unchanged"));
  });
});
