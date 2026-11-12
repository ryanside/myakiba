import type { S3Client, SQL } from "bun";

const KEY_SETS = {
  content: /^items\/[0-9a-f]{64}\.(?:jpg|png|gif|webp|avif)$/u,
  legacyRoot: /^[^/]+\.(?:jpe?g|png|webp|gif|avif)$/iu,
  legacyMfc: /^items\/mfc\/\d+\/[0-9a-f]{16}\.(?:jpg|png|gif|webp|avif)$/u,
} as const;

type KeySet = keyof typeof KEY_SETS;

export const GRACE_MS = 24 * 60 * 60 * 1000;

export type ReconcileOptions = {
  readonly now: Date;
  /** Also report the root-level and `items/mfc/` pictures stored before content keys. */
  readonly legacy: boolean;
};

type StoredObject = { readonly key: string; readonly lastModified: string; readonly size: number };

type SetReport = {
  readonly objects: number;
  readonly shown: number;
  /** Not shown, but stored within the grace period. */
  readonly young: number;
  /** Not shown and older than the grace period. */
  readonly unused: readonly StoredObject[];
};

export type ReconcileReport = {
  readonly legacy: boolean;
  readonly sets: Partial<Record<KeySet, SetReport>>;
};

type Bucket = Pick<S3Client, "list">;

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

async function shownContentKeys(sql: SQL): Promise<Set<string>> {
  const rows = await sql<{ key: string }[]>`
    SELECT DISTINCT image_key AS key FROM item WHERE image_key IS NOT NULL
  `;
  return new Set(rows.map((row) => row.key));
}

async function shownLegacyKeys(sql: SQL): Promise<Set<string>> {
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

/**
 * Reports the stored pictures no Item shows, per key set. It deletes nothing. It lists the bucket
 * before it reads the Items, so an object a save stores after the listing is not seen, and one
 * stored before it counts as young.
 */
export async function reconcilePictures(
  sql: SQL,
  bucket: Bucket,
  { now, legacy }: ReconcileOptions,
): Promise<ReconcileReport> {
  const listed = await listObjects(bucket, legacy ? "" : "items/");
  const shown = {
    content: await shownContentKeys(sql),
    legacy: legacy ? await shownLegacyKeys(sql) : new Set<string>(),
  };
  const cutoff = now.getTime() - GRACE_MS;
  const sets: (readonly [KeySet, Set<string>])[] = [["content", shown.content]];
  if (legacy) sets.push(["legacyRoot", shown.legacy], ["legacyMfc", shown.legacy]);

  const report: Partial<Record<KeySet, SetReport>> = {};
  for (const [name, keys] of sets) {
    const objects = listed.filter((object) => KEY_SETS[name].test(object.key));
    const unshown = objects.filter((object) => !keys.has(object.key));
    const unused = unshown.filter((object) => Date.parse(object.lastModified) < cutoff);
    report[name] = {
      objects: objects.length,
      shown: objects.length - unshown.length,
      young: unshown.length - unused.length,
      unused,
    };
  }
  return { legacy, sets: report };
}
