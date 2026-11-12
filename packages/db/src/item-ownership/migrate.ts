import { SQL } from "bun";
import { installOwnerGuards, ownerGuardsInstalled } from "./guards";

export const MIGRATION_STEPS = [
  "expand",
  "plan",
  "copyItems",
  "copyEntries",
  "copyLinks",
  "copyReleases",
  "repoint",
  "contract",
  "verify",
  "deleteOwnerless",
  "verifyDeleted",
] as const;
type MigrationStep = (typeof MIGRATION_STEPS)[number];

export type MigrationReport =
  | { readonly status: "fresh-database" | "already-migrated" }
  | {
      readonly status: "migrated";
      readonly attempts: number;
      readonly pairs: number;
      readonly copied: Counts<"items" | "entries" | "links" | "releases">;
      readonly foreignReleasesCleared: number;
      /** Expected 0. The owner guards do not cover these, so the run counts them and leaves them. */
      readonly otherUsersListTargets: number;
      readonly repointed: Counts<
        "collection" | "wishlistItem" | "listMemberItem" | "listMemberOwner"
      >;
      readonly deleted: Counts<"items" | "entries" | "links" | "releases">;
      readonly milliseconds: number;
    };

type MigrationOptions = {
  readonly lockTimeout?: string;
  readonly afterStep?: (step: MigrationStep) => void | Promise<void>;
};

export type OwnershipMiss = { readonly check: string; readonly rows: number };

type Counts<K extends string> = { [key in K]: number };

const LOCK_ATTEMPTS = 3;
const LOCK_NOT_AVAILABLE = "55P03";
const DEADLOCK_DETECTED = "40P01";
const LOCK_FAILURES: ReadonlySet<string | undefined> = new Set([
  LOCK_NOT_AVAILABLE,
  DEADLOCK_DETECTED,
]);
const REFERENCE_TABLES = ["collection", "wishlist_item", "list_member"] as const;

// drizzle-kit names a column's foreign key this way, so push finds these as the schema declares them.
const OWNER_KEYS = [
  { name: "item_owner_id_user_id_fk", table: "item" },
  { name: "entry_owner_id_user_id_fk", table: "entry" },
] as const;

const OWNER_INDEXES = [
  {
    name: "item_owner_id_source_external_id_idx",
    table: "item",
    columns: ["owner_id", "source", "external_id"],
  },
  {
    name: "entry_owner_id_source_external_id_idx",
    table: "entry",
    columns: ["owner_id", "source", "external_id"],
  },
] as const;

const OWNERSHIP_CHECKS = [
  {
    check: "a Collection Item points at an Item its user does not own",
    count: `SELECT count(*) FROM collection c JOIN item i ON i.id = c.item_id
      WHERE i.owner_id IS DISTINCT FROM c.user_id`,
  },
  {
    check: "a Wishlist Item points at an Item its user does not own",
    count: `SELECT count(*) FROM wishlist_item w JOIN item i ON i.id = w.item_id
      WHERE i.owner_id IS DISTINCT FROM w.user_id`,
  },
  {
    check: "a List Member points at an Item its List's user does not own",
    count: `SELECT count(*) FROM list_member m JOIN list l ON l.id = m.list_id
      JOIN item i ON i.id = m.item_id WHERE i.owner_id IS DISTINCT FROM l.user_id`,
  },
  {
    check: "a List Member's user is not its List's user",
    count: `SELECT count(*) FROM list_member m JOIN list l ON l.id = m.list_id
      WHERE m.user_id IS DISTINCT FROM l.user_id`,
  },
  {
    check: "a Selected Item Release is not a release of its Collection Item's Item",
    count: `SELECT count(*) FROM collection c WHERE c.release_id IS NOT NULL AND NOT EXISTS
      (SELECT 1 FROM item_release r WHERE r.id = c.release_id AND r.item_id = c.item_id)`,
  },
  {
    check: "an Item Entry link joins an Item and an Item Entry of different owners",
    count: `SELECT count(*) FROM entry_to_item l JOIN item i ON i.id = l.item_id
      JOIN entry e ON e.id = l.entry_id
      WHERE l.owner_id IS DISTINCT FROM i.owner_id OR l.owner_id IS DISTINCT FROM e.owner_id`,
  },
  {
    check: "a table this migration does not re-point references Items or Item Entries",
    count: `SELECT count(*) FROM pg_constraint WHERE contype = 'f'
      AND confrelid IN ('public.item'::regclass, 'public.item_release'::regclass, 'public.entry'::regclass)
      AND conrelid NOT IN ('public.item_release'::regclass, 'public.entry_to_item'::regclass,
        'public.collection'::regclass, 'public.wishlist_item'::regclass, 'public.list_member'::regclass)`,
  },
] as const;

