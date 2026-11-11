import type { SQL } from "bun";
import { describeMisses, isItemOwnershipMigrated, verifyItemOwnership } from "./migrate";

const PUBLIC_PICTURE_PREFIX = "items/mfc/";

/** The rows without an owner that items:cleanup deletes, and the picture keys only those rows show. */
export type CleanupPlan = {
  readonly items: readonly string[];
  readonly releases: readonly string[];
  readonly entries: readonly string[];
  readonly links: readonly { readonly entryId: string; readonly itemId: string }[];
  readonly pictureKeys: readonly string[];
};

export async function planItemCleanup(sql: SQL): Promise<CleanupPlan> {
  return sql.begin("ISOLATION LEVEL REPEATABLE READ READ ONLY", async (tx) => readPlan(tx));
}

/**
 * Deletes every row without an owner in one transaction and answers what it deleted. It leaves
 * picture objects alone.
 */
export async function deleteRetiredItems(sql: SQL): Promise<CleanupPlan> {
  return sql.begin(async (tx) => {
    const plan = await readPlan(tx);
    const items = await tx`DELETE FROM item WHERE owner_id IS NULL`;
    const entries = await tx`DELETE FROM entry WHERE owner_id IS NULL`;
    const [left] = await tx<[{ releases: number; links: number }]>`
      SELECT
        (SELECT count(*) FROM item_release r JOIN item i ON i.id = r.item_id
          WHERE i.owner_id IS NULL)::int AS releases,
        (SELECT count(*) FROM entry_to_item WHERE owner_id IS NULL)::int AS links
    `;
    if (items.count !== plan.items.length || entries.count !== plan.entries.length) {
      throw new Error(
        `items:cleanup planned ${plan.items.length} Items and ${plan.entries.length} Item Entries but deleted ${items.count} and ${entries.count}. Nothing was deleted; run it again.`,
      );
    }
    if (left.releases > 0 || left.links > 0) {
      throw new Error(
        `items:cleanup left ${left.releases} Item Releases and ${left.links} Item Entry links without an owner. Nothing was deleted.`,
      );
    }
    const misses = await verifyItemOwnership(tx);
    if (misses.length > 0) {
      throw new Error(`items:cleanup broke owner closure: ${describeMisses(misses)}`);
    }
    return plan;
  });
}

async function readPlan(tx: SQL): Promise<CleanupPlan> {
  if (!(await isItemOwnershipMigrated(tx))) {
    throw new Error(
      "Run the Item ownership migration before items:cleanup. Until it runs no Item has an owner, and deleting one deletes the Collection Items on it.",
    );
  }
  const misses = await verifyItemOwnership(tx);
  if (misses.length > 0) {
    throw new Error(
      `items:cleanup found references to Items without an owner: ${describeMisses(misses)}`,
    );
  }
  const items = await tx<{ id: string }[]>`SELECT id FROM item WHERE owner_id IS NULL ORDER BY id`;
  const releases = await tx<{ id: string }[]>`
    SELECT r.id FROM item_release r JOIN item i ON i.id = r.item_id
    WHERE i.owner_id IS NULL ORDER BY r.id
  `;
  const entries = await tx<
    { id: string }[]
  >`SELECT id FROM entry WHERE owner_id IS NULL ORDER BY id`;
  const links = await tx<{ entryId: string; itemId: string }[]>`
    SELECT entry_id AS "entryId", item_id AS "itemId" FROM entry_to_item
    WHERE owner_id IS NULL ORDER BY entry_id, item_id
  `;
  const pictures = await tx<{ image: string; owned: boolean }[]>`
    SELECT DISTINCT image, owner_id IS NOT NULL AS owned FROM item WHERE image IS NOT NULL
  `;
  const shown = new Set(
    pictures.filter((picture) => picture.owned).map(({ image }) => keyOf(image)),
  );
  const pictureKeys = new Set(
    pictures
      .filter((picture) => !picture.owned)
      .map(({ image }) => keyOf(image))
      .filter((key): key is string => key !== undefined && !shown.has(key)),
  );
  return {
    items: items.map((row) => row.id),
    releases: releases.map((row) => row.id),
    entries: entries.map((row) => row.id),
    links: [...links],
    pictureKeys: [...pictureKeys].toSorted(),
  };
}

function keyOf(image: string): string | undefined {
  const key = URL.parse(image)?.pathname.slice(1);
  return key?.startsWith(PUBLIC_PICTURE_PREFIX) ? key : undefined;
}
