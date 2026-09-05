import * as z from "zod";

export const WISHLIST_PAGE_SIZE = 25;

export const wishlistItemIdSchema = z.string().trim().min(1);

export const wishlistReleaseStatusSchema = z.enum(["all", "upcoming", "available"]);
export type WishlistReleaseStatus = z.infer<typeof wishlistReleaseStatusSchema>;

export const wishlistSearchSchema = z.object({
  releaseStatus: wishlistReleaseStatusSchema.default("all"),
});
