import type { S3Client, SQL } from "bun";

/** A picture stored by its content: `items/<sha256>.<ext>`. */
const CONTENT_KEY = /^items\/[0-9a-f]{64}\.(?:jpg|png|gif|webp|avif)$/u;

/**
 * Pictures stored before keys were content addresses: main's worker put MFC's own file name at the
 * bucket root, and staging put `items/mfc/<id>/<hash16>.<ext>`.
 */
const isLegacyKey = (key: string) => !key.includes("/") || key.startsWith("items/mfc/");

/**
 * A save stores its picture before its transaction commits, so a young object may be one a save
 * is about to show.
 */
export const GRACE_MS = 24 * 60 * 60 * 1000;

export type ReconcileOptions = {
  readonly now: Date;
  /** Also reconcile the root-level and `items/mfc/` pictures stored before content keys. */
  readonly legacy: boolean;
  readonly apply: boolean;
  /** Deletes nothing when there is more garbage than this. */
  readonly maxDelete: number;
};

type StoredObject = { readonly key: string; readonly lastModified: string; readonly size: number };

export type ReconcileReport = {
  readonly applied: boolean;
  readonly legacy: boolean;
  readonly counts: {
    readonly objects: number;
    readonly shown: number;
    readonly young: number;
    readonly garbage: number;
    readonly deleted: number;
  };
  readonly garbage: readonly StoredObject[];
  /** Garbage that was stored again, or that an Item showed, by the time of its delete. */
  readonly kept: readonly string[];
  /** Why nothing was deleted, when apply was asked for. */
  readonly refused: string | null;
};

type Bucket = Pick<S3Client, "list" | "stat" | "delete">;

async function listObjects(bucket: Bucket, prefix: string): Promise<StoredObject[]> {
  const objects: StoredObject[] = [];
  let continuationToken: string | undefined;
  do {
    const page = await bucket.list({ prefix, maxKeys: 1000, continuationToken });
    for (const object of page.contents ?? []) {
      objects.push({
        key: object.key,
        lastModified: new Date(object.lastModified ?? 0).toISOString(),
        size: object.size ?? 0,
      });
    }
    continuationToken = page.isTruncated ? page.nextContinuationToken : undefined;
  } while (continuationToken);
  return objects;
}

/**
 * Every key an Item's image could name. An image is the public URL of its key, whatever host or
 * path-style bucket prefix it was written with, so each trailing part of its path counts. Reading
 * more keys as shown can only keep more objects.
 */
async function shownKeys(sql: SQL): Promise<Set<string>> {
  const rows = await sql<{ image: string }[]>`
    SELECT DISTINCT image FROM item WHERE image IS NOT NULL
  `;
  const keys = new Set<string>();
  for (const { image } of rows) {
    const parts = (URL.parse(image)?.pathname ?? image).split("/").filter(Boolean);
    for (let start = 0; start < parts.length; start += 1) {
      keys.add(parts.slice(start).join("/"));
    }
  }
  return keys;
}

async function isShown(sql: SQL, key: string): Promise<boolean> {
  const [row] = await sql<{ shown: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM item WHERE right(image, ${key.length + 1}) = ${`/${key}`}
    ) AS shown
  `;
  return row?.shown ?? true;
}

/**
 * Finds stored pictures no Item shows that are older than the grace period, and deletes them when
 * asked. It lists the bucket before it reads the Items, so an object a save stores after the
 * listing is not seen, and one stored before it is young. Just before each delete it reads the
 * object's LastModified again and asks the database again, and keeps the object if either moved.
 * It never considers a key outside the content keys, or the legacy keys with `legacy`.
 */
export async function reconcilePictures(
  sql: SQL,
  bucket: Bucket,
  { now, legacy, apply, maxDelete }: ReconcileOptions,
): Promise<ReconcileReport> {
  const listed = await listObjects(bucket, legacy ? "" : "items/");
  const objects = listed.filter(({ key }) => CONTENT_KEY.test(key) || (legacy && isLegacyKey(key)));
  const shown = await shownKeys(sql);
  const cutoff = now.getTime() - GRACE_MS;
  const unshown = objects.filter((object) => !shown.has(object.key));
  const garbage = unshown.filter((object) => Date.parse(object.lastModified) < cutoff);
  const refused =
    apply && garbage.length > maxDelete
      ? `${garbage.length} objects are garbage, more than --max-delete ${maxDelete}, so nothing was deleted.`
      : null;

  const deleted: string[] = [];
  const kept: string[] = [];
  if (apply && refused === null) {
    for (const object of garbage) {
      const current = await bucket.stat(object.key);
      // A HEAD's Last-Modified has whole seconds, and a listing's may have milliseconds.
      const listedAt = Math.floor(Date.parse(object.lastModified) / 1000);
      const storedAt = Math.floor(current.lastModified.getTime() / 1000);
      if (storedAt !== listedAt || (await isShown(sql, object.key))) {
        kept.push(object.key);
        continue;
      }
      await bucket.delete(object.key);
      deleted.push(object.key);
    }
  }

  return {
    applied: apply && refused === null,
    legacy,
    counts: {
      objects: objects.length,
      shown: objects.length - unshown.length,
      young: unshown.length - garbage.length,
      garbage: garbage.length,
      deleted: deleted.length,
    },
    garbage,
    kept,
    refused,
  };
}
