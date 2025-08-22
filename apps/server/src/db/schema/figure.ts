import {
  pgTable,
  text,
  timestamp,
  integer,
  date,
  primaryKey,
  index,
  uuid,
  decimal,
} from "drizzle-orm/pg-core";
import { user } from "./auth";

export const item = pgTable("item", {
  id: integer("id").primaryKey(), // integer id from MFC
  title: text("title").notNull(),
  category: text("category"),
  version: text("version").array(),
  scale: text("scale").default("NON_SCALE"),
  height: integer("height"),
  width: integer("width"),
  depth: integer("depth"),
  image: text("image"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const item_release = pgTable(
  "item_release",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    itemId: integer("item_id")
      .notNull()
      .references(() => item.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    type: text("type"), // "original", "rerelease", "limited", etc.
    price: decimal("price", { scale: 2 }),
    priceCurrency: text("price_currency"),
    barcode: text("barcode"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("item_release_item_id_index").on(t.itemId),
    index("item_release_price_currency_index").on(t.priceCurrency), // For MSRP currency filtering
  ]
);

export const entry = pgTable("entry", {
  id: integer("id").primaryKey(), // integer id from MFC
  category: text("category").notNull(), // classifications, origin, character, company, artist, material, event
  name: text("name").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

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
  (t) => [primaryKey({ columns: [t.entryId, t.itemId] })]
);

export const collection = pgTable(
  "collection",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    itemId: integer("item_id")
      .notNull()
      .references(() => item.id, { onDelete: "cascade" }),
    orderId: uuid("order_id").references(() => order.id, {
      onDelete: "cascade",
    }),
    status: text("status").notNull().default("Owned"),
    count: integer("count").default(1),
    releaseId: uuid("release_id").references(() => item_release.id, {
      onDelete: "cascade",
    }),
    score: decimal("score", { precision: 3, scale: 1 }).default("0.0"),
    price: decimal("price", { scale: 2 }),
    shop: text("shop"),
    orderDate: date("order_date"),
    paymentDate: date("payment_date"),
    shippingDate: date("shipping_date"),
    collectionDate: date("collection_date"),
    shippingMethod: text("shipping_method"),
    shippingFee: decimal("shipping_fee", { scale: 2 }),
    soldFor: decimal("sold_for", { scale: 2 }),
    soldDate: date("sold_date"),
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("collection_user_id_index").on(t.userId),
    index("collection_user_status_index").on(t.userId, t.status), // For status filtering by user
    index("collection_user_created_index").on(t.userId, t.createdAt), // For date range queries by user
    index("collection_status_created_index").on(t.status, t.createdAt), // For monthly status filtering
    index("collection_order_id_index").on(t.orderId),
  ]
);

export const order = pgTable(
  "order",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title"),
    shop: text("shop"),
    orderDate: date("order_date"),
    paymentDate: date("payment_date"),
    shippingDate: date("shipping_date"),
    collectionDate: date("collection_date"),
    shippingMethod: text("shipping_method"),
    shippingFee: decimal("shipping_fee", { scale: 2 }),
    miscellaneousAmount: decimal("miscellaneous_amount", { scale: 2 }),
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("order_user_id_index").on(t.userId),
    index("order_order_date_index").on(t.orderDate),
  ]
);

export const budget = pgTable("budget", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  period: text("period").$type<"monthly" | "annual" | "allocated">().notNull(),
  amount: decimal("amount", { scale: 2 }).notNull(),
  currency: text("currency"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
