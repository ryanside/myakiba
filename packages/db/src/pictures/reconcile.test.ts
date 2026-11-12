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
const OUTSIDE = [
  "notes/readme.txt",
  "items/not-a-hash.jpg",
  "robots.txt",
  "index.html",
  "items/mfc/98777/notes.txt",
  "items/mfc/98777/0123456789abcdef.svg",
];
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
      INSERT INTO item (id, owner_id, external_id, title, image_key, image) VALUES
        ('item-1', 'u1', 1, 'Shared', ${SHARED}, NULL),
        ('item-2', 'u2', 1, 'Shared', ${SHARED}, NULL),
        ('item-3', 'u1', 2, 'Mine', ${MINE}, NULL),
        ('item-4', 'u2', 3, 'Legacy', NULL, ${`${CDN}/${ROOT_SHOWN}`})
    `;
    await sql`
      INSERT INTO picture (owner_id, key, bytes) VALUES
        ('u1', ${SHARED}, 7), ('u2', ${SHARED}, 7), ('u1', ${MINE}, 7), ('u1', ${UNUSED}, 7)
    `;
    await Promise.all(STORED_KEYS.map((key) => bucket.write(key, "picture")));
  });

  const later = () => new Date(Date.now() + GRACE_MS + 60 * 60 * 1000);
  const options = (overrides: Partial<ReconcileOptions> = {}): ReconcileOptions => ({
    now: later(),
    legacy: false,
    ...overrides,
  });
  const unusedKeys = (set: { readonly unused: readonly { readonly key: string }[] } | undefined) =>
    (set?.unused ?? []).map((object) => object.key).toSorted();

  test("reports the content-keyed objects no Item shows by key, and deletes nothing", async () => {
    const report = await reconcilePictures(sql, bucket, options());

    expect(report.sets).toEqual({
      content: {
        objects: 3,
        shown: 2,
        young: 0,
        unused: [expect.objectContaining({ key: UNUSED })],
      },
    });
    expect(await keys()).toHaveLength(STORED);
  });

  test("an Item shows a content key only by image_key, never by a URL that ends in it", async () => {
    await sql`UPDATE item SET image_key = NULL, image = ${`${CDN}/${MINE}`} WHERE id = 'item-3'`;

    const report = await reconcilePictures(sql, bucket, options());

    expect(unusedKeys(report.sets.content)).toEqual([MINE, UNUSED].toSorted());
  });

  test("an object stored within 24 hours counts as young, not unused", async () => {
    const report = await reconcilePictures(sql, bucket, options({ now: new Date() }));

    expect(report.sets.content).toEqual({ objects: 3, shown: 2, young: 1, unused: [] });
  });

  test("--legacy also reports root-level and items/mfc/ pictures, and never another key", async () => {
    const report = await reconcilePictures(sql, bucket, options({ legacy: true }));

    expect(Object.keys(report.sets).toSorted()).toEqual(["content", "legacyMfc", "legacyRoot"]);
    expect(report.sets.legacyRoot).toMatchObject({ objects: 2, shown: 1 });
    expect(unusedKeys(report.sets.legacyRoot)).toEqual([ROOT_UNUSED]);
    expect(unusedKeys(report.sets.legacyMfc)).toEqual([STAGING_UNUSED]);
    const reported = Object.values(report.sets).flatMap((set) => set.unused.map((o) => o.key));
    for (const key of OUTSIDE) expect(reported).not.toContain(key);
    expect(await keys()).toHaveLength(STORED);
  });

  test("a legacy image written with a path-style bucket URL still shows its key", async () => {
    await sql`
      UPDATE item SET image = ${`http://localhost:9000/pictures/${ROOT_UNUSED}`} WHERE id = 'item-4'
    `;

    const report = await reconcilePictures(sql, bucket, options({ legacy: true }));

    expect(unusedKeys(report.sets.legacyRoot)).toEqual([ROOT_SHOWN]);
  });

  test("a deleted account's Items and ledger rows go with it, and its unshared pictures show as unused", async () => {
    await sql`DELETE FROM "user" WHERE id = 'u1'`;

    const [left] = await sql`
      SELECT (SELECT count(*) FROM item WHERE owner_id = 'u1')::int AS items,
             (SELECT count(*) FROM picture WHERE owner_id = 'u1')::int AS pictures
    `;
    expect(left).toEqual({ items: 0, pictures: 0 });
    const report = await reconcilePictures(sql, bucket, options());
    expect(unusedKeys(report.sets.content)).toEqual([MINE, UNUSED].toSorted());
    expect(await keys()).toContain(MINE);
  });

  test("the script prints a report, deletes nothing and refuses --apply", async () => {
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

    const report = await run("--legacy");
    expect(report.exitCode).toBe(0);
    expect(report.stdout).toContain('"legacyRoot"');
    expect(report.stdout).toContain('"young": 1');
    expect(report.stderr).toContain("Report only: pictures:reconcile deletes nothing.");

    const apply = await run("--apply");
    expect(apply.exitCode).not.toBe(0);
    expect(apply.stderr).toContain("pictures:reconcile only reports, and takes only --legacy");
    expect(await keys()).toHaveLength(STORED);
  });
});
