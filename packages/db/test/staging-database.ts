/**
 * staging's database after #219 (b278b54d): the seed of `main`'s shape in push-schema.test.ts after
 * staging's db-push, plus an Item u1 saved and added to their Collection after the switch and an Item
 * u3 saved but never added. Its originals have no owner, and its owner guards let a link without an
 * owner through. Dumped from Postgres 18.6 with `pg_dump --no-owner --no-privileges --no-comments
 * --inserts --rows-per-insert=100`, without its comments and session settings.
 */
export const STAGING_DATABASE = `
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;
CREATE FUNCTION public.collection_owner_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
    IF (TG_OP = 'INSERT' OR NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.item_id IS DISTINCT FROM OLD.item_id) AND NOT EXISTS
      (SELECT 1 FROM public.item WHERE id = NEW.item_id AND owner_id = NEW.user_id FOR KEY SHARE) THEN
      RAISE EXCEPTION USING ERRCODE = '23M01', CONSTRAINT = 'collection_item_owner',
    MESSAGE = 'a Collection Item must point at an Item its user owns', DETAIL = format('user %s, Item %s', NEW.user_id, NEW.item_id), TABLE = TG_TABLE_NAME, SCHEMA = TG_TABLE_SCHEMA;
    END IF;
    IF NEW.release_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.item_id IS DISTINCT FROM OLD.item_id OR NEW.release_id IS DISTINCT FROM OLD.release_id) AND NOT EXISTS
      (SELECT 1 FROM public.item_release WHERE id = NEW.release_id AND item_id = NEW.item_id FOR KEY SHARE) THEN
      RAISE EXCEPTION USING ERRCODE = '23M01', CONSTRAINT = 'collection_release_of_item',
    MESSAGE = 'a Selected Item Release must be a release of its Collection Item''s Item', DETAIL = format('Item %s, release %s', NEW.item_id, NEW.release_id), TABLE = TG_TABLE_NAME, SCHEMA = TG_TABLE_SCHEMA;
    END IF;
      RETURN NEW;
    END $$;
CREATE FUNCTION public.entry_owner_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      RAISE EXCEPTION USING ERRCODE = '23M01', CONSTRAINT = 'entry_owner_fixed',
    MESSAGE = 'an Item Entry''s owner never changes', DETAIL = format('entry %s: %s to %s', OLD.id, OLD.owner_id, NEW.owner_id), TABLE = TG_TABLE_NAME, SCHEMA = TG_TABLE_SCHEMA;
    END $$;
CREATE FUNCTION public.entry_to_item_owner_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
    IF (TG_OP = 'INSERT' OR NEW.owner_id IS DISTINCT FROM OLD.owner_id OR NEW.item_id IS DISTINCT FROM OLD.item_id) AND NOT EXISTS
      (SELECT 1 FROM public.item WHERE id = NEW.item_id AND owner_id IS NOT DISTINCT FROM NEW.owner_id FOR KEY SHARE) THEN
      RAISE EXCEPTION USING ERRCODE = '23M01', CONSTRAINT = 'entry_to_item_item_owner',
    MESSAGE = 'an Item Entry link must have its Item''s owner', DETAIL = format('owner %s, Item %s', NEW.owner_id, NEW.item_id), TABLE = TG_TABLE_NAME, SCHEMA = TG_TABLE_SCHEMA;
    END IF;
    IF (TG_OP = 'INSERT' OR NEW.owner_id IS DISTINCT FROM OLD.owner_id OR NEW.entry_id IS DISTINCT FROM OLD.entry_id) AND NOT EXISTS
      (SELECT 1 FROM public.entry WHERE id = NEW.entry_id AND owner_id IS NOT DISTINCT FROM NEW.owner_id FOR KEY SHARE) THEN
      RAISE EXCEPTION USING ERRCODE = '23M01', CONSTRAINT = 'entry_to_item_entry_owner',
    MESSAGE = 'an Item Entry link must have its Item Entry''s owner', DETAIL = format('owner %s, Item Entry %s', NEW.owner_id, NEW.entry_id), TABLE = TG_TABLE_NAME, SCHEMA = TG_TABLE_SCHEMA;
    END IF;
      RETURN NEW;
    END $$;
CREATE FUNCTION public.item_owner_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      RAISE EXCEPTION USING ERRCODE = '23M01', CONSTRAINT = 'item_owner_fixed',
    MESSAGE = 'an Item''s owner never changes', DETAIL = format('item %s: %s to %s', OLD.id, OLD.owner_id, NEW.owner_id), TABLE = TG_TABLE_NAME, SCHEMA = TG_TABLE_SCHEMA;
    END $$;
CREATE FUNCTION public.item_release_owner_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      RAISE EXCEPTION USING ERRCODE = '23M01', CONSTRAINT = 'item_release_item_fixed',
    MESSAGE = 'an Item Release''s Item never changes', DETAIL = format('item_release %s: %s to %s', OLD.id, OLD.item_id, NEW.item_id), TABLE = TG_TABLE_NAME, SCHEMA = TG_TABLE_SCHEMA;
    END $$;
CREATE FUNCTION public.list_member_owner_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
    IF (TG_OP = 'INSERT' OR NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.list_id IS DISTINCT FROM OLD.list_id) AND NOT EXISTS
      (SELECT 1 FROM public.list WHERE id = NEW.list_id AND user_id = NEW.user_id FOR KEY SHARE) THEN
      RAISE EXCEPTION USING ERRCODE = '23M01', CONSTRAINT = 'list_member_list_owner',
    MESSAGE = 'a List Member''s user must be its List''s user', DETAIL = format('user %s, List %s', NEW.user_id, NEW.list_id), TABLE = TG_TABLE_NAME, SCHEMA = TG_TABLE_SCHEMA;
    END IF;
    IF NEW.item_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.item_id IS DISTINCT FROM OLD.item_id) AND NOT EXISTS
      (SELECT 1 FROM public.item WHERE id = NEW.item_id AND owner_id = NEW.user_id FOR KEY SHARE) THEN
      RAISE EXCEPTION USING ERRCODE = '23M01', CONSTRAINT = 'list_member_item_owner',
    MESSAGE = 'a List Member must point at an Item its List''s user owns', DETAIL = format('user %s, Item %s', NEW.user_id, NEW.item_id), TABLE = TG_TABLE_NAME, SCHEMA = TG_TABLE_SCHEMA;
    END IF;
      RETURN NEW;
    END $$;
CREATE FUNCTION public.list_owner_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      RAISE EXCEPTION USING ERRCODE = '23M01', CONSTRAINT = 'list_owner_fixed',
    MESSAGE = 'a List''s user never changes', DETAIL = format('list %s: %s to %s', OLD.id, OLD.user_id, NEW.user_id), TABLE = TG_TABLE_NAME, SCHEMA = TG_TABLE_SCHEMA;
    END $$;
CREATE FUNCTION public.wishlist_item_owner_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
    IF (TG_OP = 'INSERT' OR NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.item_id IS DISTINCT FROM OLD.item_id) AND NOT EXISTS
      (SELECT 1 FROM public.item WHERE id = NEW.item_id AND owner_id = NEW.user_id FOR KEY SHARE) THEN
      RAISE EXCEPTION USING ERRCODE = '23M01', CONSTRAINT = 'wishlist_item_item_owner',
    MESSAGE = 'a Wishlist Item must point at an Item its user owns', DETAIL = format('user %s, Item %s', NEW.user_id, NEW.item_id), TABLE = TG_TABLE_NAME, SCHEMA = TG_TABLE_SCHEMA;
    END IF;
      RETURN NEW;
    END $$;
CREATE TABLE public.account (
    id text NOT NULL,
    account_id text NOT NULL,
    provider_id text NOT NULL,
    user_id text NOT NULL,
    access_token text,
    refresh_token text,
    id_token text,
    access_token_expires_at timestamp without time zone,
    refresh_token_expires_at timestamp without time zone,
    scope text,
    password text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone NOT NULL
);
CREATE TABLE public.add_commit (
    user_id text NOT NULL,
    commit_id uuid NOT NULL,
    body_hash text NOT NULL,
    answer jsonb,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.collection (
    id text NOT NULL,
    user_id text NOT NULL,
    item_id text NOT NULL,
    order_id text,
    status text DEFAULT 'Owned'::text NOT NULL,
    count integer DEFAULT 1 NOT NULL,
    release_id uuid,
    score numeric(3,1) DEFAULT 0.0 NOT NULL,
    price bigint DEFAULT 0 NOT NULL,
    shop text DEFAULT ''::text NOT NULL,
    order_date date,
    payment_date date,
    shipping_date date,
    collection_date date,
    shipping_method text DEFAULT 'n/a'::text NOT NULL,
    sold_for bigint,
    sold_date date,
    tags text[] NOT NULL,
    condition text DEFAULT 'New'::text NOT NULL,
    notes text DEFAULT ''::text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.entry (
    id text NOT NULL,
    external_id integer,
    source text DEFAULT 'mfc'::text NOT NULL,
    category text NOT NULL,
    name text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    owner_id text
);
CREATE TABLE public.entry_to_item (
    entry_id text NOT NULL,
    item_id text NOT NULL,
    role text,
    roles text[] DEFAULT '{}'::text[] NOT NULL,
    source_label text,
    material_percentage numeric(5,2),
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    owner_id text,
    CONSTRAINT entry_to_item_material_percentage_check CHECK (((material_percentage IS NULL) OR ((material_percentage >= (0)::numeric) AND (material_percentage <= (100)::numeric))))
);
CREATE TABLE public.item (
    id text NOT NULL,
    external_id integer,
    source text DEFAULT 'mfc'::text NOT NULL,
    title text NOT NULL,
    mfc_title text,
    numbering text,
    category text,
    version text[],
    scale text DEFAULT 'n/a'::text NOT NULL,
    height integer,
    width integer,
    depth integer,
    mfc_metadata_version integer DEFAULT 0 NOT NULL,
    image text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    owner_id text,
    content_label text,
    mfc_rating_id integer
);
CREATE TABLE public.item_release (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    item_id text NOT NULL,
    date date NOT NULL,
    type text,
    price bigint,
    price_currency text,
    barcode text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.list (
    id text NOT NULL,
    user_id text NOT NULL,
    title text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.list_member (
    id text NOT NULL,
    list_id text NOT NULL,
    item_id text,
    collection_id text,
    order_id text,
    "position" integer DEFAULT 0 NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    user_id text NOT NULL,
    CONSTRAINT list_member_exactly_one_target_check CHECK ((num_nonnulls(item_id, collection_id, order_id) = 1))
);
CREATE TABLE public."order" (
    id text NOT NULL,
    user_id text NOT NULL,
    title text NOT NULL,
    shop text DEFAULT ''::text NOT NULL,
    order_date date,
    release_date date,
    payment_date date,
    shipping_date date,
    collection_date date,
    shipping_method text DEFAULT 'n/a'::text NOT NULL,
    status text DEFAULT 'Ordered'::text NOT NULL,
    shipping_fee bigint DEFAULT 0 NOT NULL,
    taxes bigint DEFAULT 0 NOT NULL,
    duties bigint DEFAULT 0 NOT NULL,
    tariffs bigint DEFAULT 0 NOT NULL,
    misc_fees bigint DEFAULT 0 NOT NULL,
    notes text DEFAULT ''::text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.session (
    id text NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    token text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone NOT NULL,
    ip_address text,
    user_agent text,
    user_id text NOT NULL,
    impersonated_by text
);
CREATE TABLE public."user" (
    id text NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    email_verified boolean DEFAULT false NOT NULL,
    has_seen_onboarding boolean DEFAULT true NOT NULL,
    image text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    username text NOT NULL,
    display_username text,
    normalized_email text,
    currency text DEFAULT 'USD'::text NOT NULL,
    date_format text DEFAULT 'MM/DD/YYYY'::text NOT NULL,
    role text,
    banned boolean,
    ban_reason text,
    ban_expires timestamp without time zone
);
CREATE TABLE public.verification (
    id text NOT NULL,
    identifier text NOT NULL,
    value text NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.wishlist_item (
    id text NOT NULL,
    user_id text NOT NULL,
    item_id text NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);
INSERT INTO public.account VALUES
	('acc-1', 'u1', 'credential', 'u1', NULL, NULL, NULL, NULL, NULL, NULL, 'hash', '2026-01-01 09:00:00', '2026-01-01 09:00:00');
INSERT INTO public.collection VALUES
	('col-1', 'u1', 'i539e821a8a62b1a0005d5bd', 'order-1', 'Owned', 1, 'a766e80e-d6b1-8ad3-89e7-4c0d85ef246e', 0.0, 15000, '', NULL, NULL, NULL, NULL, 'n/a', NULL, NULL, '{gift}', 'New', '', '2026-02-01 10:00:00', '2026-02-05 10:00:00'),
	('col-2', 'u2', 'iea535b227241c21b18a3b42', 'order-2', 'Ordered', 1, '9ea63815-5d32-8833-8c52-8f1a900f0453', 0.0, 16000, '', NULL, NULL, NULL, NULL, 'n/a', NULL, NULL, '{}', 'New', '', '2026-02-02 10:00:00', '2026-02-02 10:00:00'),
	('col-3', 'u3', 'i6c73d9f976cf3d5704f5581', NULL, 'Owned', 1, 'dc574b4a-14cf-8918-8aec-a56be7eb0c09', 0.0, 3000, '', NULL, NULL, NULL, NULL, 'n/a', NULL, NULL, '{}', 'New', '', '2026-02-03 10:00:00', '2026-02-03 10:00:00'),
	('col-4', 'u2', 'i33be3ba280be497e88feb87', NULL, 'Owned', 1, NULL, 0.0, 5000, '', NULL, NULL, NULL, NULL, 'n/a', NULL, NULL, '{}', 'New', '', '2026-02-04 10:00:00', '2026-02-04 10:00:00'),
	('col-5', 'u1', 'item-u1-1005', NULL, 'Ordered', 1, 'f0000000-0000-4000-8000-000000000001', 0.0, 12000, '', NULL, NULL, NULL, NULL, 'n/a', NULL, NULL, '{}', 'New', '', '2026-11-10 10:00:00', '2026-11-10 10:00:00');
INSERT INTO public.entry VALUES
	('entry-1', 2001, 'mfc', 'Characters', 'Character One', '2026-01-10 10:00:00', '2026-01-10 10:00:00', NULL),
	('entry-2', 2002, 'mfc', 'Artists', 'Artist Two', '2026-01-10 10:00:00', '2026-01-18 10:00:00', NULL),
	('entry-3', NULL, 'custom', 'Companies', 'Custom Maker', '2026-01-12 10:00:00', '2026-01-12 10:00:00', NULL),
	('e7ae9210955a91eac0118fd5', 2001, 'mfc', 'Characters', 'Character One', '2026-01-10 10:00:00', '2026-01-10 10:00:00', 'u3'),
	('e9080151a1696600a01faec6', 2001, 'mfc', 'Characters', 'Character One', '2026-01-10 10:00:00', '2026-01-10 10:00:00', 'u2'),
	('e5ba9863d6061396dcdd9f85', 2001, 'mfc', 'Characters', 'Character One', '2026-01-10 10:00:00', '2026-01-10 10:00:00', 'u1'),
	('eb12c059f1e8554c3bcab76a', 2002, 'mfc', 'Artists', 'Artist Two', '2026-01-10 10:00:00', '2026-01-18 10:00:00', 'u3'),
	('e79a4d692b1eb9fc71d199df', 2002, 'mfc', 'Artists', 'Artist Two', '2026-01-10 10:00:00', '2026-01-18 10:00:00', 'u2'),
	('e99663105d872bd1a157f06a', 2002, 'mfc', 'Artists', 'Artist Two', '2026-01-10 10:00:00', '2026-01-18 10:00:00', 'u1'),
	('ebe2923427797072d4520919', NULL, 'custom', 'Companies', 'Custom Maker', '2026-01-12 10:00:00', '2026-01-12 10:00:00', 'u2'),
	('entry-u1-2099', 2099, 'mfc', 'Artists', 'Artist Nine', '2026-11-10 10:00:00', '2026-11-10 10:00:00', 'u1');
INSERT INTO public.entry_to_item VALUES
	('entry-1', 'item-a', NULL, '{}', NULL, NULL, '2026-01-10 10:00:00', '2026-01-10 10:00:00', NULL),
	('entry-2', 'item-a', 'Sculptor', '{Sculptor,Painter}', 'Sculptor & Painter', NULL, '2026-01-10 10:00:00', '2026-01-10 10:00:00', NULL),
	('entry-1', 'item-b', NULL, '{}', NULL, NULL, '2026-01-11 10:00:00', '2026-01-11 10:00:00', NULL),
	('entry-3', 'item-c', NULL, '{}', 'Maker', NULL, '2026-01-12 10:00:00', '2026-01-12 10:00:00', NULL),
	('e7ae9210955a91eac0118fd5', 'ie6563d9ac4d3ed0aaba021e', NULL, '{}', NULL, NULL, '2026-01-10 10:00:00', '2026-01-10 10:00:00', 'u3'),
	('e9080151a1696600a01faec6', 'iea535b227241c21b18a3b42', NULL, '{}', NULL, NULL, '2026-01-10 10:00:00', '2026-01-10 10:00:00', 'u2'),
	('e5ba9863d6061396dcdd9f85', 'i539e821a8a62b1a0005d5bd', NULL, '{}', NULL, NULL, '2026-01-10 10:00:00', '2026-01-10 10:00:00', 'u1'),
	('eb12c059f1e8554c3bcab76a', 'ie6563d9ac4d3ed0aaba021e', 'Sculptor', '{Sculptor,Painter}', 'Sculptor & Painter', NULL, '2026-01-10 10:00:00', '2026-01-10 10:00:00', 'u3'),
	('e79a4d692b1eb9fc71d199df', 'iea535b227241c21b18a3b42', 'Sculptor', '{Sculptor,Painter}', 'Sculptor & Painter', NULL, '2026-01-10 10:00:00', '2026-01-10 10:00:00', 'u2'),
	('e99663105d872bd1a157f06a', 'i539e821a8a62b1a0005d5bd', 'Sculptor', '{Sculptor,Painter}', 'Sculptor & Painter', NULL, '2026-01-10 10:00:00', '2026-01-10 10:00:00', 'u1'),
	('e7ae9210955a91eac0118fd5', 'i6c73d9f976cf3d5704f5581', NULL, '{}', NULL, NULL, '2026-01-11 10:00:00', '2026-01-11 10:00:00', 'u3'),
	('e5ba9863d6061396dcdd9f85', 'ife4ed701c3dc6c5811533ba', NULL, '{}', NULL, NULL, '2026-01-11 10:00:00', '2026-01-11 10:00:00', 'u1'),
	('ebe2923427797072d4520919', 'i33be3ba280be497e88feb87', NULL, '{}', 'Maker', NULL, '2026-01-12 10:00:00', '2026-01-12 10:00:00', 'u2'),
	('entry-u1-2099', 'item-u1-1005', NULL, '{Sculptor}', NULL, NULL, '2026-11-10 10:00:00', '2026-11-10 10:00:00', 'u1');
INSERT INTO public.item VALUES
	('item-a', 1001, 'mfc', 'Item A', 'Item A (MFC)', NULL, 'Prepainted', '{Standard,Deluxe}', '1/7', 250, NULL, NULL, 3, 'https://static.myakiba.app/items/mfc/1001/aaaaaaaaaaaaaaaa.jpg', '2026-01-10 10:00:00', '2026-02-10 10:00:00', NULL, NULL, NULL),
	('item-b', 1002, 'mfc', 'Item B', NULL, NULL, 'Plushes', '{}', 'n/a', NULL, NULL, NULL, 3, 'https://static.myakiba.app/items/mfc/1002/bbbbbbbbbbbbbbbb.jpg', '2026-01-11 10:00:00', '2026-01-11 10:00:00', NULL, NULL, NULL),
	('item-c', NULL, 'custom', 'Item C', NULL, NULL, 'Garage Kits', NULL, '1/6', 300, NULL, NULL, 0, NULL, '2026-01-12 10:00:00', '2026-01-12 10:00:00', NULL, NULL, NULL),
	('item-d', 1004, 'mfc', 'Item D', NULL, NULL, 'Books', '{}', 'n/a', NULL, NULL, NULL, 3, NULL, '2026-01-13 10:00:00', '2026-01-13 10:00:00', NULL, NULL, NULL),
	('ie6563d9ac4d3ed0aaba021e', 1001, 'mfc', 'Item A', 'Item A (MFC)', NULL, 'Prepainted', '{Standard,Deluxe}', '1/7', 250, NULL, NULL, 3, 'https://static.myakiba.app/items/mfc/1001/aaaaaaaaaaaaaaaa.jpg', '2026-01-10 10:00:00', '2026-02-10 10:00:00', 'u3', NULL, NULL),
	('iea535b227241c21b18a3b42', 1001, 'mfc', 'Item A', 'Item A (MFC)', NULL, 'Prepainted', '{Standard,Deluxe}', '1/7', 250, NULL, NULL, 3, 'https://static.myakiba.app/items/mfc/1001/aaaaaaaaaaaaaaaa.jpg', '2026-01-10 10:00:00', '2026-02-10 10:00:00', 'u2', NULL, NULL),
	('i539e821a8a62b1a0005d5bd', 1001, 'mfc', 'Item A', 'Item A (MFC)', NULL, 'Prepainted', '{Standard,Deluxe}', '1/7', 250, NULL, NULL, 3, 'https://static.myakiba.app/items/mfc/1001/aaaaaaaaaaaaaaaa.jpg', '2026-01-10 10:00:00', '2026-02-10 10:00:00', 'u1', NULL, NULL),
	('i6c73d9f976cf3d5704f5581', 1002, 'mfc', 'Item B', NULL, NULL, 'Plushes', '{}', 'n/a', NULL, NULL, NULL, 3, 'https://static.myakiba.app/items/mfc/1002/bbbbbbbbbbbbbbbb.jpg', '2026-01-11 10:00:00', '2026-01-11 10:00:00', 'u3', NULL, NULL),
	('ife4ed701c3dc6c5811533ba', 1002, 'mfc', 'Item B', NULL, NULL, 'Plushes', '{}', 'n/a', NULL, NULL, NULL, 3, 'https://static.myakiba.app/items/mfc/1002/bbbbbbbbbbbbbbbb.jpg', '2026-01-11 10:00:00', '2026-01-11 10:00:00', 'u1', NULL, NULL),
	('i33be3ba280be497e88feb87', NULL, 'custom', 'Item C', NULL, NULL, 'Garage Kits', NULL, '1/6', 300, NULL, NULL, 0, NULL, '2026-01-12 10:00:00', '2026-01-12 10:00:00', 'u2', NULL, NULL),
	('item-u1-1005', 1005, 'mfc', 'Item E', NULL, NULL, 'Prepainted', '{}', '1/7', NULL, NULL, NULL, 3, 'https://static.myakiba.app/items/mfc/1005/eeeeeeeeeeeeeeee.jpg', '2026-11-10 10:00:00', '2026-11-10 10:00:00', 'u1', NULL, NULL),
	('item-u3-1006', 1006, 'mfc', 'Item F', NULL, NULL, 'Plushes', '{}', 'n/a', NULL, NULL, NULL, 3, NULL, '2026-11-10 11:00:00', '2026-11-10 11:00:00', 'u3', NULL, NULL);
INSERT INTO public.item_release VALUES
	('a0000000-0000-4000-8000-000000000001', 'item-a', '2026-03-01', 'Standard', 15000, 'JPY', '4580000000011', '2026-01-10 10:00:00', '2026-01-10 10:00:00'),
	('a0000000-0000-4000-8000-000000000002', 'item-a', '2026-06-01', 'Resale', 16000, 'JPY', NULL, '2026-01-10 10:00:00', '2026-01-10 10:00:00'),
	('b0000000-0000-4000-8000-000000000001', 'item-b', '2026-04-01', NULL, 3000, 'JPY', NULL, '2026-01-11 10:00:00', '2026-01-11 10:00:00'),
	('7440a65b-bf35-897d-88c0-98a48ca308fe', 'ie6563d9ac4d3ed0aaba021e', '2026-03-01', 'Standard', 15000, 'JPY', '4580000000011', '2026-01-10 10:00:00', '2026-01-10 10:00:00'),
	('98ecdcd7-385d-892c-8a56-53ae1fb8bd82', 'iea535b227241c21b18a3b42', '2026-03-01', 'Standard', 15000, 'JPY', '4580000000011', '2026-01-10 10:00:00', '2026-01-10 10:00:00'),
	('a766e80e-d6b1-8ad3-89e7-4c0d85ef246e', 'i539e821a8a62b1a0005d5bd', '2026-03-01', 'Standard', 15000, 'JPY', '4580000000011', '2026-01-10 10:00:00', '2026-01-10 10:00:00'),
	('74bb51e5-f71e-860c-8122-e985d870dcb3', 'ie6563d9ac4d3ed0aaba021e', '2026-06-01', 'Resale', 16000, 'JPY', NULL, '2026-01-10 10:00:00', '2026-01-10 10:00:00'),
	('9ea63815-5d32-8833-8c52-8f1a900f0453', 'iea535b227241c21b18a3b42', '2026-06-01', 'Resale', 16000, 'JPY', NULL, '2026-01-10 10:00:00', '2026-01-10 10:00:00'),
	('e6dbc72b-6abc-887f-82c4-36de8d7de387', 'i539e821a8a62b1a0005d5bd', '2026-06-01', 'Resale', 16000, 'JPY', NULL, '2026-01-10 10:00:00', '2026-01-10 10:00:00'),
	('dc574b4a-14cf-8918-8aec-a56be7eb0c09', 'i6c73d9f976cf3d5704f5581', '2026-04-01', NULL, 3000, 'JPY', NULL, '2026-01-11 10:00:00', '2026-01-11 10:00:00'),
	('6f62bc80-b116-8e46-80b3-0f03bb6e2274', 'ife4ed701c3dc6c5811533ba', '2026-04-01', NULL, 3000, 'JPY', NULL, '2026-01-11 10:00:00', '2026-01-11 10:00:00'),
	('f0000000-0000-4000-8000-000000000001', 'item-u1-1005', '2026-12-01', 'Standard', 12000, 'JPY', NULL, '2026-11-10 10:00:00', '2026-11-10 10:00:00');
INSERT INTO public.list VALUES
	('list-1', 'u1', 'Favorites', '', 0, '2026-02-08 10:00:00', '2026-02-08 10:00:00'),
	('list-2', 'u2', 'Shelf', '', 0, '2026-02-08 10:00:00', '2026-02-08 10:00:00'),
	('list-3', 'u3', 'Preorders', '', 0, '2026-02-08 10:00:00', '2026-02-08 10:00:00');
INSERT INTO public.list_member VALUES
	('member-2', 'list-1', NULL, 'col-1', NULL, 1, '2026-02-09 10:00:00', 'u1'),
	('member-3', 'list-1', NULL, NULL, 'order-1', 2, '2026-02-09 10:00:00', 'u1'),
	('member-5', 'list-2', NULL, 'col-2', NULL, 1, '2026-02-09 10:00:00', 'u2'),
	('member-6', 'list-3', NULL, 'col-3', NULL, 0, '2026-02-09 10:00:00', 'u3'),
	('member-1', 'list-1', 'ife4ed701c3dc6c5811533ba', NULL, NULL, 0, '2026-02-09 10:00:00', 'u1'),
	('member-4', 'list-2', 'iea535b227241c21b18a3b42', NULL, NULL, 0, '2026-02-09 10:00:00', 'u2');
INSERT INTO public."order" VALUES
	('order-1', 'u1', 'Spring order', 'Shop One', NULL, NULL, NULL, NULL, NULL, 'n/a', 'Paid', 0, 0, 0, 0, 0, '', '2026-02-01 10:00:00', '2026-02-01 10:00:00'),
	('order-2', 'u2', 'Summer order', 'Shop Two', NULL, NULL, NULL, NULL, NULL, 'n/a', 'Ordered', 0, 0, 0, 0, 0, '', '2026-02-02 10:00:00', '2026-02-02 10:00:00');
INSERT INTO public."user" VALUES
	('u1', 'User One', 'u1@example.com', true, true, NULL, '2026-01-01 09:00:00', '2026-01-01 09:00:00', 'user_one', NULL, NULL, 'USD', 'MM/DD/YYYY', NULL, NULL, NULL, NULL),
	('u2', 'User Two', 'u2@example.com', true, true, NULL, '2026-01-02 09:00:00', '2026-01-02 09:00:00', 'user_two', NULL, NULL, 'USD', 'MM/DD/YYYY', NULL, NULL, NULL, NULL),
	('u3', 'User Three', 'u3@example.com', false, true, NULL, '2026-01-03 09:00:00', '2026-01-03 09:00:00', 'user_three', NULL, NULL, 'USD', 'MM/DD/YYYY', NULL, NULL, NULL, NULL);
INSERT INTO public.wishlist_item VALUES
	('wish-2', 'u1', 'ife4ed701c3dc6c5811533ba', 0, '2026-02-07 10:00:00', '2026-02-07 10:00:00'),
	('wish-1', 'u3', 'ie6563d9ac4d3ed0aaba021e', 0, '2026-02-06 10:00:00', '2026-02-06 10:00:00');
ALTER TABLE ONLY public.account
    ADD CONSTRAINT account_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.collection
    ADD CONSTRAINT collection_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.entry
    ADD CONSTRAINT entry_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.item
    ADD CONSTRAINT item_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.item_release
    ADD CONSTRAINT item_release_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.list_member
    ADD CONSTRAINT list_member_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.list
    ADD CONSTRAINT list_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public."order"
    ADD CONSTRAINT order_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.session
    ADD CONSTRAINT session_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.session
    ADD CONSTRAINT session_token_unique UNIQUE (token);
ALTER TABLE ONLY public."user"
    ADD CONSTRAINT user_email_unique UNIQUE (email);
ALTER TABLE ONLY public."user"
    ADD CONSTRAINT user_normalized_email_unique UNIQUE (normalized_email);
ALTER TABLE ONLY public."user"
    ADD CONSTRAINT user_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public."user"
    ADD CONSTRAINT user_username_unique UNIQUE (username);
ALTER TABLE ONLY public.verification
    ADD CONSTRAINT verification_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.wishlist_item
    ADD CONSTRAINT wishlist_item_pkey PRIMARY KEY (id);
CREATE INDEX "account_userId_idx" ON public.account USING btree (user_id);
CREATE UNIQUE INDEX add_commit_user_id_commit_id_idx ON public.add_commit USING btree (user_id, commit_id);
CREATE INDEX collection_order_id_user_id_idx ON public.collection USING btree (order_id, user_id);
CREATE INDEX collection_owned_user_id_item_id_idx ON public.collection USING btree (user_id, item_id) WHERE (status = 'Owned'::text);
CREATE INDEX collection_owned_user_id_shop_idx ON public.collection USING btree (user_id, shop) WHERE ((status = 'Owned'::text) AND (shop <> ''::text));
CREATE INDEX collection_user_id_item_id_idx ON public.collection USING btree (user_id, item_id);
CREATE INDEX collection_user_id_status_created_at_idx ON public.collection USING btree (user_id, status, created_at DESC NULLS LAST);
CREATE INDEX entry_name_category_idx ON public.entry USING btree (name, category);
CREATE INDEX entry_name_trgm_idx ON public.entry USING gin (name public.gin_trgm_ops);
CREATE UNIQUE INDEX entry_owner_id_source_external_id_idx ON public.entry USING btree (owner_id, source, external_id);
CREATE UNIQUE INDEX entry_to_item_entry_id_item_id_idx ON public.entry_to_item USING btree (entry_id, item_id);
CREATE INDEX entry_to_item_item_id_entry_id_idx ON public.entry_to_item USING btree (item_id, entry_id);
CREATE INDEX entry_to_item_item_id_idx ON public.entry_to_item USING btree (item_id);
CREATE UNIQUE INDEX item_owner_id_source_external_id_idx ON public.item USING btree (owner_id, source, external_id);
CREATE INDEX item_release_date_item_id_idx ON public.item_release USING btree (date, item_id);
CREATE INDEX item_release_item_id_date_created_at_idx ON public.item_release USING btree (item_id, date DESC NULLS LAST, created_at DESC NULLS LAST);
CREATE INDEX item_title_trgm_idx ON public.item USING gin (title public.gin_trgm_ops);
CREATE INDEX list_member_collection_id_idx ON public.list_member USING btree (collection_id);
CREATE INDEX list_member_item_id_idx ON public.list_member USING btree (item_id);
CREATE UNIQUE INDEX list_member_list_id_collection_id_idx ON public.list_member USING btree (list_id, collection_id);
CREATE UNIQUE INDEX list_member_list_id_item_id_idx ON public.list_member USING btree (list_id, item_id);
CREATE UNIQUE INDEX list_member_list_id_order_id_idx ON public.list_member USING btree (list_id, order_id);
CREATE INDEX list_member_list_id_position_id_idx ON public.list_member USING btree (list_id, "position", id);
CREATE INDEX list_member_order_id_idx ON public.list_member USING btree (order_id);
CREATE INDEX list_user_id_position_created_at_id_idx ON public.list USING btree (user_id, "position", created_at, id);
CREATE INDEX order_user_id_created_at_idx ON public."order" USING btree (user_id, created_at DESC NULLS LAST);
CREATE INDEX order_user_id_release_date_idx ON public."order" USING btree (user_id, release_date);
CREATE INDEX order_user_id_status_release_date_idx ON public."order" USING btree (user_id, status, release_date);
CREATE INDEX "session_userId_idx" ON public.session USING btree (user_id);
CREATE INDEX verification_identifier_idx ON public.verification USING btree (identifier);
CREATE INDEX wishlist_item_item_id_idx ON public.wishlist_item USING btree (item_id);
CREATE UNIQUE INDEX wishlist_item_user_id_item_id_idx ON public.wishlist_item USING btree (user_id, item_id);
CREATE INDEX wishlist_item_user_id_position_created_at_id_idx ON public.wishlist_item USING btree (user_id, "position", created_at, id);
CREATE TRIGGER collection_owner_guard BEFORE INSERT OR UPDATE ON public.collection FOR EACH ROW EXECUTE FUNCTION public.collection_owner_guard();
CREATE TRIGGER entry_owner_guard BEFORE UPDATE ON public.entry FOR EACH ROW WHEN ((old.owner_id IS DISTINCT FROM new.owner_id)) EXECUTE FUNCTION public.entry_owner_guard();
CREATE TRIGGER entry_to_item_owner_guard BEFORE INSERT OR UPDATE ON public.entry_to_item FOR EACH ROW EXECUTE FUNCTION public.entry_to_item_owner_guard();
CREATE TRIGGER item_owner_guard BEFORE UPDATE ON public.item FOR EACH ROW WHEN ((old.owner_id IS DISTINCT FROM new.owner_id)) EXECUTE FUNCTION public.item_owner_guard();
CREATE TRIGGER item_release_owner_guard BEFORE UPDATE ON public.item_release FOR EACH ROW WHEN ((old.item_id IS DISTINCT FROM new.item_id)) EXECUTE FUNCTION public.item_release_owner_guard();
CREATE TRIGGER list_member_owner_guard BEFORE INSERT OR UPDATE ON public.list_member FOR EACH ROW EXECUTE FUNCTION public.list_member_owner_guard();
CREATE TRIGGER list_owner_guard BEFORE UPDATE ON public.list FOR EACH ROW WHEN ((old.user_id IS DISTINCT FROM new.user_id)) EXECUTE FUNCTION public.list_owner_guard();
CREATE TRIGGER wishlist_item_owner_guard BEFORE INSERT OR UPDATE ON public.wishlist_item FOR EACH ROW EXECUTE FUNCTION public.wishlist_item_owner_guard();
ALTER TABLE ONLY public.account
    ADD CONSTRAINT account_user_id_user_id_fk FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.add_commit
    ADD CONSTRAINT add_commit_user_id_user_id_fk FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.collection
    ADD CONSTRAINT collection_item_id_item_id_fk FOREIGN KEY (item_id) REFERENCES public.item(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.collection
    ADD CONSTRAINT collection_order_id_order_id_fk FOREIGN KEY (order_id) REFERENCES public."order"(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.collection
    ADD CONSTRAINT collection_release_id_item_release_id_fk FOREIGN KEY (release_id) REFERENCES public.item_release(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.collection
    ADD CONSTRAINT collection_user_id_user_id_fk FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.entry
    ADD CONSTRAINT entry_owner_id_user_id_fk FOREIGN KEY (owner_id) REFERENCES public."user"(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.entry_to_item
    ADD CONSTRAINT entry_to_item_entry_id_entry_id_fk FOREIGN KEY (entry_id) REFERENCES public.entry(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.entry_to_item
    ADD CONSTRAINT entry_to_item_item_id_item_id_fk FOREIGN KEY (item_id) REFERENCES public.item(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.item
    ADD CONSTRAINT item_owner_id_user_id_fk FOREIGN KEY (owner_id) REFERENCES public."user"(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.item_release
    ADD CONSTRAINT item_release_item_id_item_id_fk FOREIGN KEY (item_id) REFERENCES public.item(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.list_member
    ADD CONSTRAINT list_member_collection_id_collection_id_fk FOREIGN KEY (collection_id) REFERENCES public.collection(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.list_member
    ADD CONSTRAINT list_member_item_id_item_id_fk FOREIGN KEY (item_id) REFERENCES public.item(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.list_member
    ADD CONSTRAINT list_member_list_id_list_id_fk FOREIGN KEY (list_id) REFERENCES public.list(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.list_member
    ADD CONSTRAINT list_member_order_id_order_id_fk FOREIGN KEY (order_id) REFERENCES public."order"(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.list
    ADD CONSTRAINT list_user_id_user_id_fk FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;
ALTER TABLE ONLY public."order"
    ADD CONSTRAINT order_user_id_user_id_fk FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.session
    ADD CONSTRAINT session_user_id_user_id_fk FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.wishlist_item
    ADD CONSTRAINT wishlist_item_item_id_item_id_fk FOREIGN KEY (item_id) REFERENCES public.item(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.wishlist_item
    ADD CONSTRAINT wishlist_item_user_id_user_id_fk FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;
`;
