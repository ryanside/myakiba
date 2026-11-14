import type { PositionOrderInput } from "@myakiba/contracts/shared/position-order";
import { WISHLIST_PAGE_SIZE } from "@myakiba/contracts/wishlist/schema";
import type { WishlistReleaseStatus } from "@myakiba/contracts/wishlist/schema";
import { app } from "@/lib/treaty-client";
import type { getItem } from "@/queries/item";
import type { InferOk, Result } from "better-result";
import { call } from "../api";
import type { ApiFailure } from "../api";
import { defineCommand, defineResource, infiniteRead } from "../client";
import { positionOrderCommand } from "../position-order";
import { items } from "./item";

type ItemQueryData = InferOk<Awaited<ReturnType<typeof getItem>>>;

type ItemsInput = { readonly releaseStatus: WishlistReleaseStatus; readonly today: string };

type Membership = {
  readonly itemId: string;
  readonly itemExternalId: number | null;
  readonly wishlisted: boolean;
};

export const wishlist = defineResource("wishlist", {
  items: infiniteRead({
    pageSize: WISHLIST_PAGE_SIZE,
    staleTime: 30_000,
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
  failureToast: ({ wishlisted }: Membership) => ({
    title: wishlisted ? "Failed to add to Wishlist" : "Failed to remove from Wishlist",
  }),
  persist: async ({ itemId, wishlisted }: Membership) => {
    const item = app.api.wishlist({ itemId });
    const written: Result<unknown, ApiFailure> = wishlisted
      ? await call(item.put(), { fallback: "Failed to add to Wishlist" })
      : await call(item.delete(), { fallback: "Failed to remove from Wishlist" });
    return written.map((): void => undefined);
  },
  saved: async (queryClient, { itemExternalId, wishlisted }) => {
    if (itemExternalId === null) return;
    await queryClient.cancelQueries({ queryKey: items.detail.key(itemExternalId), exact: true });
    queryClient.setQueryData<ItemQueryData>(items.detail.key(itemExternalId), (current) =>
      current ? { ...current, isWishlisted: wishlisted } : current,
    );
    await queryClient.invalidateQueries({
      queryKey: items.detail.key(itemExternalId),
      exact: true,
      refetchType: "none",
    });
  },
});

export const moveWishlistItemsCommand = positionOrderCommand({
  family: "wishlist",
  queryKey: wishlist.items.key({ releaseStatus: "all" }),
  additionalInvalidations: [
    { queryKey: wishlist.items.partialKey({ releaseStatus: "upcoming" }) },
    { queryKey: wishlist.items.partialKey({ releaseStatus: "available" }) },
  ],
  persist: (intent: PositionOrderInput) =>
    call(app.api.wishlist.order.patch({ ...intent, movedIds: [...intent.movedIds] }), {
      fallback: "Failed to save Wishlist order",
    }),
  failureTitle: "Failed to save Wishlist order",
});