const COPY_CHECKS = [
  {
    check: "an Item copy is missing or differs from its original",
    count: `SELECT count(*) FROM ownership_pair p JOIN item o ON o.id = p.item_id
      LEFT JOIN item c ON c.id = p.copy_id AND c.owner_id = p.user_id
      WHERE c.id IS NULL OR to_jsonb(c) - 'id' - 'owner_id' <> to_jsonb(o) - 'id' - 'owner_id'`,
  },
  {
    check: "an Item Entry copy is missing or differs from its original",
    count: `SELECT count(*) FROM ownership_entry_pair p JOIN entry o ON o.id = p.entry_id
      LEFT JOIN entry c ON c.id = p.copy_id AND c.owner_id = p.user_id
      WHERE c.id IS NULL OR to_jsonb(c) - 'id' - 'owner_id' <> to_jsonb(o) - 'id' - 'owner_id'`,
  },
  {
    check: "an Item Entry link copy is missing or differs from its original",
    count: `SELECT count(*) FROM ownership_pair p JOIN entry_to_item o ON o.item_id = p.item_id
      JOIN ownership_entry_pair e ON e.user_id = p.user_id AND e.entry_id = o.entry_id
      LEFT JOIN entry_to_item c
        ON c.item_id = p.copy_id AND c.entry_id = e.copy_id AND c.owner_id = p.user_id
      WHERE c.item_id IS NULL OR to_jsonb(c) - 'owner_id' - 'entry_id' - 'item_id'
        <> to_jsonb(o) - 'owner_id' - 'entry_id' - 'item_id'`,
  },
  {
    check: "an Item Release copy is missing or differs from its original",
    count: `SELECT count(*) FROM ownership_release_pair p JOIN item_release o ON o.id = p.release_id
      LEFT JOIN item_release c ON c.id = p.copy_id AND c.item_id = p.copy_item_id
      WHERE c.id IS NULL OR to_jsonb(c) - 'id' - 'item_id' <> to_jsonb(o) - 'id' - 'item_id'`,
  },
] as const;

const OWNERLESS_CHECKS = [
  {
    check: "an Item has no owner",
    count: "SELECT count(*) FROM item WHERE owner_id IS NULL",
  },
  {
    check: "an Item Entry has no owner",
    count: "SELECT count(*) FROM entry WHERE owner_id IS NULL",
  },
  {
    check: "an Item Entry link has no owner",
    count: "SELECT count(*) FROM entry_to_item WHERE owner_id IS NULL",
  },
] as const;

type Run = {
  readonly startCounts: Counts<(typeof REFERENCE_TABLES)[number]>;
  pairs: number;
  readonly copied: Counts<"items" | "entries" | "links" | "releases">;
  foreignReleasesCleared: number;
  otherUsersListTargets: number;
  readonly repointed: Counts<"collection" | "wishlistItem" | "listMemberItem" | "listMemberOwner">;
  readonly deleted: Counts<"items" | "entries" | "links" | "releases">;
};

