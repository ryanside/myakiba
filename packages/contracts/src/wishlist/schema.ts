import * as z from "zod";

export const WISHLIST_PAGE_SIZE = 25;

export const wishlistItemIdSchema = z.string().trim().min(1);
