import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { Elysia } from "elysia";
import { initLogger } from "evlog";
import Redis from "ioredis";
import path from "node:path";
import { asc, eq, sql } from "drizzle-orm";
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
import { createTestDatabase } from "../../../test/database";
import { EMAIL_VERIFICATION_REQUIRED } from "@myakiba/contracts/shared/messages";

initLogger({ enabled: false });

const redisUrl = process.env.TEST_REDIS_URL;
if (!redisUrl) throw new Error("TEST_REDIS_URL is required for the Item Refresh tests");
const redis = new Redis(redisUrl);
await mock.module("@myakiba/redis/client", () => ({ redis }));

const userId = `user-${crypto.randomUUID()}`;
const unverifiedUserId = `unverified-${crypto.randomUUID()}`;
const rateLimitKeys = [`rl:item-resync:${userId}`, `rl:mfc-ingest:${userId}`];

afterAll(async () => {
  await redis.del(...rateLimitKeys);
  redis.disconnect();
});

await mock.module("@myakiba/auth/server", () => ({
  auth: {
    handler: () => new Response(null, { status: 404 }),
    api: {
      getSession: async ({ headers }: { headers: Headers }) => {
        const id = headers.get("x-test-user");
        if (!id) return null;
        const emailVerified = id !== unverifiedUserId;
        return { user: { id, emailVerified }, session: { id: `session-${id}` } };
      },
    },
  },
}));

const realS3 = await import("@aws-sdk/client-s3");
await mock.module("@aws-sdk/client-s3", () => ({
  ...realS3,
  S3Client: class {
    send(command: PutObjectCommand) {
      return store.send(command);
    }
  },
}));

const db = await createTestDatabase();

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
const standardRelease =
  '<div class="data-field"><div class="data-value"><a href="/?_tb=item" class="time">11/15/2018</a> <small class="light">as <em>Standard (Japan)</em></small><br/>13,500 <small>JPY</small> &bull; 4582292601715</div></div>';
