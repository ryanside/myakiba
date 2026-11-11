import { beforeAll, beforeEach, describe, expect, test } from "bun:test";
import path from "node:path";
import { S3Client } from "bun";
import type { SQL } from "bun";
import { testDatabases } from "../../test/database";
import { PUSH_TIMEOUT, pushSchema } from "../../test/push";
import { GRACE_MS, reconcilePictures } from "./reconcile";
import type { ReconcileOptions } from "./reconcile";

/** An S3-compatible store with an existing bucket, such as http://key:secret@localhost:9000/bucket. */
const s3Url = process.env.TEST_S3_URL ? new URL(process.env.TEST_S3_URL) : null;
if (s3Url === null && process.env.CI) {
  throw new Error("TEST_S3_URL is required in CI, so pictures:reconcile runs against MinIO");
}

const CDN = "https://static.myakiba.app";
const SHARED = `items/${"a".repeat(64)}.jpg`;
const MINE = `items/${"b".repeat(64)}.png`;
const UNUSED = `items/${"c".repeat(64)}.webp`;
const ROOT_SHOWN = "1618468-shown.jpg";
const ROOT_UNUSED = "98777-unused.jpg";
const STAGING_UNUSED = "items/mfc/98777/0123456789abcdef.jpg";
const OUTSIDE = ["notes/readme.txt", "items/not-a-hash.jpg"];
const STORED_KEYS = [SHARED, MINE, UNUSED, ROOT_SHOWN, ROOT_UNUSED, STAGING_UNUSED, ...OUTSIDE];
const STORED = STORED_KEYS.length;

