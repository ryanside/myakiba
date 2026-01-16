import {
  pgTable,
  text,
  timestamp,
  integer,
  date,
  primaryKey,
  uuid,
  decimal,
  index,
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
    id: integer("id").primaryKey(), // integer id from MFC
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
  (t) => [index("item_title_idx").on(t.title)]
);

export const item_release = pgTable(
  "item_release",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    itemId: integer("item_id")
      .notNull()
      .references(() => item.id, { onDelete: "cascade" }),
    date: date("date", { mode: "string" }).notNull(),
    type: text("type"), // "original", "rerelease", "limited", etc.
    price: decimal("price", { precision: 14, scale: 2 }),
    priceCurrency: text("price_currency"),
    barcode: text("barcode"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("item_release_item_id_date_idx").on(t.itemId, t.date.desc())]
);

export const entry = pgTable(
  "entry",
  {
    id: integer("id").primaryKey(),
    category: text("category").notNull(), // classifications, origin, character, company, artist, material, event
    name: text("name").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("entry_name_idx").on(t.name)]
);

export const entry_to_item = pgTable(
  "entry_to_item",
  {
    entryId: integer("entry_id")
      .notNull()
      .references(() => entry.id, { onDelete: "cascade" }),
    itemId: integer("item_id")
      .notNull()
      .references(() => item.id, { onDelete: "cascade" }),
    role: text("role"), // "manufacturer", "sculptor", "exhibition", "etc."
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.entryId, t.itemId] }),
    index("entry_to_item_entry_id_idx").on(t.entryId),
  ]
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
    itemId: integer("item_id")
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
    score: decimal("score", { precision: 3, scale: 1 })
      .default("0.0")
      .notNull(),
    price: decimal("price", { precision: 14, scale: 2 }).default("0.00").notNull(),
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
    soldFor: decimal("sold_for", { precision: 14, scale: 2 }),
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
  ]
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
    releaseMonthYear: date("release_month_year", { mode: "string" }),
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
    shippingFee: decimal("shipping_fee", { precision: 14, scale: 2 })
      .default("0.00")
      .notNull(),
    taxes: decimal("taxes", { precision: 14, scale: 2 }).default("0.00").notNull(),
    duties: decimal("duties", { precision: 14, scale: 2 }).default("0.00").notNull(),
    tariffs: decimal("tariffs", { precision: 14, scale: 2 }).default("0.00").notNull(),
    miscFees: decimal("misc_fees", { precision: 14, scale: 2 }).default("0.00").notNull(),
    notes: text("notes").default("").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    // High-priority composite index
    index("order_user_id_status_idx").on(t.userId, t.status),
    // Medium-priority single-column index
    index("order_release_month_year_idx").on(t.releaseMonthYear),
    // Text search index
    index("order_title_idx").on(t.title),
  ]
);

export const budget = pgTable("budget", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  period: text("period").$type<"monthly" | "annual" | "allocated">().notNull(),
  amount: decimal("amount", { precision: 14, scale: 2 }).notNull(),
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
