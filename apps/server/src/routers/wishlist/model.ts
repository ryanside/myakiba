import * as z from "zod";
import {
  WISHLIST_PAGE_SIZE,
  wishlistItemIdSchema,
  wishlistSearchSchema,
} from "@myakiba/contracts/wishlist/schema";
import {
  paginationLimitSchema,
  paginationOffsetSchema,
} from "@myakiba/contracts/shared/pagination";

export const wishlistItemIdParamSchema = z.object({ itemId: wishlistItemIdSchema });

export const wishlistPageQuerySchema = wishlistSearchSchema.extend({
  limit: paginationLimitSchema.optional().default(WISHLIST_PAGE_SIZE),
  offset: paginationOffsetSchema.optional().default(0),
  today: z.iso.date(),
});

export type WishlistPageQuery = z.infer<typeof wishlistPageQuerySchema>;