describe.skipIf(s3Url === null)("pictures:reconcile against an S3-compatible store", () => {
  const url = s3Url ?? new URL("http://unused");
  const s3 = {
    bucket: url.pathname.slice(1),
    endpoint: url.origin,
    accessKeyId: decodeURIComponent(url.username),
    secretAccessKey: decodeURIComponent(url.password),
    region: "us-east-1",
  };
  const bucket = new S3Client(s3);
  const databases = testDatabases();
  let template: string;
  let sql: SQL;
  let databaseUrl: string;

  beforeAll(async () => {
    template = await databases.legacyTemplate(async () => {}, []);
    const templateUrl = new URL(process.env.TEST_DATABASE_URL ?? "");
    templateUrl.pathname = `/${template}`;
    expect(await pushSchema(templateUrl.toString())).toMatchObject({ applied: true });
  }, PUSH_TIMEOUT);

  async function keys() {
    const listed = await bucket.list({ maxKeys: 1000 });
    return (listed.contents ?? []).map((object) => object.key).toSorted();
  }

  beforeEach(async () => {
    const left = await keys();
    await Promise.all(left.map((key) => bucket.delete(key)));
    ({ sql, url: databaseUrl } = await databases.create(template));
    await sql`
      INSERT INTO "user" (id, name, email, username) VALUES
        ('u1', 'One', 'u1@example.com', 'one'), ('u2', 'Two', 'u2@example.com', 'two')
    `;
    await sql`
      INSERT INTO item (id, owner_id, external_id, title, image, image_bytes) VALUES
        ('item-1', 'u1', 1, 'Shared', ${`${CDN}/${SHARED}`}, 7),
        ('item-2', 'u2', 1, 'Shared', ${`${CDN}/${SHARED}`}, 7),
        ('item-3', 'u1', 2, 'Mine', ${`${CDN}/${MINE}`}, 7),
        ('item-4', 'u2', 3, 'Legacy', ${`${CDN}/${ROOT_SHOWN}`}, NULL)
    `;
    await Promise.all(STORED_KEYS.map((key) => bucket.write(key, "picture")));
  });

  const later = () => new Date(Date.now() + GRACE_MS + 60 * 60 * 1000);
  const options = (overrides: Partial<ReconcileOptions> = {}): ReconcileOptions => ({
    now: later(),
    legacy: false,
    apply: false,
    maxDelete: 500,
    ...overrides,
  });
  const garbageKeys = (report: Awaited<ReturnType<typeof reconcilePictures>>) =>
    report.garbage.map((object) => object.key).toSorted();

  test("a dry run reports the content-keyed objects no Item shows, and deletes nothing", async () => {
    const report = await reconcilePictures(sql, bucket, options());

    expect(report).toMatchObject({
      applied: false,
      counts: { objects: 3, shown: 2, young: 0, garbage: 1, deleted: 0 },
      refused: null,
    });
    expect(garbageKeys(report)).toEqual([UNUSED]);
    expect(await keys()).toHaveLength(STORED);
  });

  test("an object younger than 24 hours is kept", async () => {
    const report = await reconcilePictures(sql, bucket, options({ now: new Date(), apply: true }));

    expect(report.counts).toEqual({ objects: 3, shown: 2, young: 1, garbage: 0, deleted: 0 });
    expect(await keys()).toHaveLength(STORED);
  });

  test("--apply deletes only content-keyed garbage, and a root-level object stays", async () => {
    const report = await reconcilePictures(sql, bucket, options({ apply: true }));

    expect(report.counts.deleted).toBe(1);
    expect(await keys()).not.toContain(UNUSED);
    expect(await keys()).toContain(ROOT_UNUSED);
    expect(await keys()).toContain(STAGING_UNUSED);
    expect(await keys()).toHaveLength(STORED - 1);
  });

  test("--legacy also deletes unused root-level and items/mfc/ pictures, and nothing outside", async () => {
    const report = await reconcilePictures(sql, bucket, options({ apply: true, legacy: true }));

    expect(report.counts).toMatchObject({ objects: 6, shown: 3, garbage: 3, deleted: 3 });
    expect(await keys()).toEqual([ROOT_SHOWN, ...OUTSIDE, SHARED, MINE].toSorted());
  });

  test("an image written with a path-style bucket URL still shows its key", async () => {
    await sql`
      UPDATE item SET image = ${`http://localhost:9000/pictures/${ROOT_UNUSED}`}
      WHERE id = 'item-3'
    `;

    const report = await reconcilePictures(sql, bucket, options({ legacy: true }));

    expect(garbageKeys(report)).not.toContain(ROOT_UNUSED);
  });

  test("more garbage than --max-delete deletes nothing", async () => {
    const report = await reconcilePictures(
      sql,
      bucket,
      options({ apply: true, legacy: true, maxDelete: 2 }),
    );

    expect(report).toMatchObject({ applied: false, counts: { garbage: 3, deleted: 0 } });
    expect(report.refused).toContain("more than --max-delete 2");
    expect(await keys()).toHaveLength(STORED);
  });

  test("an object stored again, or shown by an Item, before its delete is kept", async () => {
    const racing = {
      list: bucket.list.bind(bucket),
      delete: bucket.delete.bind(bucket),
      stat: async (key: string) => {
        if (key === ROOT_UNUSED) {
          await Bun.sleep(1100);
          await bucket.write(key, "picture");
        }
        if (key === STAGING_UNUSED) {
          await sql`
            INSERT INTO item (id, owner_id, external_id, title, image)
            VALUES ('item-5', 'u1', 5, 'Saved meanwhile', ${`${CDN}/${STAGING_UNUSED}`})
          `;
        }
        return bucket.stat(key);
      },
    };

    const report = await reconcilePictures(sql, racing, options({ apply: true, legacy: true }));

    expect(report.kept.toSorted()).toEqual([ROOT_UNUSED, STAGING_UNUSED].toSorted());
    expect(report.counts.deleted).toBe(1);
    expect(await keys()).toContain(ROOT_UNUSED);
    expect(await keys()).toContain(STAGING_UNUSED);
  });

  test("a deleted account's Items go with it, and only pictures no one else shows become garbage", async () => {
    await sql`DELETE FROM "user" WHERE id = 'u1'`;

    const [left] = await sql`SELECT count(*)::int AS items FROM item WHERE owner_id = 'u1'`;
    expect(left).toEqual({ items: 0 });
    expect(await keys()).toContain(MINE);

    const soon = await reconcilePictures(sql, bucket, options({ now: new Date(), apply: true }));
    expect(soon.counts.deleted).toBe(0);
    const day = await reconcilePictures(sql, bucket, options({ apply: true }));
    expect(garbageKeys(day)).toEqual([MINE, UNUSED].toSorted());
    expect(await keys()).toContain(SHARED);
    expect(await keys()).not.toContain(MINE);
  });

  test("the script runs a dry run by default and refuses an unknown flag", async () => {
    const run = async (...args: string[]) => {
      const child = Bun.spawn(["bun", "src/scripts/reconcile-pictures.ts", ...args], {
        cwd: path.join(import.meta.dir, "../.."),
        env: {
          ...process.env,
          DATABASE_URL: databaseUrl,
          AWS_BUCKET_NAME: s3.bucket,
          AWS_BUCKET_REGION: s3.region,
          S3_ENDPOINT_URL: s3.endpoint,
          AWS_ACCESS_KEY_ID: s3.accessKeyId,
          AWS_SECRET_ACCESS_KEY: s3.secretAccessKey,
        },
        stdout: "pipe",
        stderr: "pipe",
      });
      const [stdout, stderr, exitCode] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ]);
      return { stdout, stderr, exitCode };
    };

    const dryRun = await run();
    expect(dryRun.exitCode).toBe(0);
    expect(dryRun.stdout).toContain('"applied": false');
    expect(dryRun.stdout).toContain('"young": 1');
    expect(dryRun.stdout).toContain('"garbage": 0');
    expect(dryRun.stderr).toContain("Dry run: nothing was deleted.");

    const unknown = await run("--delete");
    expect(unknown.exitCode).not.toBe(0);
    expect(unknown.stderr).toContain("pictures:reconcile takes --apply, --legacy and --max-delete");
    expect(await keys()).toHaveLength(STORED);
  });
});
