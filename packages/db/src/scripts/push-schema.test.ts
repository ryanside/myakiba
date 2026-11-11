import { expect, test } from "bun:test";
import path from "node:path";
import type { SQL } from "bun";
import { snapshot, testDatabases } from "../../test/database";
import { MAIN_SCHEMA } from "../../test/main-schema";
import {
  PICTURE_BYTES_COLUMN,
  PUSH_TIMEOUT,
  REPEATED_ON_EVERY_PUSH,
  pushSchema,
} from "../../test/push";
import { ownerGuardsInstalled } from "../item-ownership/guards";
import {
  isItemOwnershipMigrated,
  migrateItemOwnership,
  verifyItemOwnership,
} from "../item-ownership/migrate";
import { seedSharedItems } from "../item-ownership/seed";

const databases = testDatabases();

async function dbPush(url: string) {
  const child = Bun.spawn(["bun", "src/scripts/push-schema.ts"], {
    cwd: path.join(import.meta.dir, "../.."),
    env: { ...process.env, DATABASE_URL: url },
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { exitCode, output: `${stdout}\n${stderr}` };
}

test(
  "db-push migrates a legacy database, pushes with no prompt and no lost row, and installs the guards; a second run changes nothing",
  async () => {
    const seeded = await databases.legacyTemplate(seedSharedItems);
    const migratedOnly = await databases.create(seeded);
    await migrateItemOwnership(migratedOnly.sql);
    const expected = await snapshot(migratedOnly.sql);

    const { sql, url } = await databases.create(seeded);
    const first = await dbPush(url);
    expect(first.exitCode).toBe(0);
    expect(first.output).toContain('Item ownership migration: {"status":"migrated"');
    expect(first.output).toContain("Item owner guards installed.");
    const pushed = await snapshot(sql);
    expect(pushed.rows).toEqual(expected.rows);
    expect(pushed.triggers).toEqual(expected.triggers);
    expect(pushed.functions).toEqual(expected.functions);
    expect(await ownerGuardsInstalled(sql)).toBe(true);
    expect(await verifyItemOwnership(sql)).toEqual([]);

    const second = await dbPush(url);
    expect(second.exitCode).toBe(0);
    expect(second.output).toContain('Item ownership migration: {"status":"already-migrated"}');
    expect(await snapshot(sql)).toEqual(pushed);
  },
  PUSH_TIMEOUT * 2,
);

test(
  "db-push skips the migration on a fresh database and installs the guards; a second run changes nothing",
  async () => {
    const { sql, url } = await databases.create();
    const first = await dbPush(url);
    expect(first.exitCode).toBe(0);
    expect(first.output).toContain('Item ownership migration: {"status":"fresh-database"}');
    expect(first.output).toContain("Item owner guards installed.");
    expect(await ownerGuardsInstalled(sql)).toBe(true);
    const pushed = await snapshot(sql);

    const second = await dbPush(url);
    expect(second.exitCode).toBe(0);
    expect(second.output).toContain('Item ownership migration: {"status":"already-migrated"}');
    expect(await snapshot(sql)).toEqual(pushed);
  },
  PUSH_TIMEOUT * 2,
);

// A database that ran the per-item import work also has this table, which references
// data_transfer_import, so the drop order matters.
const MAIN_SEED = `
CREATE TABLE "data_transfer_import_item" (
  "user_id" text NOT NULL,
  "item_external_id" integer NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "error_reason" text,
  "rows" jsonb NOT NULL,
  "row_count" integer NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "data_transfer_import_item_user_id_item_external_id_pk" PRIMARY KEY("user_id","item_external_id")
);
ALTER TABLE "data_transfer_import_item" ADD CONSTRAINT "data_transfer_import_item_user_id_data_transfer_import_user_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."data_transfer_import"("user_id") ON DELETE cascade ON UPDATE no action;

INSERT INTO "user" (id, name, email, email_verified, username, created_at, updated_at) VALUES
  ('u1', 'User One', 'u1@example.com', true, 'user_one', '2026-01-01 09:00', '2026-01-01 09:00'),
  ('u2', 'User Two', 'u2@example.com', true, 'user_two', '2026-01-02 09:00', '2026-01-02 09:00'),
  ('u3', 'User Three', 'u3@example.com', false, 'user_three', '2026-01-03 09:00', '2026-01-03 09:00');

INSERT INTO account (id, account_id, provider_id, user_id, password, created_at, updated_at) VALUES
  ('acc-1', 'u1', 'credential', 'u1', 'hash', '2026-01-01 09:00', '2026-01-01 09:00');

INSERT INTO item (id, external_id, source, title, mfc_title, category, version, scale, height,
  mfc_metadata_version, image, created_at, updated_at)
VALUES
  ('item-a', 1001, 'mfc', 'Item A', 'Item A (MFC)', 'Prepainted', '{Standard,Deluxe}', '1/7', 250,
    3, 'https://static.myakiba.app/items/mfc/1001/aaaaaaaaaaaaaaaa.jpg', '2026-01-10 10:00', '2026-02-10 10:00'),
  ('item-b', 1002, 'mfc', 'Item B', NULL, 'Plushes', '{}', 'n/a', NULL,
    3, 'https://static.myakiba.app/items/mfc/1002/bbbbbbbbbbbbbbbb.jpg', '2026-01-11 10:00', '2026-01-11 10:00'),
  ('item-c', NULL, 'custom', 'Item C', NULL, 'Garage Kits', NULL, '1/6', 300,
    0, NULL, '2026-01-12 10:00', '2026-01-12 10:00'),
  ('item-d', 1004, 'mfc', 'Item D', NULL, 'Books', '{}', 'n/a', NULL,
    3, NULL, '2026-01-13 10:00', '2026-01-13 10:00');

INSERT INTO item_release (id, item_id, date, type, price, price_currency, barcode, created_at, updated_at) VALUES
  ('a0000000-0000-4000-8000-000000000001', 'item-a', '2026-03-01', 'Standard', 15000, 'JPY', '4580000000011', '2026-01-10 10:00', '2026-01-10 10:00'),
  ('a0000000-0000-4000-8000-000000000002', 'item-a', '2026-06-01', 'Resale', 16000, 'JPY', NULL, '2026-01-10 10:00', '2026-01-10 10:00'),
  ('b0000000-0000-4000-8000-000000000001', 'item-b', '2026-04-01', NULL, 3000, 'JPY', NULL, '2026-01-11 10:00', '2026-01-11 10:00');

INSERT INTO entry (id, external_id, source, category, name, created_at, updated_at) VALUES
  ('entry-1', 2001, 'mfc', 'Characters', 'Character One', '2026-01-10 10:00', '2026-01-10 10:00'),
  ('entry-2', 2002, 'mfc', 'Artists', 'Artist Two', '2026-01-10 10:00', '2026-01-18 10:00'),
  ('entry-3', NULL, 'custom', 'Companies', 'Custom Maker', '2026-01-12 10:00', '2026-01-12 10:00');

INSERT INTO entry_to_item (entry_id, item_id, role, roles, source_label, material_percentage, created_at, updated_at) VALUES
  ('entry-1', 'item-a', NULL, '{}', NULL, NULL, '2026-01-10 10:00', '2026-01-10 10:00'),
  ('entry-2', 'item-a', 'Sculptor', '{Sculptor,Painter}', 'Sculptor & Painter', NULL, '2026-01-10 10:00', '2026-01-10 10:00'),
  ('entry-1', 'item-b', NULL, '{}', NULL, NULL, '2026-01-11 10:00', '2026-01-11 10:00'),
  ('entry-3', 'item-c', NULL, '{}', 'Maker', NULL, '2026-01-12 10:00', '2026-01-12 10:00');

INSERT INTO "order" (id, user_id, title, shop, status, created_at, updated_at) VALUES
  ('order-1', 'u1', 'Spring order', 'Shop One', 'Paid', '2026-02-01 10:00', '2026-02-01 10:00'),
  ('order-2', 'u2', 'Summer order', 'Shop Two', 'Ordered', '2026-02-02 10:00', '2026-02-02 10:00');

INSERT INTO collection (id, user_id, item_id, order_id, status, release_id, price, tags, created_at, updated_at) VALUES
  ('col-1', 'u1', 'item-a', 'order-1', 'Owned', 'a0000000-0000-4000-8000-000000000001', 15000, '{gift}', '2026-02-01 10:00', '2026-02-05 10:00'),
  ('col-2', 'u2', 'item-a', 'order-2', 'Ordered', 'a0000000-0000-4000-8000-000000000002', 16000, '{}', '2026-02-02 10:00', '2026-02-02 10:00'),
  ('col-3', 'u3', 'item-b', NULL, 'Owned', 'b0000000-0000-4000-8000-000000000001', 3000, '{}', '2026-02-03 10:00', '2026-02-03 10:00'),
  ('col-4', 'u2', 'item-c', NULL, 'Owned', NULL, 5000, '{}', '2026-02-04 10:00', '2026-02-04 10:00');

INSERT INTO wishlist_item (id, user_id, item_id, position, created_at, updated_at) VALUES
  ('wish-1', 'u3', 'item-a', 0, '2026-02-06 10:00', '2026-02-06 10:00'),
  ('wish-2', 'u1', 'item-b', 0, '2026-02-07 10:00', '2026-02-07 10:00');

INSERT INTO list (id, user_id, title, position, created_at, updated_at) VALUES
  ('list-1', 'u1', 'Favorites', 0, '2026-02-08 10:00', '2026-02-08 10:00'),
  ('list-2', 'u2', 'Shelf', 0, '2026-02-08 10:00', '2026-02-08 10:00'),
  ('list-3', 'u3', 'Preorders', 0, '2026-02-08 10:00', '2026-02-08 10:00');

INSERT INTO list_member (id, list_id, item_id, collection_id, order_id, position, created_at) VALUES
  ('member-1', 'list-1', 'item-b', NULL, NULL, 0, '2026-02-09 10:00'),
  ('member-2', 'list-1', NULL, 'col-1', NULL, 1, '2026-02-09 10:00'),
  ('member-3', 'list-1', NULL, NULL, 'order-1', 2, '2026-02-09 10:00'),
  ('member-4', 'list-2', 'item-a', NULL, NULL, 0, '2026-02-09 10:00'),
  ('member-5', 'list-2', NULL, 'col-2', NULL, 1, '2026-02-09 10:00'),
  ('member-6', 'list-3', NULL, 'col-3', NULL, 0, '2026-02-09 10:00');

INSERT INTO sync_session (id, user_id, sync_type, status, order_id, total_items, success_count, request_payload, created_at, updated_at, completed_at) VALUES
  ('sync-1', 'u1', 'order', 'completed', 'order-1', 2, 2, '{"type":"order"}', '2026-01-20 10:00', '2026-01-20 10:05', '2026-01-20 10:05'),
  ('sync-2', 'u2', 'csv', 'failed', NULL, 1, 0, '{"type":"csv"}', '2026-01-21 10:00', '2026-01-21 10:05', NULL);

INSERT INTO sync_session_item (id, sync_session_id, item_external_id, status, created_at, updated_at) VALUES
  ('sync-item-1', 'sync-1', 1001, 'scraped', '2026-01-20 10:00', '2026-01-20 10:01'),
  ('sync-item-2', 'sync-1', 1002, 'scraped', '2026-01-20 10:00', '2026-01-20 10:02'),
  ('sync-item-3', 'sync-2', 1004, 'failed', '2026-01-21 10:00', '2026-01-21 10:01');

INSERT INTO data_transfer_import (user_id, import_id, job_id, file_name, status, phase) VALUES
  ('u2', 'import-1', 'job-1', 'export.json', 'completed', 'completed');

INSERT INTO data_transfer_import_item (user_id, item_external_id, status, rows, row_count) VALUES
  ('u2', 1004, 'pending', '[]', 0);
`;

const RETIRED_TABLES = [
  "data_transfer_import",
  "data_transfer_import_item",
  "sync_session",
  "sync_session_item",
];

// Users reach Items only through their Collection, Wishlist and List Members, so this is what each
// user sees of the Item Database, without the ids the migration gives each user's copy.
async function whatUsersSee(sql: SQL) {
  const [view] = await sql<[{ rows: unknown }]>`
    WITH item_view AS (
      SELECT i.id, jsonb_build_object(
        'item', to_jsonb(i) - '{id,owner_id,content_label,mfc_rating_id,image_bytes}'::text[],
        'releases', (
          SELECT coalesce(jsonb_agg(to_jsonb(r) - '{id,item_id}'::text[] ORDER BY r.date, r.price), '[]')
          FROM item_release r WHERE r.item_id = i.id
        ),
        'entries', (
          SELECT coalesce(jsonb_agg(jsonb_build_object(
            'link', to_jsonb(l) - '{entry_id,item_id,owner_id}'::text[],
            'entry', to_jsonb(e) - '{id,owner_id}'::text[]
          ) ORDER BY e.name), '[]')
          FROM entry_to_item l JOIN entry e ON e.id = l.entry_id WHERE l.item_id = i.id
        )
      ) AS item
      FROM item i
    ), seen AS (
      SELECT jsonb_build_object(
        'collection', to_jsonb(c) - '{item_id,release_id}'::text[],
        'item', v.item,
        'release', to_jsonb(r) - '{id,item_id}'::text[]
      ) AS row
      FROM collection c JOIN item_view v ON v.id = c.item_id
      LEFT JOIN item_release r ON r.id = c.release_id
      UNION ALL
      SELECT jsonb_build_object('wishlist', to_jsonb(w) - 'item_id', 'item', v.item)
      FROM wishlist_item w JOIN item_view v ON v.id = w.item_id
      UNION ALL
      SELECT jsonb_build_object(
        'member', to_jsonb(m) - '{item_id,user_id}'::text[],
        'listOwner', l.user_id,
        'item', v.item
      )
      FROM list_member m JOIN list l ON l.id = m.list_id LEFT JOIN item_view v ON v.id = m.item_id
    )
    SELECT jsonb_agg(row ORDER BY row::text) AS rows FROM seen
  `;
  const { rows } = await snapshot(sql);
  return {
    references: view.rows,
    users: rows.user,
    accounts: rows.account,
    orders: rows.order,
    lists: rows.list,
  };
}

async function tables(sql: SQL) {
  const rows = await sql<{ name: string }[]>`
    SELECT table_name AS name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name
  `;
  return rows.map((row) => row.name);
}

const migrationReport = (output: string) =>
  /Item ownership migration: (.*)/
    .exec(output)?.[1]
    ?.replace(/"milliseconds":\d+/, '"milliseconds":0');

const mainTemplate = () =>
  databases.legacyTemplate((sql) => sql.unsafe(MAIN_SEED).then(() => {}), MAIN_SCHEMA);

test(
  "db-push takes a database in main's shape to the owned schema with no prompt: it drops only the retired tables, keeps what every user sees and installs the guards; a second run changes nothing",
  async () => {
    const fresh = await databases.create();
    const freshPush = await dbPush(fresh.url);
    expect(freshPush.exitCode).toBe(0);
    const pushedFresh = await snapshot(fresh.sql);

    const { sql, url } = await databases.create(await mainTemplate());
    const seen = await whatUsersSee(sql);
    expect(seen.references).toHaveLength(12);
    const before = await tables(sql);
    expect(before).toEqual(expect.arrayContaining(RETIRED_TABLES));

    const first = await dbPush(url);
    expect(first.output).not.toContain("created or renamed");
    expect(first.exitCode).toBe(0);
    for (const dropped of [
      "data_transfer_import_item (1 rows)",
      "data_transfer_import (1 rows)",
      "sync_session_item (3 rows)",
      "sync_session (2 rows)",
    ]) {
      expect(first.output).toContain(`Dropped retired table ${dropped}.`);
    }
    expect(migrationReport(first.output)).toBe(
      '{"status":"migrated","attempts":1,"pairs":6,"copied":{"items":6,"entries":7,"links":9,"releases":8},"foreignReleasesCleared":0,"otherUsersListTargets":0,"repointed":{"collection":4,"wishlistItem":2,"listMemberItem":2,"listMemberOwner":6},"milliseconds":0}',
    );
    expect(first.output).toContain("Item owner guards installed.");

    expect(await tables(sql)).toEqual(
      [...before.filter((table) => !RETIRED_TABLES.includes(table)), "add_commit"].toSorted(),
    );
    expect(await whatUsersSee(sql)).toEqual(seen);
    expect(await ownerGuardsInstalled(sql)).toBe(true);
    expect(await verifyItemOwnership(sql)).toEqual([]);
    const pushed = await snapshot(sql);
    expect({
      columns: pushed.columns,
      indexes: pushed.indexes,
      constraints: pushed.constraints,
      triggers: pushed.triggers,
    }).toEqual({
      columns: pushedFresh.columns,
      indexes: pushedFresh.indexes,
      constraints: pushedFresh.constraints,
      triggers: pushedFresh.triggers,
    });

    const second = await dbPush(url);
    expect(second.exitCode).toBe(0);
    expect(second.output).not.toContain("Dropped retired table");
    expect(second.output).toContain('Item ownership migration: {"status":"already-migrated"}');
    expect(await snapshot(sql)).toEqual(pushed);
  },
  PUSH_TIMEOUT * 3,
);

test(
  "a push that fails after the migration says the database is migrated but not pushed, and db-push run again once the cause is fixed finishes the deploy",
  async () => {
    const { sql, url } = await databases.create(await mainTemplate());
    const seen = await whatUsersSee(sql);
    // A table the schema does not declare, holding a row, makes push ask before dropping it.
    await sql`CREATE TABLE stray (id integer)`;
    await sql`INSERT INTO stray VALUES (1)`;

    const failed = await dbPush(url);
    expect(failed.exitCode).toBe(1);
    expect(failed.output).toContain(
      "The Item ownership migration above has committed, so the database is migrated but not pushed.",
    );
    expect(await isItemOwnershipMigrated(sql)).toBe(true);
    expect(await tables(sql)).not.toEqual(expect.arrayContaining(["sync_session"]));

    await sql`DROP TABLE stray`;
    const rerun = await dbPush(url);
    expect(rerun.exitCode).toBe(0);
    expect(rerun.output).toContain('Item ownership migration: {"status":"already-migrated"}');
    expect(rerun.output).toContain("Item owner guards installed.");
    expect(await whatUsersSee(sql)).toEqual(seen);
    expect(await verifyItemOwnership(sql)).toEqual([]);
  },
  PUSH_TIMEOUT * 2,
);

test(
  "push adds the picture size column to a database in the owned shape with no prompt and no lost row; a second push changes nothing",
  async () => {
    const { sql, url } = await databases.create();
    const fresh = await dbPush(url);
    expect(fresh.exitCode).toBe(0);
    await sql`ALTER TABLE item DROP COLUMN image_bytes`;
    await sql`
      INSERT INTO "user" (id, name, email, email_verified, username)
      VALUES ('u1', 'User One', 'u1@example.com', true, 'user_one')
    `;
    await sql`
      INSERT INTO item (id, owner_id, external_id, source, title, image) VALUES
        ('item-a', 'u1', 1001, 'mfc', 'Item A', 'https://static.myakiba.app/items/mfc/1001/aaaaaaaaaaaaaaaa.jpg'),
        ('item-b', 'u1', 1002, 'mfc', 'Item B', NULL)
    `;
    const before = await snapshot(sql);

    expect(await pushSchema(url)).toMatchObject({
      applied: true,
      statements: [...PICTURE_BYTES_COLUMN, ...REPEATED_ON_EVERY_PUSH].toSorted(),
    });
    const after = await snapshot(sql);
    expect(after.rows).toEqual(before.rows);
    expect(await pushSchema(url)).toMatchObject({
      applied: true,
      statements: REPEATED_ON_EVERY_PUSH,
    });
    expect(await snapshot(sql)).toEqual(after);
  },
  PUSH_TIMEOUT * 3,
);
