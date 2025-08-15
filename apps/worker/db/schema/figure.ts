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
    price: decimal("price"),
    priceCurrency: text("price_currency"),
    barcode: text("barcode"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("item_release_item_id_index").on(t.itemId)]
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
    status: text("status").notNull().default("Owned"),
    count: integer("count").default(1),
    releaseId: uuid("release_id").references(() => item_release.id, {
      onDelete: "cascade",
    }), 
    score: integer("score").default(0),
    price: decimal("price"),
    shop: text("shop"),
    paymentDate: date("payment_date"),
    shippingDate: date("shipping_date"),
    collectionDate: date("collection_date"),
    shippingMethod: text("shipping_method"),
    shippingFee: integer("shipping_fee").default(0),
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("collection_user_id_index").on(t.userId)]
);

export const expense = pgTable(
  "expense",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title"),
    shop: text("shop"),
    paymentDate: date("payment_date"),
    shippingDate: date("shipping_date"),
    collectionDate: date("collection_date"),
    shippingMethod: text("shipping_method"),
    shippingFee: integer("shipping_fee"),
    miscellaneousAmount: integer("miscellaneous_amount"), // For custom items like display cases, tools, etc.
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("expense_user_id_index").on(t.userId)]
);

export const expense_to_collection = pgTable(
  "expense_to_collection",
  {
    expenseId: uuid("expense_id")
      .notNull()
      .references(() => expense.id, { onDelete: "cascade" }),
    collectionId: uuid("collection_id")
      .notNull()
      .references(() => collection.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.expenseId, t.collectionId] })]
);

export const budget = pgTable("budget", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  period: text("period").$type<"monthly" | "annual" | "allocated">().notNull(),
  amount: decimal("amount").notNull(),
  currency: text("currency"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
