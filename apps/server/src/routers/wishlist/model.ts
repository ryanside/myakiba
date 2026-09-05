import * as z from "zod";
import { WISHLIST_PAGE_SIZE, wishlistItemIdSchema } from "@myakiba/contracts/wishlist/schema";
import {
  paginationLimitSchema,
  paginationOffsetSchema,
} from "@myakiba/contracts/shared/pagination";

export const wishlistItemIdParamSchema = z.object({ itemId: wishlistItemIdSchema });

export const wishlistPageQuerySchema = z.object({
  limit: paginationLimitSchema.optional().default(WISHLIST_PAGE_SIZE),
  offset: paginationOffsetSchema.optional().default(0),
});
