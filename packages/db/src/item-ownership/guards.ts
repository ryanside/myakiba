import type { SQL } from "bun";

/**
 * The SQLSTATE every owner guard raises. Class 23 is integrity constraint violation, and
 * Postgres defines no `23M` subclass. The error's constraint field names the check that failed.
 */
export const OWNER_MISMATCH = "23M01";

/** The checks a guard can fail, as the error's constraint field names them. */
export const OWNER_CHECKS = {
  collection_item_owner: "a Collection Item must point at an Item its user owns",
  collection_release_of_item:
    "a Selected Item Release must be a release of its Collection Item's Item",
  collection_order_owner: "a Collection Item must point at an Order its user owns",
  wishlist_item_item_owner: "a Wishlist Item must point at an Item its user owns",
  list_member_list_owner: "a List Member's user must be its List's user",
  list_member_item_owner: "a List Member must point at an Item its List's user owns",
  list_member_collection_owner:
    "a List Member must point at a Collection Item its List's user owns",
  list_member_order_owner: "a List Member must point at an Order its List's user owns",
  entry_to_item_item_owner: "an Item Entry link must have its Item's owner",
  entry_to_item_entry_owner: "an Item Entry link must have its Item Entry's owner",
  item_owner_fixed: "an Item's owner never changes",
  entry_owner_fixed: "an Item Entry's owner never changes",
  list_owner_fixed: "a List's user never changes",
  collection_owner_fixed: "a Collection Item's user never changes",
  order_owner_fixed: "an Order's user never changes",
  item_release_item_fixed: "an Item Release's Item never changes",
} as const;

export type OwnerCheck = keyof typeof OWNER_CHECKS;

const OWNER_COLUMNS = [
  "item.owner_id",
  "entry.owner_id",
  "entry_to_item.owner_id",
  "list_member.user_id",
] as const;

function raise(check: OwnerCheck, detail: string): string {
  return `RAISE EXCEPTION USING ERRCODE = '${OWNER_MISMATCH}', CONSTRAINT = '${check}',
    MESSAGE = ${literal(OWNER_CHECKS[check])}, DETAIL = ${detail}, TABLE = TG_TABLE_NAME, SCHEMA = TG_TABLE_SCHEMA;`;
}

function literal(text: string): string {
  return `'${text.replaceAll("'", "''")}'`;
}

/** True on INSERT, and on an UPDATE that changes any of these columns. */
function written(columns: readonly string[]): string {
  return `(TG_OP = 'INSERT' OR ${columns.map((c) => `NEW.${c} IS DISTINCT FROM OLD.${c}`).join(" OR ")})`;
}

/**
 * A child guard checks the row it writes against its parents. A parent it cannot see fails the
 * check, so a parent committed by another transaction after the check began never passes it.
 * KEY SHARE holds the parent until the write commits, as a foreign key check does: a parent
 * deleted while the guard waits for it fails the check, even if its id is reissued.
 * It checks only the columns the write changes: a cascade that clears release_id, or deletes the
 * row's Item first, then has nothing to look up.
 */
const CHILD_GUARDS = {
  collection: `
    IF TG_OP = 'UPDATE' AND NEW.user_id IS DISTINCT FROM OLD.user_id THEN
      ${raise("collection_owner_fixed", "format('collection %s: %s to %s', OLD.id, OLD.user_id, NEW.user_id)")}
    END IF;
    IF ${written(["user_id", "item_id"])} AND NOT EXISTS
      (SELECT 1 FROM public.item WHERE id = NEW.item_id AND owner_id = NEW.user_id FOR KEY SHARE) THEN
      ${raise("collection_item_owner", "format('user %s, Item %s', NEW.user_id, NEW.item_id)")}
    END IF;
    IF NEW.release_id IS NOT NULL AND ${written(["item_id", "release_id"])} AND NOT EXISTS
      (SELECT 1 FROM public.item_release WHERE id = NEW.release_id AND item_id = NEW.item_id FOR KEY SHARE) THEN
      ${raise("collection_release_of_item", "format('Item %s, release %s', NEW.item_id, NEW.release_id)")}
    END IF;
    IF NEW.order_id IS NOT NULL AND ${written(["user_id", "order_id"])} AND NOT EXISTS
      (SELECT 1 FROM public."order" WHERE id = NEW.order_id AND user_id = NEW.user_id FOR KEY SHARE) THEN
      ${raise("collection_order_owner", "format('user %s, Order %s', NEW.user_id, NEW.order_id)")}
    END IF;`,
  wishlist_item: `
    IF ${written(["user_id", "item_id"])} AND NOT EXISTS
      (SELECT 1 FROM public.item WHERE id = NEW.item_id AND owner_id = NEW.user_id FOR KEY SHARE) THEN
      ${raise("wishlist_item_item_owner", "format('user %s, Item %s', NEW.user_id, NEW.item_id)")}
    END IF;`,
  list_member: `
    IF ${written(["user_id", "list_id"])} AND NOT EXISTS
      (SELECT 1 FROM public.list WHERE id = NEW.list_id AND user_id = NEW.user_id FOR KEY SHARE) THEN
      ${raise("list_member_list_owner", "format('user %s, List %s', NEW.user_id, NEW.list_id)")}
    END IF;
    IF NEW.item_id IS NOT NULL AND ${written(["user_id", "item_id"])} AND NOT EXISTS
      (SELECT 1 FROM public.item WHERE id = NEW.item_id AND owner_id = NEW.user_id FOR KEY SHARE) THEN
      ${raise("list_member_item_owner", "format('user %s, Item %s', NEW.user_id, NEW.item_id)")}
    END IF;
    IF NEW.collection_id IS NOT NULL AND ${written(["user_id", "collection_id"])} AND NOT EXISTS
      (SELECT 1 FROM public.collection WHERE id = NEW.collection_id AND user_id = NEW.user_id FOR KEY SHARE) THEN
      ${raise("list_member_collection_owner", "format('user %s, Collection Item %s', NEW.user_id, NEW.collection_id)")}
    END IF;
    IF NEW.order_id IS NOT NULL AND ${written(["user_id", "order_id"])} AND NOT EXISTS
      (SELECT 1 FROM public."order" WHERE id = NEW.order_id AND user_id = NEW.user_id FOR KEY SHARE) THEN
      ${raise("list_member_order_owner", "format('user %s, Order %s', NEW.user_id, NEW.order_id)")}
    END IF;`,
  entry_to_item: `
    IF ${written(["owner_id", "item_id"])} AND NOT EXISTS
      (SELECT 1 FROM public.item WHERE id = NEW.item_id AND owner_id = NEW.owner_id FOR KEY SHARE) THEN
      ${raise("entry_to_item_item_owner", "format('owner %s, Item %s', NEW.owner_id, NEW.item_id)")}
    END IF;
    IF ${written(["owner_id", "entry_id"])} AND NOT EXISTS
      (SELECT 1 FROM public.entry WHERE id = NEW.entry_id AND owner_id = NEW.owner_id FOR KEY SHARE) THEN
      ${raise("entry_to_item_entry_owner", "format('owner %s, Item Entry %s', NEW.owner_id, NEW.entry_id)")}
    END IF;`,
} as const;