const STEPS = {
  async expand(tx) {
    await tx.unsafe(`
      ALTER TABLE item ADD COLUMN IF NOT EXISTS owner_id text;
      ALTER TABLE entry ADD COLUMN IF NOT EXISTS owner_id text;
      ALTER TABLE entry_to_item ADD COLUMN IF NOT EXISTS owner_id text;
      ALTER TABLE list_member ADD COLUMN IF NOT EXISTS user_id text;
      DROP INDEX IF EXISTS item_source_external_id_idx;
      DROP INDEX IF EXISTS entry_source_external_id_idx;
    `);
  },

  async plan(tx, run) {
    for (const table of REFERENCE_TABLES) {
      run.startCounts[table] = await count(tx, `SELECT count(*) FROM ${table}`);
    }
    await tx.unsafe(`
      CREATE TEMP TABLE ownership_pair ON COMMIT DROP AS
      SELECT r.user_id, r.item_id, ${copyId("item", "r.user_id", "r.item_id")} AS copy_id
      FROM (
        SELECT user_id, item_id FROM collection
        UNION SELECT user_id, item_id FROM wishlist_item
        UNION SELECT l.user_id, m.item_id FROM list_member m JOIN list l ON l.id = m.list_id
          WHERE m.item_id IS NOT NULL
      ) r
      JOIN item i ON i.id = r.item_id
      WHERE i.owner_id IS NULL;
      CREATE UNIQUE INDEX ON ownership_pair (user_id, item_id);
      ANALYZE ownership_pair;
    `);
    run.pairs = await count(tx, "SELECT count(*) FROM ownership_pair");
    run.otherUsersListTargets = await count(
      tx,
      `SELECT count(*) FROM list_member m JOIN list l ON l.id = m.list_id
      LEFT JOIN collection c ON c.id = m.collection_id
      LEFT JOIN "order" o ON o.id = m.order_id
      WHERE (m.collection_id IS NOT NULL AND c.user_id IS DISTINCT FROM l.user_id)
        OR (m.order_id IS NOT NULL AND o.user_id IS DISTINCT FROM l.user_id)`,
    );
  },

  async copyItems(tx, run) {
    const columns = await columnsOf(tx, "item", ["id", "owner_id"]);
    const inserted = await tx.unsafe(`
      INSERT INTO item (id, owner_id, ${columns.list()})
      SELECT p.copy_id, p.user_id, ${columns.list("o")}
      FROM ownership_pair p JOIN item o ON o.id = p.item_id
    `);
    run.copied.items = inserted.count;
  },

  async copyEntries(tx, run) {
    await tx.unsafe(`
      CREATE TEMP TABLE ownership_entry_pair ON COMMIT DROP AS
      SELECT DISTINCT p.user_id, l.entry_id, ${copyId("entry", "p.user_id", "l.entry_id")} AS copy_id
      FROM ownership_pair p JOIN entry_to_item l ON l.item_id = p.item_id;
      CREATE UNIQUE INDEX ON ownership_entry_pair (user_id, entry_id);
      ANALYZE ownership_entry_pair;
    `);
    const columns = await columnsOf(tx, "entry", ["id", "owner_id"]);
    const inserted = await tx.unsafe(`
      INSERT INTO entry (id, owner_id, ${columns.list()})
      SELECT p.copy_id, p.user_id, ${columns.list("o")}
      FROM ownership_entry_pair p JOIN entry o ON o.id = p.entry_id
    `);
    run.copied.entries = inserted.count;
  },

  async copyLinks(tx, run) {
    const columns = await columnsOf(tx, "entry_to_item", ["owner_id", "entry_id", "item_id"]);
    const inserted = await tx.unsafe(`
      INSERT INTO entry_to_item (owner_id, entry_id, item_id, ${columns.list()})
      SELECT p.user_id, e.copy_id, p.copy_id, ${columns.list("o")}
      FROM ownership_pair p
      JOIN entry_to_item o ON o.item_id = p.item_id
      JOIN ownership_entry_pair e ON e.user_id = p.user_id AND e.entry_id = o.entry_id
    `);
    run.copied.links = inserted.count;
  },

  async copyReleases(tx, run) {
    await tx.unsafe(`
      CREATE TEMP TABLE ownership_release_pair ON COMMIT DROP AS
      SELECT p.user_id, r.item_id, r.id AS release_id, p.copy_id AS copy_item_id,
        ${copyId("release", "p.user_id", "r.id::text")} AS copy_id
      FROM ownership_pair p JOIN item_release r ON r.item_id = p.item_id;
      CREATE UNIQUE INDEX ON ownership_release_pair (user_id, release_id);
      ANALYZE ownership_release_pair;
    `);
    const columns = await columnsOf(tx, "item_release", ["id", "item_id"]);
    const inserted = await tx.unsafe(`
      INSERT INTO item_release (id, item_id, ${columns.list()})
      SELECT p.copy_id, p.copy_item_id, ${columns.list("o")}
      FROM ownership_release_pair p JOIN item_release o ON o.id = p.release_id
    `);
    run.copied.releases = inserted.count;
  },

  async repoint(tx, run) {
    run.foreignReleasesCleared = await count(
      tx,
      `SELECT count(*) FROM collection c
      JOIN ownership_pair p ON p.user_id = c.user_id AND p.item_id = c.item_id
      WHERE c.release_id IS NOT NULL AND NOT EXISTS
        (SELECT 1 FROM item_release r WHERE r.id = c.release_id AND r.item_id = c.item_id)`,
    );
    const collection = await tx.unsafe(`
      UPDATE collection c SET item_id = t.copy_item_id, release_id = t.copy_release_id
      FROM (
        SELECT s.id, p.copy_id AS copy_item_id, r.copy_id AS copy_release_id
        FROM collection s
        JOIN ownership_pair p ON p.user_id = s.user_id AND p.item_id = s.item_id
        LEFT JOIN ownership_release_pair r
          ON r.user_id = s.user_id AND r.release_id = s.release_id AND r.item_id = s.item_id
      ) t
      WHERE c.id = t.id
    `);
    const wishlistItem = await tx.unsafe(`
      UPDATE wishlist_item w SET item_id = p.copy_id
      FROM ownership_pair p WHERE p.user_id = w.user_id AND p.item_id = w.item_id
    `);
    const listMemberItem = await tx.unsafe(`
      UPDATE list_member m SET item_id = p.copy_id
      FROM list l JOIN ownership_pair p ON p.user_id = l.user_id
      WHERE l.id = m.list_id AND p.item_id = m.item_id
    `);
    const listMemberOwner = await tx.unsafe(`
      UPDATE list_member m SET user_id = l.user_id
      FROM list l WHERE l.id = m.list_id AND m.user_id IS DISTINCT FROM l.user_id
    `);
    run.repointed.collection = collection.count;
    run.repointed.wishlistItem = wishlistItem.count;
    run.repointed.listMemberItem = listMemberItem.count;
    run.repointed.listMemberOwner = listMemberOwner.count;
  },

  async contract(tx) {
    await tx.unsafe("ALTER TABLE list_member ALTER COLUMN user_id SET NOT NULL");
    const present = await foreignKeyNames(tx);
    for (const key of OWNER_KEYS.filter((candidate) => !present.has(candidate.name))) {
      await tx.unsafe(
        `ALTER TABLE ${ident(key.table)} ADD CONSTRAINT ${ident(key.name)}
        FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action`,
      );
    }
    for (const index of OWNER_INDEXES) {
      await tx.unsafe(
        `CREATE UNIQUE INDEX IF NOT EXISTS ${ident(index.name)} ON ${ident(index.table)}
        USING btree (${index.columns.map(ident).join(",")})`,
      );
    }
    await installOwnerGuards(tx);
  },

  async verify(tx, run) {
    await verifyRun(tx, run, COPY_CHECKS);
  },

  // Every reference now reaches a copy, so the originals are what no user can reach.
  async deleteOwnerless(tx, run) {
    const links = await tx`DELETE FROM entry_to_item WHERE owner_id IS NULL`;
    const releases = await tx`
      DELETE FROM item_release r USING item i WHERE i.id = r.item_id AND i.owner_id IS NULL
    `;
    const items = await tx`DELETE FROM item WHERE owner_id IS NULL`;
    const entries = await tx`DELETE FROM entry WHERE owner_id IS NULL`;
    run.deleted.links = links.count;
    run.deleted.releases = releases.count;
    run.deleted.items = items.count;
    run.deleted.entries = entries.count;
  },

  async verifyDeleted(tx, run) {
    await verifyRun(tx, run, OWNERLESS_CHECKS);
  },
} satisfies Record<MigrationStep, (tx: SQL, run: Run) => Promise<void>>;

