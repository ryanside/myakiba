import type { SQL } from "bun";

const PICTURES = "https://static.myakiba.app/items/mfc";

const SHARED_ITEMS = `
INSERT INTO "user" (id, name, email, email_verified, username, created_at, updated_at) VALUES
  ('u1', 'User One', 'u1@example.com', true, 'user_one', '2026-01-01 09:00', '2026-01-01 09:00'),
  ('u2', 'User Two', 'u2@example.com', true, 'user_two', '2026-01-02 09:00', '2026-01-02 09:00'),
  ('u3', 'User Three', 'u3@example.com', false, 'user_three', '2026-01-03 09:00', '2026-01-03 09:00'),
  ('u4', 'User Four', 'u4@example.com', true, 'user_four', '2026-01-04 09:00', '2026-01-04 09:00');

INSERT INTO item (id, external_id, source, title, mfc_title, numbering, category, version, scale,
  height, width, depth, mfc_metadata_version, content_label, mfc_rating_id, image, created_at, updated_at)
VALUES
  ('item-a', 1001, 'mfc', 'Item A', 'Item A (MFC)', '#1', 'Prepainted', '{Standard,Deluxe}', '1/7',
    250, 120, 110, 3, NULL, 2, '${PICTURES}/1001/aaaaaaaaaaaaaaaa.jpg', '2026-01-10 10:00', '2026-02-10 10:00'),
  ('item-b', 1002, 'mfc', 'Item B', NULL, NULL, 'Plushes', '{}', 'n/a',
    NULL, NULL, NULL, 3, NULL, NULL, '${PICTURES}/1002/bbbbbbbbbbbbbbbb.jpg', '2026-01-11 10:00', '2026-01-11 10:00'),
  ('item-c', 1003, 'mfc', 'Item C', NULL, NULL, 'Prepainted', '{}', '1/8',
    NULL, NULL, NULL, 3, 'intermediate', NULL, '${PICTURES}/1001/aaaaaaaaaaaaaaaa.jpg', '2026-01-12 10:00', '2026-01-12 10:00'),
  ('item-d', 1004, 'mfc', 'Item D', NULL, NULL, 'Books', '{}', 'n/a',
    NULL, NULL, NULL, 3, NULL, NULL, '${PICTURES}/1004/dddddddddddddddd.png', '2026-01-13 10:00', '2026-01-13 10:00'),
  ('item-e', NULL, 'custom', 'Item E', NULL, NULL, 'Garage Kits', NULL, '1/6',
    300, NULL, NULL, 0, NULL, NULL, NULL, '2026-01-14 10:00', '2026-01-14 10:00'),
  ('item-f', 1006, 'mfc', 'Item F', NULL, NULL, 'Trading', '{}', 'n/a',
    NULL, NULL, NULL, 1, NULL, NULL, 'https://static.myfigurecollection.net/upload/items/1/1006.jpg', '2026-01-15 10:00', '2026-01-15 10:00');

INSERT INTO item_release (id, item_id, date, type, price, price_currency, barcode, created_at, updated_at) VALUES
  ('a0000000-0000-4000-8000-000000000001', 'item-a', '2026-03-01', 'Standard', 15000, 'JPY', '4580000000011', '2026-01-10 10:00', '2026-01-10 10:00'),
  ('a0000000-0000-4000-8000-000000000002', 'item-a', '2026-06-01', 'Resale', 16000, 'JPY', NULL, '2026-01-10 10:00', '2026-01-10 10:00'),
  ('a0000000-0000-4000-8000-000000000003', 'item-a', '2026-03-01', 'Standard', 15000, 'JPY', '4580000000011', '2026-01-20 10:00', '2026-01-20 10:00'),
  ('b0000000-0000-4000-8000-000000000001', 'item-b', '2026-04-01', NULL, 3000, 'JPY', NULL, '2026-01-11 10:00', '2026-01-11 10:00'),
  ('d0000000-0000-4000-8000-000000000001', 'item-d', '2026-05-01', NULL, 2000, 'JPY', NULL, '2026-01-13 10:00', '2026-01-13 10:00'),
  ('e0000000-0000-4000-8000-000000000001', 'item-e', '2026-02-01', NULL, 5000, 'USD', NULL, '2026-01-14 10:00', '2026-01-14 10:00'),
  ('e0000000-0000-4000-8000-000000000002', 'item-e', '2026-02-01', NULL, 5000, 'USD', NULL, '2026-01-14 11:00', '2026-01-14 11:00');

INSERT INTO entry (id, external_id, source, category, name, created_at, updated_at) VALUES
  ('entry-1', 2001, 'mfc', 'Characters', 'Character One', '2026-01-10 10:00', '2026-01-10 10:00'),
  ('entry-2', 2002, 'mfc', 'Artists', 'Artist Two', '2026-01-10 10:00', '2026-01-18 10:00'),
  ('entry-3', 2003, 'mfc', 'Materials', 'PVC', '2026-01-10 10:00', '2026-01-10 10:00'),
  ('entry-4', NULL, 'custom', 'Companies', 'Custom Maker', '2026-01-14 10:00', '2026-01-14 10:00'),
  ('entry-5', 2005, 'mfc', 'Origins', 'Origin Five', '2026-01-13 10:00', '2026-01-13 10:00'),
  ('entry-6', 2006, 'mfc', 'Events', 'Event Six', '2026-01-13 10:00', '2026-01-13 10:00');

INSERT INTO entry_to_item (entry_id, item_id, role, roles, source_label, material_percentage, created_at, updated_at) VALUES
  ('entry-1', 'item-a', NULL, '{}', NULL, NULL, '2026-01-10 10:00', '2026-01-10 10:00'),
  ('entry-2', 'item-a', 'Sculptor', '{Sculptor,Painter}', 'Sculptor & Painter', NULL, '2026-01-10 10:00', '2026-01-10 10:00'),
  ('entry-3', 'item-a', NULL, '{}', NULL, 80.5, '2026-01-10 10:00', '2026-01-10 10:00'),
  ('entry-1', 'item-b', NULL, '{}', NULL, NULL, '2026-01-11 10:00', '2026-01-11 10:00'),
  ('entry-4', 'item-e', NULL, '{}', 'Maker', NULL, '2026-01-14 10:00', '2026-01-14 10:00'),
  ('entry-5', 'item-d', NULL, '{}', NULL, NULL, '2026-01-13 10:00', '2026-01-13 10:00');

INSERT INTO "order" (id, user_id, title, shop, status, created_at, updated_at) VALUES
  ('order-1', 'u1', 'Spring order', 'Shop One', 'Paid', '2026-02-01 10:00', '2026-02-01 10:00');

INSERT INTO collection (id, user_id, item_id, order_id, status, release_id, price, tags, created_at, updated_at) VALUES
  ('col-1', 'u1', 'item-a', 'order-1', 'Owned', 'a0000000-0000-4000-8000-000000000001', 15000, '{gift}', '2026-02-01 10:00', '2026-02-05 10:00'),
  ('col-2', 'u1', 'item-a', NULL, 'Ordered', 'b0000000-0000-4000-8000-000000000001', 14000, '{}', '2026-02-02 10:00', '2026-02-02 10:00'),
  ('col-3', 'u3', 'item-a', NULL, 'Ordered', 'a0000000-0000-4000-8000-000000000002', 16000, '{}', '2026-02-03 10:00', '2026-02-03 10:00'),
  ('col-4', 'u3', 'item-a', NULL, 'Owned', NULL, 0, '{}', '2026-02-04 10:00', '2026-02-04 10:00'),
  ('col-5', 'u2', 'item-e', NULL, 'Owned', 'e0000000-0000-4000-8000-000000000001', 5000, '{}', '2026-02-05 10:00', '2026-02-05 10:00');

INSERT INTO wishlist_item (id, user_id, item_id, position, created_at, updated_at) VALUES
  ('wish-1', 'u2', 'item-a', 0, '2026-02-06 10:00', '2026-02-06 10:00'),
  ('wish-2', 'u3', 'item-a', 0, '2026-02-07 10:00', '2026-02-07 10:00');

INSERT INTO list (id, user_id, title, position, created_at, updated_at) VALUES
  ('list-1', 'u1', 'Favorites', 0, '2026-02-08 10:00', '2026-02-08 10:00'),
  ('list-2', 'u2', 'Shelf', 0, '2026-02-08 10:00', '2026-02-08 10:00'),
  ('list-3', 'u3', 'Preorders', 0, '2026-02-08 10:00', '2026-02-08 10:00');

INSERT INTO list_member (id, list_id, item_id, collection_id, order_id, position, created_at) VALUES
  ('member-1', 'list-1', 'item-b', NULL, NULL, 0, '2026-02-09 10:00'),
  ('member-2', 'list-1', NULL, 'col-1', NULL, 1, '2026-02-09 10:00'),
  ('member-3', 'list-1', NULL, NULL, 'order-1', 2, '2026-02-09 10:00'),
  ('member-4', 'list-2', 'item-a', NULL, NULL, 0, '2026-02-09 10:00'),
  ('member-5', 'list-3', NULL, 'col-3', NULL, 0, '2026-02-09 10:00');

INSERT INTO add_commit (user_id, commit_id, body_hash, answer, created_at) VALUES
  ('u1', '9f1c1f4e-2b7a-4c1e-9d3a-5b6c7d8e9f01', 'hash', '{"collectionItemIds":["col-1"]}', '2026-02-09 10:00');
`;

