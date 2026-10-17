import type { PositionOrderInput } from "@myakiba/contracts/shared/position-order";
import { WISHLIST_PAGE_SIZE } from "@myakiba/contracts/wishlist/schema";
import type { WishlistReleaseStatus } from "@myakiba/contracts/wishlist/schema";
import { app } from "@/lib/treaty-client";
import type { getItem } from "@/queries/item";
import { defineCommand, defineResource, infiniteRead, unwrap } from "../client";

type ItemQueryData = Awaited<ReturnType<typeof getItem>>;

type ItemsInput = { readonly releaseStatus: WishlistReleaseStatus; readonly today: string };

type Membership = {
  readonly itemId: string;
  readonly itemExternalId: number | null;
  readonly wishlisted: boolean;
};

export const wishlist = defineResource("wishlist", {
  items: infiniteRead({
    pageSize: WISHLIST_PAGE_SIZE,
    failure: "Failed to load Wishlist",
    // The server filters by today only for the dated views. Keying All by day would
    // refetch it at midnight and drop a move that is still saving.
    identify: ({ releaseStatus, today }: ItemsInput) =>
      releaseStatus === "all" ? { releaseStatus } : { releaseStatus, today },
    request: ({ releaseStatus, today }, { limit, offset }) =>
      app.api.wishlist.get({ query: { limit, offset, releaseStatus, today } }),
  }),
});

export type WishlistPage = NonNullable<Awaited<ReturnType<typeof app.api.wishlist.get>>["data"]>;

export const setWishlistMembership = defineCommand({
  invalidates: ["wishlist"],
  failureTitle: ({ wishlisted }: Membership) =>
    wishlisted ? "Failed to add to Wishlist" : "Failed to remove from Wishlist",
  persist: async ({ itemId, wishlisted }: Membership) => {
    const item = app.api.wishlist({ itemId });
    if (wishlisted) await unwrap(item.put(), "Failed to add to Wishlist");
    else await unwrap(item.delete(), "Failed to remove from Wishlist");
  },
  saved: async (queryClient, { itemExternalId, wishlisted }) => {
    if (itemExternalId === null) return;
    await queryClient.cancelQueries({ queryKey: ["item", itemExternalId], exact: true });
    queryClient.setQueryData<ItemQueryData>(["item", itemExternalId], (current) =>
      current ? { ...current, isWishlisted: wishlisted } : current,
    );
    await queryClient.invalidateQueries({
      queryKey: ["item", itemExternalId],
      exact: true,
      refetchType: "none",
    });
  },
});

export async function moveWishlistItems(intent: PositionOrderInput): Promise<void> {
  await unwrap(
    app.api.wishlist.order.patch({ ...intent, movedIds: [...intent.movedIds] }),
    "Failed to save Wishlist order",
  );
}