/**
 * Gives every user their own copy of each pre-ownership Item they reference, with its Item
 * Releases, Item Entries and links, re-points their references to it, deletes every row without an
 * owner, and installs the owner guards. One transaction: a crash or a failed check leaves the database as it was. A fresh database
 * and a migrated one are left alone.
 */
export async function migrateItemOwnership(
  sql: SQL,
  options: MigrationOptions = {},
): Promise<MigrationReport> {
  const started = performance.now();
  const [table] = await sql<[{ exists: boolean }]>`
    SELECT to_regclass('public.item') IS NOT NULL AS exists
  `;
  if (!table.exists) return { status: "fresh-database" };
  if (await isItemOwnershipMigrated(sql)) return { status: "already-migrated" };

  for (let attempt = 1; ; attempt++) {
    try {
      // Each step must see what committed while the run waited for its locks, whatever the
      // database's default isolation.
      const run = await sql.begin("ISOLATION LEVEL READ COMMITTED", async (tx) =>
        runSteps(tx, options),
      );
      return {
        status: "migrated",
        attempts: attempt,
        pairs: run.pairs,
        copied: run.copied,
        foreignReleasesCleared: run.foreignReleasesCleared,
        otherUsersListTargets: run.otherUsersListTargets,
        repointed: run.repointed,
        deleted: run.deleted,
        milliseconds: Math.round(performance.now() - started),
      };
    } catch (error) {
      const lockFailed = error instanceof SQL.PostgresError && LOCK_FAILURES.has(error.errno);
      if (attempt === LOCK_ATTEMPTS || !lockFailed) throw error;
    }
  }
}