/**
 * A parent's owner column never changes, so a child guard's check stays true for the row's life.
 * A Collection Item is a parent too, and its own guard keeps its user.
 */
const FIXED_OWNERS = [
  { table: "item", column: "owner_id", check: "item_owner_fixed" },
  { table: "entry", column: "owner_id", check: "entry_owner_fixed" },
  { table: "list", column: "user_id", check: "list_owner_fixed" },
  { table: "order", column: "user_id", check: "order_owner_fixed" },
  { table: "item_release", column: "item_id", check: "item_release_item_fixed" },
] as const satisfies readonly { table: string; column: string; check: OwnerCheck }[];

// Two installs that replace the same function at once fail with "tuple concurrently updated".
const GUARDS_SQL = [
  "SELECT pg_advisory_xact_lock(hashtextextended('myakiba:owner-guards', 0));",
  ...Object.entries(CHILD_GUARDS).map(
    ([table, body]) => `
    CREATE OR REPLACE FUNCTION public.${table}_owner_guard() RETURNS trigger LANGUAGE plpgsql AS $guard$
    BEGIN${body}
      RETURN NEW;
    END $guard$;
    CREATE OR REPLACE TRIGGER ${table}_owner_guard BEFORE INSERT OR UPDATE ON public."${table}"
      FOR EACH ROW EXECUTE FUNCTION public.${table}_owner_guard();`,
  ),
  ...FIXED_OWNERS.map(
    ({ table, column, check }) => `
    CREATE OR REPLACE FUNCTION public.${table}_owner_guard() RETURNS trigger LANGUAGE plpgsql AS $guard$
    BEGIN
      ${raise(check, `format('${table} %s: %s to %s', OLD.id, OLD.${column}, NEW.${column})`)}
    END $guard$;
    CREATE OR REPLACE TRIGGER ${table}_owner_guard BEFORE UPDATE ON public."${table}"
      FOR EACH ROW WHEN (OLD.${column} IS DISTINCT FROM NEW.${column})
      EXECUTE FUNCTION public.${table}_owner_guard();`,
  ),
].join("\n");

/**
 * Creates or replaces the triggers that keep every reference to an Item, Item Entry, List,
 * Collection Item or Order with its owner. drizzle-kit push does not read triggers, so db-push
 * runs this after every push.
 * Idempotent, and atomic: one statement batch, which Postgres runs as one transaction. A database
 * without the owner columns has nothing to guard and is left alone.
 */
export async function installOwnerGuards(sql: SQL): Promise<"installed" | "pre-ownership"> {
  const columns = await sql<{ name: string }[]>`
    SELECT table_name || '.' || column_name AS name FROM information_schema.columns
    WHERE table_schema = 'public'
  `;
  const found = new Set(columns.map((column) => column.name));
  const missing = OWNER_COLUMNS.filter((owner) => !found.has(owner));
  if (missing.length === OWNER_COLUMNS.length) return "pre-ownership";
  if (missing.length > 0) {
    throw new Error(`Cannot guard Item ownership without ${missing.join(", ")}`);
  }
  await sql.unsafe(GUARDS_SQL);
  return "installed";
}
