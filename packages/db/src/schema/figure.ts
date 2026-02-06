import {
  pgTable,
  text,
  timestamp,
  integer,
  date,
  primaryKey,
  uuid,
  decimal,
  bigint,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { createId } from "@paralleldrive/cuid2";
import {
  COLLECTION_STATUSES,
  SHIPPING_METHODS,
  ORDER_STATUSES,
  CONDITIONS,
} from "@myakiba/constants/enums";
import { CATEGORIES } from "@myakiba/constants/categories";

export const item = pgTable(
  "item",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    externalId: integer("external_id"),
    source: text("source").$type<"mfc" | "custom">().notNull().default("mfc"),
    title: text("title").notNull(),
    category: text("category", {
      enum: CATEGORIES,
    }),
    version: text("version").array(),
    scale: text("scale").default("NON_SCALE"),
    height: integer("height"),
    width: integer("width"),
    depth: integer("depth"),
    image: text("image"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("item_title_idx").on(t.title),
    uniqueIndex("item_source_external_id_idx").on(t.source, t.externalId),
  ],
);

export const item_release = pgTable(
  "item_release",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    itemId: text("item_id")
      .notNull()
      .references(() => item.id, { onDelete: "cascade" }),
    date: date("date", { mode: "string" }).notNull(),
    type: text("type"), // "original", "rerelease", "limited", etc.
    price: bigint("price", { mode: "number" }),
    priceCurrency: text("price_currency"),
    barcode: text("barcode"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("item_release_item_id_date_idx").on(t.itemId, t.date.desc())],
);

export const entry = pgTable(
  "entry",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    externalId: integer("external_id"),
    source: text("source").$type<"mfc" | "custom">().notNull().default("mfc"),
    category: text("category").notNull(), // classifications, origin, character, company, artist, material, event
    name: text("name").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("entry_name_idx").on(t.name),
    uniqueIndex("entry_source_external_id_idx").on(t.source, t.externalId),
  ],
);

export const entry_to_item = pgTable(
  "entry_to_item",
  {
    entryId: text("entry_id")
      .notNull()
      .references(() => entry.id, { onDelete: "cascade" }),
    itemId: text("item_id")
      .notNull()
      .references(() => item.id, { onDelete: "cascade" }),
    role: text("role"), // "manufacturer", "sculptor", "exhibition", "etc."
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.entryId, t.itemId] }),
    index("entry_to_item_entry_id_idx").on(t.entryId),
  ],
);

export const collection = pgTable(
  "collection",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    itemId: text("item_id")
      .notNull()
      .references(() => item.id, { onDelete: "cascade" }),
    orderId: text("order_id").references(() => order.id, {
      onDelete: "set null",
    }),
    status: text("status", {
      enum: COLLECTION_STATUSES,
    })
      .notNull()
      .default("Owned"),
    count: integer("count").default(1).notNull(),
    releaseId: uuid("release_id").references(() => item_release.id, {
      onDelete: "set null",
    }),
    score: decimal("score", { precision: 3, scale: 1 }).default("0.0").notNull(),
    price: bigint("price", { mode: "number" }).default(0).notNull(),
    shop: text("shop").default("").notNull(),
    orderDate: date("order_date", { mode: "string" }),
    paymentDate: date("payment_date", { mode: "string" }),
    shippingDate: date("shipping_date", { mode: "string" }),
    collectionDate: date("collection_date", { mode: "string" }),
    shippingMethod: text("shipping_method", {
      enum: SHIPPING_METHODS,
    })
      .default("n/a")
      .notNull(),
    soldFor: bigint("sold_for", { mode: "number" }),
    soldDate: date("sold_date", { mode: "string" }),
    tags: text("tags").array().default([]).notNull(),
    condition: text("condition", {
      enum: CONDITIONS,
    })
      .default("New")
      .notNull(),
    notes: text("notes").default("").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    // High-priority composite indexes
    index("collection_user_id_status_idx").on(t.userId, t.status),
    index("collection_user_id_item_id_idx").on(t.userId, t.itemId),
    index("collection_user_id_order_id_idx").on(t.userId, t.orderId),
    // Medium-priority single-column indexes
    index("collection_collection_date_idx").on(t.collectionDate),
    index("collection_payment_date_idx").on(t.paymentDate),
    index("collection_created_at_idx").on(t.createdAt),
  ],
);

export const order = pgTable(
  "order",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    shop: text("shop").default("").notNull(),
    orderDate: date("order_date", { mode: "string" }),
    releaseDate: date("release_date", { mode: "string" }),
    paymentDate: date("payment_date", { mode: "string" }),
    shippingDate: date("shipping_date", { mode: "string" }),
    collectionDate: date("collection_date", { mode: "string" }),
    shippingMethod: text("shipping_method", {
      enum: SHIPPING_METHODS,
    })
      .default("n/a")
      .notNull(),
    status: text("status", {
      enum: ORDER_STATUSES,
    })
      .default("Ordered")
      .notNull(),
    shippingFee: bigint("shipping_fee", { mode: "number" }).default(0).notNull(),
    taxes: bigint("taxes", { mode: "number" }).default(0).notNull(),
    duties: bigint("duties", { mode: "number" }).default(0).notNull(),
    tariffs: bigint("tariffs", { mode: "number" }).default(0).notNull(),
    miscFees: bigint("misc_fees", { mode: "number" }).default(0).notNull(),
    notes: text("notes").default("").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    // High-priority composite index
    index("order_user_id_status_idx").on(t.userId, t.status),
    // Medium-priority single-column index
    index("order_release_date_idx").on(t.releaseDate),
    // Text search index
    index("order_title_idx").on(t.title),
  ],
);

export const budget = pgTable("budget", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  period: text("period").$type<"monthly" | "annual" | "allocated">().notNull(),
  amount: bigint("amount", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const waitlist = pgTable("waitlist", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  email: text("email").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