/** The run installs the owner guards last, in its transaction, so they mark a finished run. */
export async function isItemOwnershipMigrated(sql: SQL): Promise<boolean> {
  return ownerGuardsInstalled(sql);
}

export async function verifyItemOwnership(sql: SQL): Promise<OwnershipMiss[]> {
  return missesOf(sql, OWNERSHIP_CHECKS);
}

function describeMisses(misses: readonly OwnershipMiss[]): string {
  return misses.map((miss) => `${miss.check} (${miss.rows})`).join("; ");
}

async function runSteps(tx: SQL, options: MigrationOptions): Promise<Run> {
  await tx`SELECT set_config('lock_timeout', ${options.lockTimeout ?? "10s"}, true)`;
  // The owner keys into "user" need this lock. Taking it first means the run never waits for it
  // while it holds the Item tables.
  await tx`LOCK TABLE "user" IN SHARE ROW EXCLUSIVE MODE`;
  await tx.unsafe(
    `LOCK TABLE item, item_release, entry, entry_to_item, collection, wishlist_item, list, list_member
    IN ACCESS EXCLUSIVE MODE`,
  );
  const run: Run = {
    startCounts: { collection: 0, wishlist_item: 0, list_member: 0 },
    pairs: 0,
    copied: { items: 0, entries: 0, links: 0, releases: 0 },
    foreignReleasesCleared: 0,
    otherUsersListTargets: 0,
    repointed: { collection: 0, wishlistItem: 0, listMemberItem: 0, listMemberOwner: 0 },
    deleted: { items: 0, entries: 0, links: 0, releases: 0 },
  };
  for (const step of MIGRATION_STEPS) {
    await STEPS[step](tx, run);
    await options.afterStep?.(step);
  }
  return run;
}

/** Fails the run unless every reference still reaches its user's own Item and these checks find nothing. */
async function verifyRun(
  tx: SQL,
  run: Run,
  checks: readonly { readonly check: string; readonly count: string }[],
): Promise<void> {
  const misses = [...(await verifyItemOwnership(tx)), ...(await missesOf(tx, checks))];
  for (const table of REFERENCE_TABLES) {
    const now = await count(tx, `SELECT count(*) FROM ${table}`);
    if (now !== run.startCounts[table]) {
      misses.push({
        check: `${table} has ${now} rows instead of ${run.startCounts[table]}`,
        rows: Math.abs(now - run.startCounts[table]),
      });
    }
  }
  if (misses.length > 0)
    throw new Error(`Item ownership migration failed: ${describeMisses(misses)}`);
}

// A hash of the owner and the original, so a run after a crash writes the ids a clean run would.
// The owner's length comes first, so no two pairs hash the same text even when an id holds a colon.
function copyId(kind: "item" | "entry" | "release", ownerId: string, originalId: string): string {
  const text = `'${kind}:' || length(${ownerId}) || ':' || ${ownerId} || ':' || ${originalId}`;
  const hash = `encode(sha256(convert_to(${text}, 'UTF8')), 'hex')`;
  // A release id is a version 8 UUID, which `z.uuid()` accepts.
  if (kind === "release") {
    return `overlay(overlay(left(${hash}, 32) placing '8' from 13) placing '8' from 17)::uuid`;
  }
  return `'${kind.charAt(0)}' || left(${hash}, 23)`;
}

async function columnsOf(tx: SQL, table: string, except: readonly string[]) {
  const rows = await tx<{ column_name: string }[]>`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = ${table}
    ORDER BY ordinal_position
  `;
  const names = rows.map((row) => row.column_name).filter((name) => !except.includes(name));
  return {
    list: (alias?: string) =>
      names.map((name) => (alias ? `${alias}.${ident(name)}` : ident(name))).join(", "),
  };
}

async function foreignKeyNames(sql: SQL): Promise<Set<string>> {
  const rows = await sql<{ conname: string }[]>`
    SELECT conname FROM pg_constraint
    WHERE contype = 'f' AND connamespace = 'public'::regnamespace
  `;
  return new Set(rows.map((row) => row.conname));
}

async function missesOf(
  sql: SQL,
  checks: readonly { readonly check: string; readonly count: string }[],
): Promise<OwnershipMiss[]> {
  const misses: OwnershipMiss[] = [];
  for (const { check, count: query } of checks) {
    const rows = await count(sql, query);
    if (rows > 0) misses.push({ check, rows });
  }
  return misses;
}

async function count(sql: SQL, query: string): Promise<number> {
  const [row] = await sql.unsafe<[{ rows: number }]>(`SELECT (${query})::int AS rows`);
  return row.rows;
}

function ident(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}
