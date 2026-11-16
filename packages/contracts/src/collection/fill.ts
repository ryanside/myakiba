import * as z from "zod";
import { idListSchema } from "../shared/write-limits";
import { COLLECTION_FIELD } from "./fields";

const fillOf = <const Field extends keyof typeof COLLECTION_FIELD>(field: Field) =>
  z.strictObject({ field: z.literal(field), value: COLLECTION_FIELD[field] });

/**
 * One field and the value to write to it on every chosen Collection Item. A tags fill adds its
 * tags to each row's own; every other fill replaces the field. A release belongs to one Item, so
 * it has no fill.
 */
export const ITEM_FILL = {
  status: fillOf("status"),
  paid: fillOf("paid"),
  price: fillOf("price"),
  count: fillOf("count"),
  condition: fillOf("condition"),
  shop: fillOf("shop"),
  orderDate: fillOf("orderDate"),
  paymentDate: fillOf("paymentDate"),
  shippingDate: fillOf("shippingDate"),
  collectionDate: fillOf("collectionDate"),
  shippingMethod: fillOf("shippingMethod"),
  score: fillOf("score"),
  tags: fillOf("tags"),
  notes: fillOf("notes"),
} satisfies { readonly [Field in keyof typeof COLLECTION_FIELD]?: z.ZodType<{ field: Field }> };

const itemFillSchema = z.union(Object.values(ITEM_FILL));

export type ItemFill = z.infer<typeof itemFillSchema>;

export const fillItemsBodySchema = z.strictObject({ ids: idListSchema, fill: itemFillSchema });

export type FillItemsBody = z.infer<typeof fillItemsBodySchema>;
