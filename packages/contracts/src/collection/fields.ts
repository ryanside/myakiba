import * as z from "zod";
import { countSchema } from "../add/schema";
import { COLLECTION_STATUSES, CONDITIONS, SHIPPING_METHODS } from "../shared/constants";
import { WRITE_LIMITS } from "../shared/write-limits";

/** The value a client may write to each field of a Collection Item. */
export const COLLECTION_FIELD = {
  status: z.enum(COLLECTION_STATUSES),
  count: countSchema,
  score: z.string().max(WRITE_LIMITS.label),
  price: z.number().int(),
  shop: z.string().trim().max(WRITE_LIMITS.shop),
  orderDate: z.iso.date().nullable(),
  paymentDate: z.iso.date().nullable(),
  shippingDate: z.iso.date().nullable(),
  collectionDate: z.iso.date().nullable(),
  shippingMethod: z.enum(SHIPPING_METHODS),
  tags: z.array(z.string().max(WRITE_LIMITS.tag)).max(WRITE_LIMITS.tags),
  notes: z.string().max(WRITE_LIMITS.notes),
  releaseId: z.string().max(WRITE_LIMITS.id).nullable(),
  condition: z.enum(CONDITIONS),
};
