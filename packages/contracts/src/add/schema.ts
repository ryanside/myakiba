import * as z from "zod";
import { newOrderSchema } from "../orders/schema";
import { itemDatabaseReleaseSummarySchema } from "../search/schema";
import { CATEGORIES, CONDITIONS, SHIPPING_METHODS } from "../shared/constants";
import { MAX_ADD_ROWS, MAX_COMMIT_LISTS } from "./constants";

const MAX_ITEM_ID_LENGTH = 64;

export const itemIdField = z.string().min(1).max(MAX_ITEM_ID_LENGTH);

export const addItemSchema = z.object({
  itemId: z.string(),
  externalId: z.number().int().positive().nullable(),
  title: z.string(),
  image: z.string().nullable(),
  category: z.enum(CATEGORIES).nullable(),
  latestRelease: itemDatabaseReleaseSummarySchema
    .extend({ id: z.string(), type: z.string().nullable(), barcode: z.string().nullable() })
    .nullable(),
  collectionCount: z.number().int().nonnegative(),
  onOrderCount: z.number().int().nonnegative(),
  wishlisted: z.boolean(),
});

const idsParam = z.string().max((MAX_ITEM_ID_LENGTH + 1) * MAX_ADD_ROWS);

/** `ids=a,b` arrives as a string from a URL and as an array from Elysia, which splits it on commas. */
export const addItemsQuerySchema = z.object({
  ids: z
    .union([idsParam, z.array(idsParam).max(MAX_ADD_ROWS)])
    .transform((value) => [...new Set([value].flat().flatMap((ids) => ids.split(",")))])
    .pipe(z.array(itemIdField).min(1).max(MAX_ADD_ROWS)),
});

export const addItemsResponseSchema = z.object({ items: z.array(addItemSchema) });

const dateOrNull = z.iso.date().nullable();
const scoreSchema = z.string().regex(/^(?:10(?:\.0)?|\d(?:\.\d)?)$/u, "Score is 0 to 10");
const shopSchema = z.string().trim().max(200);
const countSchema = z.number().int().min(1).max(999);

const isUnique = (values: readonly string[]) => new Set(values).size === values.length;

const addRowSchema = z.strictObject({
  itemId: itemIdField,
  price: z.number().int().nonnegative().nullable(),
  count: countSchema.optional(),
  condition: z.enum(CONDITIONS).optional(),
  score: scoreSchema.optional(),
  tags: z.array(z.string().trim().min(1).max(50)).max(20).optional(),
  notes: z.string().max(5000).optional(),
  shop: shopSchema.optional(),
  orderDate: dateOrNull.optional(),
  paymentDate: dateOrNull.optional(),
  shippingDate: dateOrNull.optional(),
  collectionDate: dateOrNull.optional(),
  shippingMethod: z.enum(SHIPPING_METHODS).optional(),
  releaseId: z.uuid().optional(),
});

const BARE_ROW_FIELDS: ReadonlySet<string> = new Set(["itemId", "price"]);

const carriesDetails = (row: z.output<typeof addRowSchema>) =>
  row.price !== null ||
  Object.entries(row).some(([field, value]) => !BARE_ROW_FIELDS.has(field) && value !== undefined);

const collectionSharedSchema = z.strictObject({
  shop: shopSchema,
  collectionDate: dateOrNull,
  shippingMethod: z.enum(SHIPPING_METHODS),
  condition: z.enum(CONDITIONS),
  count: countSchema,
});

export const addOwnershipSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("collection"), shared: collectionSharedSchema }),
  z.strictObject({
    kind: z.literal("order"),
    order: z.discriminatedUnion("kind", [
      z.strictObject({ kind: z.literal("new"), fields: newOrderSchema }),
      z.strictObject({ kind: z.literal("existing"), orderId: itemIdField }),
    ]),
  }),
  z.strictObject({ kind: z.literal("none") }),
]);

/** One Add click. A retry of the same click sends the same `commitId`, so the server answers it once. */
export const addCommitSchema = z
  .strictObject({
    commitId: z.uuidv4(),
    rows: z
      .array(addRowSchema)
      .min(1)
      .max(MAX_ADD_ROWS)
      .refine(
        (rows) => isUnique(rows.map((row) => row.itemId)),
        "Each item can be added once per commit",
      ),
    ownership: addOwnershipSchema,
    wishlist: z.boolean(),
    listIds: z
      .array(itemIdField)
      .max(MAX_COMMIT_LISTS)
      .refine(isUnique, "Each list can be named once per commit")
      .default([]),
  })
  .refine(
    (commit) => commit.ownership.kind !== "none" || !commit.rows.some(carriesDetails),
    "Rows carry details only when they become Collection Items",
  )
  .refine(
    (commit) => commit.ownership.kind !== "none" || commit.wishlist || commit.listIds.length > 0,
    "Choose where these items go",
  );

export const addCommitResponseSchema = z.object({
  committed: z.array(
    z.object({
      itemId: z.string(),
      externalId: z.number().int().positive().nullable(),
      title: z.string(),
      image: z.string().nullable(),
      collectionId: z.string().nullable(),
    }),
  ),
  orderId: z.string().nullable(),
  wishlistAdded: z.number().int().nonnegative(),
  listIds: z.array(z.string()),
});

export type AddCommitResponse = z.output<typeof addCommitResponseSchema>;

/** The price a row gets when the user leaves it blank, in the user's currency's minor units. */
export function releasePriceDefault(
  release: { readonly price: number | null; readonly priceCurrency: string | null } | null,
  userCurrency: string,
): number {
  return release?.priceCurrency === userCurrency ? (release.price ?? 0) : 0;
}
