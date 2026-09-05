import { WISHLIST_PAGE_SIZE } from "@myakiba/contracts/wishlist/schema";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { getItem } from "@/queries/item";
import {
  addItemToWishlist,
  getWishlistEntries,
  moveWishlistEntries,
  removeItemFromWishlist,
} from "@/queries/wishlist";
import { toast } from "@/components/ui/toast";
import { usePositionOrderMutation } from "@/hooks/use-position-order-mutation";

type ItemQueryData = Awaited<ReturnType<typeof getItem>>;

export function useWishlistEntriesQuery() {
  return useInfiniteQuery({
    queryKey: ["wishlist", "entries"] as const,
    queryFn: ({ pageParam }) => getWishlistEntries(WISHLIST_PAGE_SIZE, pageParam),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const loadedCount = allPages.reduce((count, page) => count + page.items.length, 0);
      return loadedCount < lastPage.totalCount ? loadedCount : undefined;
    },
  });
}

export function useWishlistItemMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      itemId,
      wishlisted,
    }: {
      readonly itemId: string;
      readonly itemExternalId: number | null;
      readonly wishlisted: boolean;
    }) => {
      if (wishlisted) {
        await addItemToWishlist(itemId);
      } else {
        await removeItemFromWishlist(itemId);
      }
    },
    onSuccess: async (_result, { itemExternalId, wishlisted }) => {
      if (itemExternalId !== null) {
        await queryClient.cancelQueries({ queryKey: ["item", itemExternalId], exact: true });
        queryClient.setQueryData<ItemQueryData>(["item", itemExternalId], (current) =>
          current ? { ...current, isWishlisted: wishlisted } : current,
        );
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["wishlist", "entries"], exact: true }),
        ...(itemExternalId === null
          ? []
          : [
              queryClient.invalidateQueries({
                queryKey: ["item", itemExternalId],
                exact: true,
                refetchType: "none",
              }),
            ]),
      ]);
    },
    onError: (_error, { wishlisted }) => {
      toast.add({
        type: "error",
        title: wishlisted ? "Failed to add to Wishlist" : "Failed to remove from Wishlist",
      });
    },
  });
}

export function useMoveWishlistEntriesMutation() {
  return usePositionOrderMutation({
    queryKey: ["wishlist", "entries"],
    persist: moveWishlistEntries,
    failureTitle: "Failed to save Wishlist order",
  });
}
