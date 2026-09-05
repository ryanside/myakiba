import type { PositionOrderInput } from "@myakiba/contracts/shared/position-order";
import type { WishlistReleaseStatus } from "@myakiba/contracts/wishlist/schema";
import { format } from "date-fns";
import { app, getErrorMessage } from "@/lib/treaty-client";

export async function getWishlistItems(
  limit: number,
  offset: number,
  releaseStatus: WishlistReleaseStatus,
) {
  const { data, error } = await app.api.wishlist.get({
    query: { limit, offset, releaseStatus, today: format(new Date(), "yyyy-MM-dd") },
  });
  if (error) throw new Error(getErrorMessage(error, "Failed to load Wishlist"));
  return data;
}

export async function addItemToWishlist(itemId: string) {
  const { data, error } = await app.api.wishlist({ itemId }).put();
  if (error) throw new Error(getErrorMessage(error, "Failed to add to Wishlist"));
  return data;
}

export async function removeItemFromWishlist(itemId: string) {
  const { data, error } = await app.api.wishlist({ itemId }).delete();
  if (error) throw new Error(getErrorMessage(error, "Failed to remove from Wishlist"));
  return data;
}

export async function moveWishlistItems(intent: PositionOrderInput): Promise<void> {
  const { error } = await app.api.wishlist.order.patch({
    ...intent,
    movedIds: [...intent.movedIds],
  });
  if (error) throw new Error(getErrorMessage(error, "Failed to save Wishlist order"));
}
