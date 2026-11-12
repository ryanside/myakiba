import { beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import { Elysia } from "elysia";
import { initLogger } from "evlog";
import type { DrainContext } from "evlog";
import path from "node:path";
import { and, asc, eq, sql } from "drizzle-orm";
import * as z from "zod";
import type { PutObjectCommand } from "@aws-sdk/client-s3";
import { EMAIL_VERIFICATION_REQUIRED } from "@myakiba/contracts/shared/messages";
import * as authSchema from "@myakiba/db/schema/auth";
import { entry, entry_to_item, item, item_release } from "@myakiba/db/schema/figure";
import { createTestDatabase } from "../../../test/database";

let drained = Promise.withResolvers<DrainContext>();
initLogger({ silent: true, drain: (context) => drained.resolve(context) });

const userId = "user-1";

const rateLimitKeys: string[] = [];
let rateLimitCount = 1;

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

await mock.module("@myakiba/redis/client", () => ({
  redis: {
    eval: async (_script: string, _keys: number, key: string) => {
      rateLimitKeys.push(key);
      return [rateLimitCount, 1800];
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
const { default: mfcItemsRouter } = await import("./index");
const app = new Elysia({ prefix: "/api" }).use(mfcItemsRouter);

const fixtures = path.join(import.meta.dir, "../../../../../packages/mfc/fixtures");
const fixture = (name: string) => Bun.file(path.join(fixtures, name)).text();

function edit(html: string, from: string, to: string): string {
  if (!html.includes(from)) throw new Error(`fixture has no ${from}`);
  return html.replaceAll(from, to);
}

function slice(html: string, from: string, upTo: string): string {
  const start = html.indexOf(from);
  const end = html.indexOf(upTo, start);
  if (start === -1 || end === -1) throw new Error(`fixture has no ${from} before ${upTo}`);
  return html.slice(start, end);
}

const page98777 = await fixture("item-98777.html");
const field = (label: string) => `<div class="data-field"><div class="data-label">${label}<`;
const entryLink = (entryId: number) =>
  `${slice(page98777, `<div class="item-entries"><a href="/entry/${entryId}"`, "</small></div>")}</small></div>`;
const [sculptor, illustrator] = [entryLink(9613), entryLink(21_937)];
// Drops the fields before Artists: a shared first entry would queue one writer behind the other.
const derivedSharedEntriesPage = edit(
  edit(
    edit(edit(page98777, "/item/98777", "/item/98779"), "objectId=98777", "objectId=98779"),
    slice(page98777, field("Origin"), field("Artists")),
    "",
  ),
  sculptor + illustrator,
  illustrator + sculptor,
);
const derivedWrongItemPage = edit(page98777, "/item/98777", "/item/98778");

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);

function memoryStore() {
  const objects = new Map<string, PutObjectCommand["input"]>();
  let gate: (() => Promise<null>) | null = null;
  let puts = 0;
  let beforePut: ((key: string) => Promise<void>) | null = null;
  const send = async (command: PutObjectCommand) => {
    await beforePut?.(command.input.Key ?? "");
    await gate?.();
    puts += 1;
    objects.set(command.input.Key ?? "", command.input);
    return { $metadata: { httpStatusCode: 200 } };
  };
  const releasePutsTogether = (parties: number) => {
    const { promise, resolve } = Promise.withResolvers<null>();
    let arrived = 0;
    gate = () => {
      arrived += 1;
      if (arrived === parties) resolve(null);
      return promise;
    };
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
  const failPuts = (failure: "hang" | "error") => {
    gate = () =>
      failure === "hang" ? new Promise<null>(() => {}) : Promise.reject(new Error("S3 is down"));
  };
  return {
    send,
    objects,
    puts: () => puts,
    /** Runs at the start of every put, before the object is stored. */
    whenPutting: (observe: (key: string) => Promise<void>) => {
      beforePut = observe;
    },
    releasePutsTogether,
    holdPut,
    failPuts,
  };
}

let store = memoryStore();

beforeEach(async () => {
  await db.execute('TRUNCATE "user", item, entry CASCADE');
  await db
    .insert(authSchema.user)
    .values({ id: userId, name: "Ryan", email: "r@example.com", username: "ryan" });
  store = memoryStore();
  rateLimitKeys.length = 0;
  rateLimitCount = 1;
});

type Upload = {
  readonly mfcItemId: number;
  readonly page: string;
  readonly pageAs?: "file" | "text";
  readonly picture?: Uint8Array;
  readonly headers?: Record<string, string>;
};

async function answer(response: Response) {
  const json = response.headers.get("content-type")?.includes("json");
  return { status: response.status, body: json ? await response.json() : await response.text() };
}

async function upload({ mfcItemId: id, page, pageAs = "file", picture, headers }: Upload) {
  const form = new FormData();
  form.set("mfcItemId", String(id));
  if (pageAs === "file") form.set("page", new File([page], "page.html", { type: "text/html" }));
  else form.set("page", page);
  if (picture) form.set("picture", new File([picture], "picture", { type: "image/png" }));
  const response = await app.handle(
    new Request("http://localhost/api/mfc-items", {
      method: "POST",
      headers: { "x-test-user": userId, ...headers },
      body: form,
    }),
  );
  return answer(response);
}

async function itemRows(externalId: number) {
  const [row] = await db
    .select({
      title: item.title,
      mfcTitle: item.mfcTitle,
      numbering: item.numbering,
      category: item.category,
      version: item.version,
      scale: item.scale,
      height: item.height,
      width: item.width,
      depth: item.depth,
      mfcMetadataVersion: item.mfcMetadataVersion,
      contentLabel: item.contentLabel,
      mfcRatingId: item.mfcRatingId,
      image: item.image,
      imageKey: item.imageKey,
    })
    .from(item)
    .where(eq(item.externalId, externalId));
  const links = await db
    .select({
      entry: entry.externalId,
      category: entry.category,
      name: entry.name,
      role: entry_to_item.role,
      roles: entry_to_item.roles,
      sourceLabel: entry_to_item.sourceLabel,
      materialPercentage: entry_to_item.materialPercentage,
    })
    .from(entry_to_item)
    .innerJoin(entry, eq(entry.id, entry_to_item.entryId))
    .innerJoin(item, eq(item.id, entry_to_item.itemId))
    .where(eq(item.externalId, externalId))
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
    .innerJoin(item, eq(item.id, item_release.itemId))
    .where(eq(item.externalId, externalId));
  return { item: row, links, releases };
}

const savedSchema = z.object({ saved: z.enum(["created", "existing"]), itemId: z.string() });
const saved = (reply: { readonly body: unknown }) => savedSchema.parse(reply.body);

const counts = async () => ({
  items: await db.$count(item),
  entries: await db.$count(entry),
  links: await db.$count(entry_to_item),
  releases: await db.$count(item_release),
});

const LOCK_WAIT_MS = 1000;
const POSTGRES_DEADLOCK_TIMEOUT_MS = 1000;
const UPLOAD_PAIR_MS = 1000;
const RACE_ROUNDS = 5;
const RACE_TIMEOUT_MS =
  RACE_ROUNDS * (LOCK_WAIT_MS + POSTGRES_DEADLOCK_TIMEOUT_MS + UPLOAD_PAIR_MS);

async function uploadsWaitingOnLocks(expected: number) {
  const deadline = Date.now() + LOCK_WAIT_MS;
  for (;;) {
    const [waiting] = await db.execute<{ count: number }>(
      "SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'",
    );
    if (waiting?.count === expected) return;
    if (Date.now() > deadline) throw new Error(`${waiting?.count} uploads wait on locks`);
    await Bun.sleep(10);
  }
}

const RELEASE_98777 = {
  date: "2018-11-15",
  type: "Standard (Japan)",
  price: 1_350_000,
  priceCurrency: "JPY",
  barcode: "4582292601715",
};

const link = (externalId: number, category: string, name: string, roles: string[] = []) => ({
  entry: externalId,
  category,
  name,
  role: roles[0] ?? "",
  roles,
  sourceLabel: name,
  materialPercentage: null,
});

describe("POST /api/mfc-items saves an MFC item page as a new item", () => {
  test("the 98777 page creates one item with its label, rating, entries, links and release", async () => {
    const { status, body } = await upload({ mfcItemId: 98_777, page: page98777, picture: JPEG });

    expect(status).toBe(200);
    expect(body).toEqual({
      saved: "created",
      itemId: expect.any(String),
      mfcItemId: 98_777,
      picture: "stored",
    });
    const digest = new Bun.CryptoHasher("sha256").update(JPEG).digest("hex");
    expect([...store.objects.values()]).toEqual([
      expect.objectContaining({
        Key: `items/${digest}.jpg`,
        CacheControl: "public, max-age=31536000, immutable",
      }),
    ]);
    expect(await itemRows(98_777)).toEqual({
      item: {
        title: "Hello, Good-bye - Yukishiro May - 1/7 (Orchid Seed)",
        mfcTitle: null,
        numbering: null,
        category: "Prepainted",
        version: [],
        scale: "1/7",
        height: 140,
        width: null,
        depth: null,
        mfcMetadataVersion: 1,
        contentLabel: "explicit",
        mfcRatingId: 3,
        image: null,
        imageKey: `items/${digest}.jpg`,
      },
      links: [
        link(7628, "Companies", "Orchid Seed", ["Manufacturer"]),
        link(9613, "Artists", "Minheru", ["Sculptor"]),
        link(21_937, "Artists", "Moekibara Fumitake", ["Illustrator"]),
        link(23_441, "Materials", "PVC"),
        link(23_442, "Materials", "ABS"),
        link(23_761, "Origins", "Hello, Good-bye"),
        link(23_762, "Characters", "Yukishiro May"),
      ],
      releases: [{ id: expect.any(String), ...RELEASE_98777 }],
    });
    expect(await counts()).toEqual({ items: 1, entries: 7, links: 7, releases: 1 });
  });

  test("two Items whose pages list the same release each get their own release id", async () => {
    await upload({ mfcItemId: 98_777, page: page98777 });
    await upload({ mfcItemId: 98_779, page: derivedSharedEntriesPage });

    const { releases: firstReleases } = await itemRows(98_777);
    const { releases: secondReleases } = await itemRows(98_779);
    const [first] = firstReleases;
    const [second] = secondReleases;
    expect(first).toEqual({ id: expect.any(String), ...RELEASE_98777 });
    expect(second).toEqual({ id: expect.any(String), ...RELEASE_98777 });
    expect(second?.id).not.toBe(first?.id);
  });

  test("uploading it again answers existing and writes nothing", async () => {
    const first = await upload({ mfcItemId: 98_777, page: page98777, picture: JPEG });
    const rows = await itemRows(98_777);
    const updatedAt = await db.select({ updatedAt: item.updatedAt }).from(item);

    const again = await upload({ mfcItemId: 98_777, page: page98777, picture: JPEG });

    expect(again).toEqual({
      status: 200,
      body: { saved: "existing", itemId: saved(first).itemId, mfcItemId: 98_777 },
    });
    expect(await itemRows(98_777)).toEqual(rows);
    expect(await db.select({ updatedAt: item.updatedAt }).from(item)).toEqual(updatedAt);
    expect(await counts()).toEqual({ items: 1, entries: 7, links: 7, releases: 1 });
    expect(store.objects.size).toBe(1);
  });

  test("an existing item answers existing even when the page would not parse", async () => {
    await upload({ mfcItemId: 98_777, page: page98777 });

    expect(
      await upload({ mfcItemId: 98_777, page: await fixture("derived-challenge.html") }),
    ).toMatchObject({ status: 200, body: { saved: "existing", mfcItemId: 98_777 } });
  });

  test("two concurrent uploads of 98777 end with one item and its seven links", async () => {
    store.releasePutsTogether(2);

    const answers = await Promise.all([
      upload({ mfcItemId: 98_777, page: page98777, picture: JPEG }),
      upload({ mfcItemId: 98_777, page: page98777, picture: JPEG }),
    ]);

    expect(answers.map((a) => a.status)).toEqual([200, 200]);
    expect(answers.map((a) => saved(a).saved).toSorted()).toEqual(["created", "existing"]);
    expect(new Set(answers.map((a) => saved(a).itemId)).size).toBe(1);
    expect(await counts()).toEqual({ items: 1, entries: 7, links: 7, releases: 1 });
  });

  test(
    "concurrent uploads that reach their shared entries in opposite orders both finish",
    async () => {
      const race = async () => {
        await db.execute("TRUNCATE item, entry CASCADE");
        const { answers } = await db.transaction(async (tx) => {
          await tx.insert(entry).values([
            {
              ownerId: userId,
              externalId: 9613,
              source: "mfc",
              category: "Artists",
              name: "Minheru",
            },
            {
              ownerId: userId,
              externalId: 21_937,
              source: "mfc",
              category: "Artists",
              name: "Moekibara Fumitake",
            },
          ]);
          const uploads = Promise.all([
            upload({ mfcItemId: 98_777, page: page98777 }),
            upload({ mfcItemId: 98_779, page: derivedSharedEntriesPage }),
          ]);
          await uploadsWaitingOnLocks(2);
          return { answers: uploads };
        });
        const answered = await answers;
        return { statuses: answered.map((a) => a.status), counts: await counts() };
      };
      const rounds = [];
      // Each round is a fresh chance to interleave. A broken lock order deadlocks in some rounds, not all.
      for (let round = 0; round < RACE_ROUNDS; round++) rounds.push(await race());

      expect(rounds).toEqual(
        Array.from({ length: RACE_ROUNDS }, () => ({
          statuses: [200, 200],
          counts: { items: 2, entries: 7, links: 11, releases: 2 },
        })),
      );
    },
    RACE_TIMEOUT_MS,
  );

  test("no transaction is open while the picture is stored", async () => {
    const put = store.holdPut();
    const created = upload({ mfcItemId: 98_777, page: page98777, picture: JPEG });
    await put.arrived;

    const [open] = await db.execute<{ count: number }>(
      "SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname = current_database() AND state LIKE 'idle in transaction%'",
    );
    put.release();

    expect(open?.count).toBe(0);
    expect(await created).toMatchObject({ status: 200, body: { saved: "created" } });
  });

  test("a page sent as text is read like a file", async () => {
    expect(
      await upload({ mfcItemId: 98_779, page: derivedSharedEntriesPage, pageAs: "text" }),
    ).toMatchObject({
      status: 200,
      body: { saved: "created", mfcItemId: 98_779, picture: "absent" },
    });
  });

  test("a picture that is not an image is rejected and the item is still created", async () => {
    const html = new TextEncoder().encode("<!DOCTYPE html><title>NSFW</title>");

    expect(await upload({ mfcItemId: 98_777, page: page98777, picture: html })).toMatchObject({
      status: 200,
      body: { saved: "created", picture: "rejected" },
    });
    const rows = await itemRows(98_777);
    expect(rows.item?.image).toBeNull();
    expect(store.objects.size).toBe(0);
  });

  test.each([
    [
      "a challenge page",
      "derived-challenge.html",
      "MyFigureCollection showed a security check instead of the item",
    ],
    [
      "a signed-in not-found page",
      "derived-not-found-signed-in.html",
      "MyFigureCollection did not show this item",
    ],
    [
      "a signed-out not-found page",
      "derived-not-found-signed-out.html",
      "MyFigureCollection did not show this item",
    ],
  ])("%s answers 400 and writes nothing", async (_name, file, message) => {
    expect(await upload({ mfcItemId: 98_777, page: await fixture(file), picture: JPEG })).toEqual({
      status: 400,
      body: message,
    });
    expect(await counts()).toEqual({ items: 0, entries: 0, links: 0, releases: 0 });
    expect(store.objects.size).toBe(0);
  });

  test("a page past a size limit answers 400 and logs the limit and what it measured", async () => {
    const tooWide = edit(
      page98777,
      field("Category"),
      `<div>${"<i></i>".repeat(1025)}</div>${field("Category")}`,
    );
    drained = Promise.withResolvers<DrainContext>();

    expect(await upload({ mfcItemId: 98_777, page: tooWide })).toEqual({
      status: 400,
      body: "The page is larger than any MyFigureCollection item page",
    });
    const { event } = await drained.promise;
    expect(event).toMatchObject({
      mfc: { itemId: 98_777, outcome: "too_large", limit: "children", measured: 1025 },
    });
    expect(await counts()).toEqual({ items: 0, entries: 0, links: 0, releases: 0 });
  });

  test("the page of 98778 posted as 98777 answers 400 and writes nothing", async () => {
    expect(await upload({ mfcItemId: 98_777, page: derivedWrongItemPage, picture: JPEG })).toEqual({
      status: 400,
      body: "The page is for a different item",
    });
    expect(await counts()).toEqual({ items: 0, entries: 0, links: 0, releases: 0 });
  });

  test("a page over 2 MB is refused by the contract and writes nothing", async () => {
    const oversized = page98777 + " ".repeat(2 * 1024 * 1024);

    const asFile = await upload({ mfcItemId: 98_777, page: oversized });
    const asText = await upload({ mfcItemId: 98_777, page: oversized, pageAs: "text" });

    expect([asFile.status, asText.status]).toEqual([422, 422]);
    expect(await counts()).toEqual({ items: 0, entries: 0, links: 0, releases: 0 });
  });

  test("an unknown field is refused by the strict contract", async () => {
    const form = new FormData();
    form.set("mfcItemId", "98777");
    form.set("page", page98777);
    form.set("userId", "user-2");
    const response = await app.handle(
      new Request("http://localhost/api/mfc-items", {
        method: "POST",
        headers: { "x-test-user": userId },
        body: form,
      }),
    );

    expect(response.status).toBe(422);
    expect(await counts()).toEqual({ items: 0, entries: 0, links: 0, releases: 0 });
  });
});

describe("POST /api/mfc-items saves a page's text without NUL characters", () => {
  test("a NUL in the title, the Title field, a release type and an entry name is dropped", async () => {
    const withNuls = [
      ["Yukishiro May - 1/7 (Orchid Seed)</h1>", "Yukishiro\u0000 May - 1/7 (Orchid Seed)</h1>"],
      [">Orchid Seed</span>", ">Orchid\u0000 Seed</span>"],
      ["<em>Standard (Japan)</em>", "<em>Standard\u0000 (Japan)</em>"],
      [
        field("Category"),
        `<div class="data-field"><div class="data-label">Title</div><div class="data-value">ハロー\u0000グッバイ</div></div>${field("Category")}`,
      ],
    ] as const;
    const page = withNuls.reduce((html, [from, to]) => edit(html, from, to), page98777);

    const { status } = await upload({ mfcItemId: 98_777, page });

    expect(status).toBe(200);
    const rows = await itemRows(98_777);
    expect(rows.item).toMatchObject({
      title: "Hello, Good-bye - Yukishiro May - 1/7 (Orchid Seed)",
      mfcTitle: "ハローグッバイ",
    });
    expect(rows.links).toContainEqual(link(7628, "Companies", "Orchid Seed", ["Manufacturer"]));
    expect(rows.releases).toEqual([{ id: expect.any(String), ...RELEASE_98777 }]);
  });
});

describe("POST /api/mfc-items needs a verified email and has its own rate limit", () => {
  test("an unverified user gets 403 with the verification message", async () => {
    const unverified = { "x-test-unverified": "1" };

    expect(await upload({ mfcItemId: 98_777, page: page98777, headers: unverified })).toEqual({
      status: 403,
      body: EMAIL_VERIFICATION_REQUIRED,
    });
    expect(await counts()).toEqual({ items: 0, entries: 0, links: 0, releases: 0 });
  });

  test("an upload counts against its per-user limit", async () => {
    await upload({ mfcItemId: 98_777, page: page98777 });

    expect(rateLimitKeys).toEqual([`rl:mfc-ingest:${userId}`]);
  });

  test("a user over the limit gets 429 with Retry-After", async () => {
    rateLimitCount = 2001;
    const form = new FormData();
    form.append("mfcItemId", "98777");
    form.append("page", new File([page98777], "page.html", { type: "text/html" }));
    const response = await app.handle(
      new Request("http://localhost/api/mfc-items", {
        method: "POST",
        headers: { "x-test-user": userId },
        body: form,
      }),
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("1800");
  });
});

describe("POST /api/mfc-items fails the item when its picture cannot be stored", () => {
  test("a store that errors answers 500 and writes nothing", async () => {
    store.failPuts("error");

    expect(await upload({ mfcItemId: 98_777, page: page98777, picture: JPEG })).toEqual({
      status: 500,
      body: "Failed to save item",
    });
    expect(await counts()).toEqual({ items: 0, entries: 0, links: 0, releases: 0 });
  });

  test("a store that hangs is cut off by its 5 s budget, answers 500 and writes nothing", async () => {
    const timeout = AbortSignal.timeout.bind(AbortSignal);
    const budget = spyOn(AbortSignal, "timeout").mockImplementation((ms) =>
      timeout(ms === 5000 ? 100 : ms),
    );
    store.failPuts("hang");
    try {
      expect(await upload({ mfcItemId: 98_777, page: page98777, picture: JPEG })).toEqual({
        status: 500,
        body: "Failed to save item",
      });
      expect(budget.mock.calls.map(([ms]) => ms)).toContain(5000);
    } finally {
      budget.mockRestore();
    }
    expect(await counts()).toEqual({ items: 0, entries: 0, links: 0, releases: 0 });
  });
});

const GIB = 1024 ** 3;
const QUOTA = 2 * GIB;
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
const keyOf = (bytes: Uint8Array, extension: string) =>
  `items/${new Bun.CryptoHasher("sha256").update(bytes).digest("hex")}.${extension}`;

// The ledger is read and written in SQL, so this file also loads before the table existed.
async function recordPicture(owner: string, key: string, bytes: number) {
  await db.execute(
    sql`INSERT INTO picture (owner_id, key, bytes) VALUES (${owner}, ${key}, ${bytes})`,
  );
}

/** Ledger rows for pictures no Item shows, filling the owner's quota to `used` bytes. */
async function recordPictures(used: number, owner = userId) {
  const halves = [Math.ceil(used / 2), Math.floor(used / 2)].filter((bytes) => bytes > 0);
  for (const [index, bytes] of halves.entries()) {
    await recordPicture(owner, `items/${String(index).repeat(64)}.jpg`, bytes);
  }
}

async function ledgerOf(owner = userId) {
  const rows = await db.execute<{ key: string; bytes: number }>(
    sql`SELECT key, bytes FROM picture WHERE owner_id = ${owner} ORDER BY key`,
  );
  return [...rows];
}

describe("POST /api/mfc-items keeps each account's picture ledger within 2 GiB", () => {
  test("the ledger row is committed when the picture is stored", async () => {
    const seenAtPut: Awaited<ReturnType<typeof ledgerOf>>[] = [];
    // The ledger is read from another connection, so only a committed row is seen.
    store.whenPutting(async () => {
      seenAtPut.push(await ledgerOf());
    });

    expect(await upload({ mfcItemId: 98_777, page: page98777, picture: JPEG })).toMatchObject({
      body: { saved: "created", picture: "stored" },
    });

    expect(seenAtPut).toEqual([[{ key: keyOf(JPEG, "jpg"), bytes: JPEG.byteLength }]]);
  });

  test("a picture whose store fails keeps its ledger row, so it still counts", async () => {
    store.failPuts("error");

    expect(await upload({ mfcItemId: 98_777, page: page98777, picture: JPEG })).toEqual({
      status: 500,
      body: "Failed to save item",
    });

    expect(await ledgerOf()).toEqual([{ key: keyOf(JPEG, "jpg"), bytes: JPEG.byteLength }]);
    expect(await itemRows(98_777)).toMatchObject({ item: undefined });
  });

  test("pictures no Item shows still count, so one past the quota is not recorded or stored", async () => {
    await recordPictures(QUOTA - JPEG.byteLength + 1);

    expect(await upload({ mfcItemId: 98_777, page: page98777, picture: JPEG })).toMatchObject({
      status: 200,
      body: { saved: "created", picture: "over_quota" },
    });
    const { item: saved98777 } = await itemRows(98_777);
    expect(saved98777).toMatchObject({ image: null, imageKey: null });
    expect(await ledgerOf()).not.toContainEqual(
      expect.objectContaining({ key: keyOf(JPEG, "jpg") }),
    );
    expect(store.puts()).toBe(0);
  });

  test("a picture that exactly fills the quota is stored", async () => {
    await recordPictures(QUOTA - JPEG.byteLength);

    expect(await upload({ mfcItemId: 98_777, page: page98777, picture: JPEG })).toMatchObject({
      body: { saved: "created", picture: "stored" },
    });
    expect(store.puts()).toBe(1);
  });

  test("a picture the owner already recorded counts once", async () => {
    await recordPicture(userId, keyOf(JPEG, "jpg"), JPEG.byteLength);
    await recordPictures(QUOTA - JPEG.byteLength);

    expect(await upload({ mfcItemId: 98_777, page: page98777, picture: JPEG })).toMatchObject({
      body: { saved: "created", picture: "stored" },
    });
  });

  test("another user's ledger does not count", async () => {
    await db.insert(authSchema.user).values({
      id: "user-2",
      name: "Other",
      email: "other@example.com",
      username: "other",
    });
    await recordPictures(QUOTA, "user-2");

    expect(await upload({ mfcItemId: 98_777, page: page98777, picture: JPEG })).toMatchObject({
      body: { saved: "created", picture: "stored" },
    });
  });

  test("two uploads that each fit alone but not together record and store one picture", async () => {
    await recordPictures(QUOTA - JPEG.byteLength - PNG.byteLength + 1);

    const answers = await Promise.all([
      upload({ mfcItemId: 98_777, page: page98777, picture: JPEG }),
      upload({ mfcItemId: 98_779, page: derivedSharedEntriesPage, picture: PNG }),
    ]);

    const pictureOf = z.object({ picture: z.string() });
    expect(answers.map((reply) => pictureOf.parse(reply.body).picture).toSorted()).toEqual([
      "over_quota",
      "stored",
    ]);
    expect(store.puts()).toBe(1);
    expect(await ledgerOf()).toHaveLength(3);
  });

  test("a picture one of the owner's Items already shows is stored again, and recorded once", async () => {
    await upload({ mfcItemId: 98_777, page: page98777, picture: JPEG });
    await upload({ mfcItemId: 98_779, page: derivedSharedEntriesPage, picture: JPEG });

    expect(store.puts()).toBe(2);
    expect(await ledgerOf()).toEqual([{ key: keyOf(JPEG, "jpg"), bytes: JPEG.byteLength }]);
    const { item: second } = await itemRows(98_779);
    expect(second).toMatchObject({ imageKey: keyOf(JPEG, "jpg") });
  });
});

describe("POST /api/mfc-items stores each picture once, by its bytes", () => {
  const OTHER = "user-2";

  beforeEach(async () => {
    await db.insert(authSchema.user).values({
      id: OTHER,
      name: "Other",
      email: "other@example.com",
      username: "other",
    });
  });

  const pictureOfItem = async (owner: string) => {
    const [row] = await db
      .select({ image: item.image, imageKey: item.imageKey })
      .from(item)
      .where(and(eq(item.ownerId, owner), eq(item.externalId, 98_777)));
    return row;
  };

  test("two users who save the same bytes share one object, and each Item stores its key", async () => {
    await upload({ mfcItemId: 98_777, page: page98777, picture: JPEG });
    await upload({
      mfcItemId: 98_777,
      page: page98777,
      picture: JPEG,
      headers: { "x-test-user": OTHER },
    });

    const shown = { image: null, imageKey: keyOf(JPEG, "jpg") };
    expect(await pictureOfItem(userId)).toEqual(shown);
    expect(await pictureOfItem(OTHER)).toEqual(shown);
    expect([...store.objects.keys()]).toEqual([keyOf(JPEG, "jpg")]);
    expect(await ledgerOf(OTHER)).toEqual([{ key: keyOf(JPEG, "jpg"), bytes: JPEG.byteLength }]);
  });

  test("different bytes are separate objects, each shown only by its uploader's Item", async () => {
    await upload({ mfcItemId: 98_777, page: page98777, picture: JPEG });
    await upload({
      mfcItemId: 98_777,
      page: page98777,
      picture: PNG,
      headers: { "x-test-user": OTHER },
    });

    expect(await pictureOfItem(userId)).toMatchObject({ imageKey: keyOf(JPEG, "jpg") });
    expect(await pictureOfItem(OTHER)).toMatchObject({ imageKey: keyOf(PNG, "png") });
    expect([...store.objects.keys()].toSorted()).toEqual(
      [keyOf(JPEG, "jpg"), keyOf(PNG, "png")].toSorted(),
    );
  });
});

describe("POST /api/mfc-items holds at most 20,000 Items per account", () => {
  async function holdItems(count: number) {
    await db.execute(sql`
      INSERT INTO item (id, owner_id, external_id, source, title)
      SELECT 'held-' || n, ${userId}, 2000000 + n, 'mfc', 'Held ' || n
      FROM generate_series(1, ${count}) AS n
    `);
  }

  test("a full Item Database answers 409, and records and stores nothing", async () => {
    await holdItems(20_000);

    expect(await upload({ mfcItemId: 98_777, page: page98777, picture: JPEG })).toEqual({
      status: 409,
      body: "Your Item Database is full. One account can hold 20,000 Items.",
    });
    expect(await itemRows(98_777)).toMatchObject({ item: undefined });
    expect(await ledgerOf()).toEqual([]);
    expect(store.puts()).toBe(0);
  });

  test("the 20,000th Item is added", async () => {
    await holdItems(19_999);

    expect(await upload({ mfcItemId: 98_777, page: page98777 })).toMatchObject({
      status: 200,
      body: { saved: "created" },
    });
  });

  test("an Item the full account already holds still answers existing", async () => {
    await holdItems(19_999);
    const first = await upload({ mfcItemId: 98_777, page: page98777 });

    expect(await upload({ mfcItemId: 98_777, page: page98777 })).toEqual({
      status: 200,
      body: { saved: "existing", itemId: saved(first).itemId, mfcItemId: 98_777 },
    });
  });
});