export async function seedSharedItems(sql: SQL): Promise<void> {
  await sql.unsafe(SHARED_ITEMS);
}

type ScaledSeed = {
  readonly users: number;
  readonly items: number;
  readonly entries: number;
  readonly referencesPerUser: number;
};

export async function seedScaledSharedItems(sql: SQL, size: ScaledSeed): Promise<void> {
  const { users, items, entries, referencesPerUser } = size;
  if (referencesPerUser > items || entries < 4) {
    throw new Error(
      "Each user's references must be distinct Items, and each Item links four Item Entries",
    );
  }
  await sql`
    INSERT INTO "user" (id, name, email, username, created_at, updated_at)
    SELECT 'scale-u' || u, 'Scale ' || u, 'scale-' || u || '@example.com', 'scale_' || u,
      '2026-01-01 09:00', '2026-01-01 09:00'
    FROM generate_series(1, ${users}::int) u
  `;
  await sql`
    INSERT INTO item (id, external_id, source, title, category, version, image, created_at, updated_at)
    SELECT 'scale-i' || i, 100000 + i, 'mfc', 'Scale Item ' || i, 'Prepainted', '{Standard}',
      ${PICTURES} || '/' || (100000 + i) || '/' || left(md5(i::text), 16) || '.jpg',
      '2026-01-10 10:00', '2026-01-10 10:00'
    FROM generate_series(1, ${items}::int) i
  `;
  await sql`
    INSERT INTO item_release (id, item_id, date, type, price, price_currency, created_at, updated_at)
    SELECT md5('scale-r' || i || '-' || k)::uuid, 'scale-i' || i, date '2026-03-01' + k * 30,
      'Standard', 10000 + k, 'JPY', '2026-01-10 10:00', '2026-01-10 10:00'
    FROM generate_series(1, ${items}::int) i, generate_series(1, 2) k
  `;
  await sql`
    INSERT INTO entry (id, external_id, source, category, name, created_at, updated_at)
    SELECT 'scale-e' || e, 200000 + e, 'mfc', 'Characters', 'Scale Entry ' || e,
      '2026-01-10 10:00', '2026-01-10 10:00'
    FROM generate_series(1, ${entries}::int) e
  `;
  await sql`
    INSERT INTO entry_to_item (entry_id, item_id, roles, created_at, updated_at)
    SELECT 'scale-e' || ((i * 4 + k) % ${entries}::int + 1), 'scale-i' || i, '{}',
      '2026-01-10 10:00', '2026-01-10 10:00'
    FROM generate_series(1, ${items}::int) i, generate_series(0, 3) k
  `;
  await sql`
    INSERT INTO list (id, user_id, title, created_at, updated_at)
    SELECT 'scale-l' || u, 'scale-u' || u, 'List ' || u, '2026-02-01 10:00', '2026-02-01 10:00'
    FROM generate_series(1, ${users}::int) u
  `;
  await sql`
    INSERT INTO collection (id, user_id, item_id, release_id, tags, created_at, updated_at)
    SELECT 'scale-c' || u || '-' || r, 'scale-u' || u, 'scale-i' || ((u * 7919 + r) % ${items}::int + 1),
      md5('scale-r' || ((u * 7919 + r) % ${items}::int + 1) || '-1')::uuid, '{}',
      '2026-02-01 10:00', '2026-02-01 10:00'
    FROM generate_series(1, ${users}::int) u, generate_series(1, ${referencesPerUser}::int) r
    WHERE r % 3 = 0
  `;
  await sql`
    INSERT INTO wishlist_item (id, user_id, item_id, position, created_at, updated_at)
    SELECT 'scale-w' || u || '-' || r, 'scale-u' || u, 'scale-i' || ((u * 7919 + r) % ${items}::int + 1),
      r, '2026-02-01 10:00', '2026-02-01 10:00'
    FROM generate_series(1, ${users}::int) u, generate_series(1, ${referencesPerUser}::int) r
    WHERE r % 3 = 1
  `;
  await sql`
    INSERT INTO list_member (id, list_id, item_id, position, created_at)
    SELECT 'scale-m' || u || '-' || r, 'scale-l' || u, 'scale-i' || ((u * 7919 + r) % ${items}::int + 1),
      r, '2026-02-01 10:00'
    FROM generate_series(1, ${users}::int) u, generate_series(1, ${referencesPerUser}::int) r
    WHERE r % 3 = 2
  `;
}
