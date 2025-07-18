import {
  pgTable,
  text,
  timestamp,
  integer,
  date,
  primaryKey,
} from "drizzle-orm/pg-core";
import { user } from "./auth";

export const figure = pgTable("figure", {
  id: integer("id").primaryKey(),
  title: text("title").notNull(),
  category: text("category"),
  classification: text("classification"),
  version: text("version"),
  scale: text("scale").default("NON_SCALE"),
  height: integer("height"),
  width: integer("width"),
  depth: integer("depth"),
  image: text("image"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const figure_release = pgTable("figure_release", {
  id: text("id").primaryKey(),
  figureId: integer("figure_id")
    .notNull()
    .references(() => figure.id, { onDelete: "cascade" }),
  releaseDate: date("release_date").notNull(),
  releaseType: text("release_type"), // "original", "rerelease", "limited", etc.
  region: text("region"), // "JP", "US", "EU", etc.
  price: integer("price"),
  barcode: integer("barcode"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const collection = pgTable(
  "collection",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    figureId: integer("figure_id")
      .notNull()
      .references(() => figure.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("owned"), // owned, ordered
    releaseId: text("release_id").references(() => figure_release.id, {
      onDelete: "cascade",
    }),
    count: integer("count").default(1),
    score: integer("score").default(0),
    paymentDate: timestamp("payment_date"),
    shippingDate: timestamp("shipping_date"),
    collectionDate: timestamp("collection_date"),
    price: integer("price"),
    shop: text("shop"),
    shippingMethod: text("shipping_method"),
    shippingFee: integer("shipping_fee"),
    trackingNumber: text("tracking_number"),
    mfcUrl: text("mfc_url"),
    note: text("note"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.figureId] })]
);

export const origin = pgTable("origin", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const figure_to_origin = pgTable(
  "figure_to_origin",
  {
    figureId: integer("figure_id")
      .notNull()
      .references(() => figure.id, { onDelete: "cascade" }),
    originId: text("origin_id")
      .notNull()
      .references(() => origin.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.figureId, t.originId] })]
);

export const character = pgTable("character", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const figure_to_character = pgTable(
  "figure_to_character",
  {
    figureId: integer("figure_id")
      .notNull()
      .references(() => figure.id, { onDelete: "cascade" }),
    characterId: text("character_id")
      .notNull()
      .references(() => character.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.figureId, t.characterId] })]
);

export const company = pgTable("company", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const figure_to_company = pgTable(
  "figure_to_company",
  {
    figureId: integer("figure_id")
      .notNull()
      .references(() => figure.id, { onDelete: "cascade" }),
    companyId: text("company_id")
      .notNull()
      .references(() => company.id, { onDelete: "cascade" }),
    role: text("role"), // "manufacturer", "distributor", "etc."
  },
  (t) => [primaryKey({ columns: [t.figureId, t.companyId] })]
);

export const artist = pgTable("artist", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const figure_to_artist = pgTable(
  "figure_to_artist",
  {
    figureId: integer("figure_id")
      .notNull()
      .references(() => figure.id, { onDelete: "cascade" }),
    artistId: text("artist_id")
      .notNull()
      .references(() => artist.id, { onDelete: "cascade" }),
    role: text("role"), // "designer", "sculptor", "painter", "etc."
  },
  (t) => [primaryKey({ columns: [t.figureId, t.artistId] })]
);

export const material = pgTable("material", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const figure_to_material = pgTable(
  "figure_to_material",
  {
    figureId: integer("figure_id")
      .notNull()
      .references(() => figure.id, { onDelete: "cascade" }),
    materialId: text("material_id")
      .notNull()
      .references(() => material.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.figureId, t.materialId] })]
);
