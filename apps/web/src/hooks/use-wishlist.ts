import type { WishlistReleaseStatus } from "@myakiba/contracts/wishlist/schema";
import { useInfiniteRead } from "@/data/client";
import { moveWishlistItems, wishlist } from "@/data/resources/wishlist";
import { usePositionOrderMutation } from "@/data/position-order";
import { useToday } from "@/hooks/use-today";

export function useWishlistItemsQuery(releaseStatus: WishlistReleaseStatus) {
  const today = useToday();
  return useInfiniteRead(wishlist.items, { releaseStatus, today });
}

export function useMoveWishlistItemsMutation() {
  return usePositionOrderMutation({
    queryKey: wishlist.items.key({ releaseStatus: "all" }),
    additionalInvalidations: [
      { queryKey: wishlist.items.partialKey({ releaseStatus: "upcoming" }) },
      { queryKey: wishlist.items.partialKey({ releaseStatus: "available" }) },
    ],
    persist: moveWishlistItems,
    failureTitle: "Failed to save Wishlist order",
  });
}
