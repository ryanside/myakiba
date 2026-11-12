import type { SQL } from "bun";

const GUARDED_TABLES = [
  "collection",
  "wishlist_item",
  "list_member",
  "entry_to_item",
  "item",
  "entry",
  "list",
  "item_release",
];

/** True while all 8 owner guards fire on the primary. */
export async function ownerGuardsInstalled(sql: SQL): Promise<boolean> {
  const rows = await sql<{ guard: string }[]>`
    SELECT c.relname || '.' || t.tgname AS guard FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    WHERE c.relnamespace = 'public'::regnamespace AND NOT t.tgisinternal AND t.tgenabled IN ('O', 'A')
  `;
  const present = new Set(rows.map((row) => row.guard));
  return GUARDED_TABLES.every((table) => present.has(`${table}.${table}_owner_guard`));
}

const MISMATCHES = {
  "a Collection Item points at an Item its user does not own": `SELECT count(*) FROM collection c
    JOIN item i ON i.id = c.item_id WHERE i.owner_id IS DISTINCT FROM c.user_id`,
  "a Wishlist Item points at an Item its user does not own": `SELECT count(*) FROM wishlist_item w
    JOIN item i ON i.id = w.item_id WHERE i.owner_id IS DISTINCT FROM w.user_id`,
  "a List Member points at an Item its List's user does not own": `SELECT count(*) FROM list_member m
    JOIN list l ON l.id = m.list_id JOIN item i ON i.id = m.item_id
    WHERE i.owner_id IS DISTINCT FROM l.user_id`,
  "a List Member's user is not its List's user": `SELECT count(*) FROM list_member m
    JOIN list l ON l.id = m.list_id WHERE m.user_id IS DISTINCT FROM l.user_id`,
  "a Selected Item Release is not a release of its Collection Item's Item": `SELECT count(*)
    FROM collection c WHERE c.release_id IS NOT NULL AND NOT EXISTS
      (SELECT 1 FROM item_release r WHERE r.id = c.release_id AND r.item_id = c.item_id)`,
  "an Item Entry link joins an Item and an Item Entry of different owners": `SELECT count(*)
    FROM entry_to_item l JOIN item i ON i.id = l.item_id JOIN entry e ON e.id = l.entry_id
    WHERE l.owner_id IS DISTINCT FROM i.owner_id OR l.owner_id IS DISTINCT FROM e.owner_id`,
};

export async function ownershipMismatches(
  sql: SQL,
): Promise<{ readonly mismatch: string; readonly rows: number }[]> {
  const found = [];
  for (const [mismatch, query] of Object.entries(MISMATCHES)) {
    const [{ rows }] = await sql.unsafe<[{ rows: number }]>(`SELECT (${query})::int AS rows`);
    if (rows > 0) found.push({ mismatch, rows });
  }
  return found;
}