const derivedRepeatedReleasePage = edit(page98777, materials, `${standardRelease}${materials}`);
const sameBarcodeLimitedRelease = limitedRelease("03/20/2019", "16,000").replace(
  "4582292609999",
  "4582292601715",
);
const derivedStandardThenLimitedPage = edit(
  page98777,
  materials,
  sameBarcodeLimitedRelease + materials,
);
const derivedLimitedThenStandardPage = edit(
  edit(
    edit(edit(page98777, ">11/15/2018<", ">03/20/2019<"), "Standard (Japan)", "Limited (Japan)"),
    "13,500 <small>JPY",
    "16,000 <small>JPY",
  ),
  materials,
  standardRelease + materials,
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

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
const NOT_AN_IMAGE = new TextEncoder().encode("not a picture");

function memoryStore() {
  const objects = new Map<string, PutObjectCommand["input"]>();
  let gate: (() => Promise<null>) | null = null;
  let puts = 0;
  const send = async (command: PutObjectCommand) => {
    await gate?.();
    puts += 1;
    objects.set(command.input.Key ?? "", command.input);
    return { $metadata: { httpStatusCode: 200 } };
  };
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
  return { send, objects, puts: () => puts, holdPut, failPut };
}

let store = memoryStore();

beforeEach(async () => {
  await db.execute('TRUNCATE "user", item, entry CASCADE');
  await db
    .insert(authSchema.user)
    .values({ id: userId, name: "Ryan", email: "r@example.com", username: "ryan" });
  store = memoryStore();
  await redis.del(...rateLimitKeys);
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

async function resync(page: string, picture?: Uint8Array, externalId = 98_777, as = userId) {
  const response = await app.handle(
    new Request(`http://localhost/api/item/${externalId}/resync`, {
      method: "POST",
      headers: { "x-test-user": as },
      body: pageForm(page, picture),
    }),
  );
  return answer(response);
}

const refreshed = (saved: "refreshed" | "unchanged") => ({ status: 200, body: { saved } });

async function itemRows() {
  const [row] = await db
    .select({
      title: item.title,
      image: item.image,
      imageKey: item.imageKey,
      updatedAt: item.updatedAt,
    })
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

    expect(await resync(derivedRescheduledPage)).toMatchObject(refreshed("refreshed"));

    const rows = await itemRows();
    expect(rows.item).toMatchObject({ title: RETITLED, image: imported?.image });
    expect(rows.links).toHaveLength(7);
    expect(rows.releases).toEqual([{ id: expect.any(String), ...RESCHEDULED_98777 }]);
    expect(await selectedReleases()).toEqual(rows.releases.map((release) => release.id));
    expect(await orderReleaseDate(orderId)).toBe("2018-12-20");
  });

  test("two repriced releases clear both selections and leave only the new releases", async () => {
    const itemId = await upload(derivedTwoReleasesPage);
    await collectEveryRelease(itemId, "2019-03-20");
    expect(await selectedReleases()).toHaveLength(2);

    expect(await resync(derivedTwoRepricedPage)).toMatchObject(refreshed("refreshed"));

    expect(await selectedReleases()).toEqual([null, null]);
    const { releases } = await itemRows();
    expect(releases).toEqual([
      { id: expect.any(String), ...REPRICED_98777 },
      { id: expect.any(String), ...REPRICED_LIMITED_98777 },
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

    expect(await resync(thirds)).toMatchObject(refreshed("unchanged"));

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
      expect(await resync(page)).toMatchObject(refreshed("unchanged"));
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
    expect(await resync(page)).toMatchObject(refreshed("refreshed"));
  });

  test("the page as it is stored answers unchanged and writes nothing", async () => {
    await upload(page98777, JPEG);
    const before = await itemRows();

    expect(await resync(page98777, JPEG)).toMatchObject(refreshed("unchanged"));

    expect(await itemRows()).toEqual(before);
  });

  test("an Item whose release ids are not derived from its page refreshes that page as unchanged and keeps every selection", async () => {
    const itemId = await upload(derivedTwoReleasesPage);
    await db.update(item_release).set({ id: sql`gen_random_uuid()` });
    const orderId = await collectEveryRelease(itemId, "2019-03-20");
    const before = await itemRows();
    const selected = await selectedReleases();

    expect(await resync(derivedTwoReleasesPage)).toMatchObject(refreshed("unchanged"));

    expect(await itemRows()).toEqual(before);
    expect(await selectedReleases()).toEqual(selected);
    expect(await orderReleaseDate(orderId)).toBe("2019-03-20");
  });

  test("a page that lists one release twice stores it once and refreshes as unchanged", async () => {
    const itemId = await upload(derivedRepeatedReleasePage);
    await collectEveryRelease(itemId, "2018-11-15");
    const before = await itemRows();
    expect(before.releases).toEqual([{ id: expect.any(String), ...RELEASE_98777 }]);

    expect(await resync(derivedRepeatedReleasePage)).toMatchObject(refreshed("unchanged"));

    expect(await itemRows()).toEqual(before);
    expect(await selectedReleases()).toEqual(before.releases.map((release) => release.id));
  });

  test("a page that lists the stored releases in another order refreshes as unchanged", async () => {
    await upload(derivedStandardThenLimitedPage);
    const before = await itemRows();
    expect(before.releases).toHaveLength(2);

    expect(await resync(derivedLimitedThenStandardPage)).toMatchObject(refreshed("unchanged"));

    expect(await itemRows()).toEqual(before);
  });

  test("a challenge page answers 400 and leaves the item as it was", async () => {
    await upload(page98777);
    const before = await itemRows();

    expect(await resync(await fixture("derived-challenge.html"))).toEqual({
      status: 400,
      body: "MyFigureCollection showed a security check instead of the item",
    });

    expect(await itemRows()).toEqual(before);
  });

  test("a page whose picture SFW mode hides answers 400 and leaves the item as it was", async () => {
    await upload(page98777, JPEG);
    const before = await itemRows();

    expect(
      await resync(
        edit(
          page98777,
          'content="https://myfigurecollection.net/?_tb=commit&amp;commit=nsp&amp;objectType=item&amp;objectId=98777&amp;size=1"',
          'content="https://static.myfigurecollection.net/ressources/icons/nsfw.png"',
        ),
      ),
    ).toEqual({
      status: 400,
      body: "Turn off SFW mode in your MyFigureCollection menu to save this NSFW item",
    });

    expect(await itemRows()).toEqual(before);
  });

  test("an item that was never imported answers 404 and stores nothing", async () => {
    expect(await resync(page98777, JPEG)).toEqual({ status: 404, body: "Item not found" });
    expect(store.objects.size).toBe(0);
  });
});

describe("Item Refresh has no cooldown", () => {
  test("a refresh answers whether it saved and what became of its picture", async () => {
    await upload(page98777);

    expect(await resync(derivedRetitledPage)).toEqual({
      status: 200,
      body: { saved: "refreshed", picture: "absent" },
    });
    expect(await resync(derivedRetitledPage, PNG)).toEqual({
      status: 200,
      body: { saved: "refreshed", picture: "stored" },
    });
  });

  test("two refreshes in a row both write", async () => {
    await upload(page98777);

    expect(await resync(derivedRetitledPage)).toMatchObject(refreshed("refreshed"));
    expect(await resync(derivedRescheduledPage)).toMatchObject(refreshed("refreshed"));

    const { item: row, releases } = await itemRows();
    expect(row?.title).toBe(RETITLED);
    expect(releases).toEqual([{ id: expect.any(String), ...RESCHEDULED_98777 }]);
  });

  test("two concurrent refreshes of one item run one after the other and both write", async () => {
    const itemId = await upload(page98777);
    await collectEveryRelease(itemId, "2018-11-15");

    const answers = await db.transaction(async (tx) => {
      await tx.select({ id: item.id }).from(item).where(eq(item.id, itemId)).for("update");
      const both = Promise.all([resync(derivedRescheduledPage), resync(derivedRetitledPage)]);
      await requestsWaitingOnLocks(2);
      return { both };
    });

    const replies = await answers.both;
    expect(replies.map((reply) => reply.status)).toEqual([200, 200]);
    const { item: row, links, releases } = await itemRows();
    expect(row?.title).toBe(RETITLED);
    expect(links).toHaveLength(7);
    expect(releases).toHaveLength(1);
    expect(await selectedReleases()).toEqual(releases.map((release) => release.id));
  });

  test("a picture store that throws answers 500 and leaves the item as it was", async () => {
    await upload(page98777);
    const before = await itemRows();
    store.failPut();

    expect(await resync(derivedRetitledPage, PNG)).toEqual({
      status: 500,
      body: "Failed to request item refresh",
    });

    expect(await itemRows()).toEqual(before);
  });
});

describe("who may refresh an Item", () => {
  test("an account without a verified email gets 403 and refreshes nothing", async () => {
    await upload(page98777, JPEG);
    const before = await itemRows();

    expect(await resync(derivedRetitledPage, PNG, 98_777, unverifiedUserId)).toEqual({
      status: 403,
      body: EMAIL_VERIFICATION_REQUIRED,
    });

    expect(await itemRows()).toEqual(before);
    expect(store.objects.size).toBe(1);
  });
});

describe("the per-user resync rate limit", () => {
  test("the 61st resync in an hour answers 429 and refreshes nothing", async () => {
    await upload(page98777);
    const before = await itemRows();
    await redis.set(`rl:item-resync:${userId}`, "60", "EX", 3600);

    const refused = await resync(derivedRetitledPage);

    expect(refused.status).toBe(429);
    expect(refused.body).toStartWith("Rate limit exceeded");
    expect(await redis.get(`rl:item-resync:${userId}`)).toBe("61");
    expect(await itemRows()).toEqual(before);
  });
});

describe("the posted picture", () => {
  test("a different picture replaces the item's image with one at its content's key", async () => {
    await upload(page98777, JPEG);

    expect(await resync(page98777, PNG)).toMatchObject(refreshed("refreshed"));

    const digest = new Bun.CryptoHasher("sha256").update(PNG).digest("hex");
    const { item: row } = await itemRows();
    expect(row).toMatchObject({ image: null, imageKey: `items/${digest}.png` });
    expect(store.objects.get(`items/${digest}.png`)).toMatchObject({
      CacheControl: "public, max-age=31536000, immutable",
    });
    expect(store.objects.size).toBe(2);
  });

  test("the same bytes again change nothing", async () => {
    await upload(page98777, JPEG);
    const { item: before } = await itemRows();

    expect(await resync(page98777, JPEG)).toEqual({
      status: 200,
      body: { saved: "unchanged", picture: "stored" },
    });
    const { item: after } = await itemRows();
    expect(after).toEqual(before);
  });

  test("a refresh with the same bytes stores a picture whose object went missing", async () => {
    await upload(page98777, JPEG);
    const digest = new Bun.CryptoHasher("sha256").update(JPEG).digest("hex");
    store.objects.delete(`items/${digest}.jpg`);

    expect(await resync(page98777, JPEG)).toMatchObject({ body: { picture: "stored" } });

    expect(store.objects.has(`items/${digest}.jpg`)).toBe(true);
  });

  test("a legacy picture refreshed with new bytes moves to their content's key", async () => {
    await upload(page98777);
    await db
      .update(item)
      .set({ image: "https://static.myakiba.app/legacy-mfc-name.jpg" })
      .where(eq(item.ownerId, userId));

    expect(await resync(page98777, PNG)).toMatchObject(refreshed("refreshed"));
    const digest = new Bun.CryptoHasher("sha256").update(PNG).digest("hex");
    const { item: row } = await itemRows();
    expect(row).toMatchObject({ image: null, imageKey: `items/${digest}.png` });
  });

  test("a rejected picture keeps the old image", async () => {
    await upload(page98777, JPEG);
    const { item: imported } = await itemRows();

    expect(await resync(derivedRetitledPage, NOT_AN_IMAGE)).toMatchObject(refreshed("refreshed"));

    const { item: row } = await itemRows();
    expect(row).toMatchObject({ title: RETITLED, imageKey: imported?.imageKey });
  });

  test("no picture keeps the old image", async () => {
    await upload(page98777, JPEG);
    const { item: imported } = await itemRows();

    expect(await resync(derivedRetitledPage)).toMatchObject(refreshed("refreshed"));

    const { item: row } = await itemRows();
    expect(row).toMatchObject({ title: RETITLED, imageKey: imported?.imageKey });
  });
});

async function storedVersion(itemId: string) {
  const [row] = await db.select({ version: item.version }).from(item).where(eq(item.id, itemId));
  return row?.version;
}

const QUOTA = 2 * 1024 ** 3;

const pngNumber = (n: number) => {
  const bytes = [...PNG];
  bytes[9] = n;
  return new Uint8Array(bytes);
};

async function recordPicture(bytes: number) {
  await db.execute(
    sql`INSERT INTO picture (owner_id, key, bytes) VALUES (${userId}, ${`items/${"0".repeat(64)}.jpg`}, ${bytes})`,
  );
}

describe("Item Refresh stores pictures only while the owner's ledger is under 2 GiB", () => {
  test("a refresh loop with new bytes stops storing once the ledger reaches the quota", async () => {
    await upload(page98777, JPEG);
    await recordPicture(QUOTA - JPEG.byteLength - 2 * PNG.byteLength);

    const outcomes = [];
    for (let n = 1; n <= 4; n += 1) {
      const refreshedWith = await resync(page98777, pngNumber(n));
      outcomes.push(z.object({ picture: z.string() }).parse(refreshedWith.body).picture);
    }

    expect(outcomes).toEqual(["stored", "stored", "over_quota", "over_quota"]);
    expect(store.puts()).toBe(3);
    const [used] = await db.execute<{ bytes: number }>(
      sql`SELECT sum(bytes)::bigint AS bytes FROM picture WHERE owner_id = ${userId}`,
    );
    expect(Number(used?.bytes)).toBe(QUOTA);
  });

  test("an over-quota refresh keeps the Item's picture", async () => {
    await upload(page98777, JPEG);
    const { item: imported } = await itemRows();
    await recordPicture(QUOTA - JPEG.byteLength);

    expect(await resync(derivedRetitledPage, PNG)).toEqual({
      status: 200,
      body: { saved: "refreshed", picture: "over_quota" },
    });
    const { item: row } = await itemRows();
    expect(row).toMatchObject({ title: RETITLED, imageKey: imported?.imageKey });
  });
});

describe("pages the refresh refuses or rewrites", () => {
  test("a page for a different item answers 400 and leaves that item as it was", async () => {
    await db
      .insert(item)
      .values({ ownerId: userId, source: "mfc", externalId: 12_345, title: "Another item" });

    expect(await resync(page98777, JPEG, 12_345)).toEqual({
      status: 400,
      body: "The page is for a different item",
    });

    const [other] = await db
      .select({ title: item.title, image: item.image })
      .from(item)
      .where(eq(item.externalId, 12_345));
    expect(other).toEqual({ title: "Another item", image: null });
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

    expect(await resync(page98777)).toMatchObject(refreshed("refreshed"));

    const rewritten = await itemRows();
    expect(rewritten.links).toEqual(imported.links);
    expect(await storedVersion(itemId)).toEqual(version);

    expect(await resync(page98777)).toMatchObject(refreshed("unchanged"));
  });
});
