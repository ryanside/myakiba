import * as z from "zod";
import { paginationLimitSchema, paginationOffsetSchema } from "../shared/pagination";

export const ENTRY_ITEMS_PAGE_SIZE = 12;

/** `ordered` holds Ordered and Shipped Order Items. */
export const entryItemStateSchema = z.enum(["owned", "ordered", "wishlist"]);

export type EntryItemState = z.infer<typeof entryItemStateSchema>;

export const entryItemsQuerySchema = z.object({
  state: entryItemStateSchema,
  limit: paginationLimitSchema.optional().default(ENTRY_ITEMS_PAGE_SIZE),
  offset: paginationOffsetSchema.optional().default(0),
});
