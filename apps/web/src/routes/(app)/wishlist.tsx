import { Link, createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { WishlistItemGrid } from "@/components/wishlist/wishlist-item-grid";
import { InfiniteListStatus } from "@/components/lists/infinite-list-status";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { ViewToggle } from "@/components/ui/view-toggle";
import type { GridListViewMode } from "@/components/ui/view-toggle";
import { buttonVariants } from "@/components/ui/button";
import {
  useMoveWishlistItemsMutation,
  useWishlistItemsQuery,
  useWishlistItemMutation,
} from "@/hooks/use-wishlist";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { useUserPreferences } from "@/hooks/use-user-preferences";

const VIEW_MODE_KEY = "wishlist:viewMode";

export const Route = createFileRoute("/(app)/wishlist")({
  component: RouteComponent,
  head: () => ({
    meta: [
      { name: "description", content: "Items you plan to get" },
      { title: "Wishlist - myakiba" },
    ],
  }),
});

function RouteComponent(): React.JSX.Element {
  const itemsQuery = useWishlistItemsQuery();
  const items = useMemo(
    () => itemsQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [itemsQuery.data?.pages],
  );
  const totalCount = itemsQuery.data?.pages[0]?.totalCount ?? 0;
  const [viewMode, setViewMode] = useLocalStorage<GridListViewMode>(VIEW_MODE_KEY, "grid");
  const { currency, dateFormat } = useUserPreferences();
  const itemMutation = useWishlistItemMutation();
  const moveMutation = useMoveWishlistItemsMutation();
  const handleLoadMore = itemsQuery.fetchNextPage;
  const isPending = itemsQuery.isPending;
  const hasInitialError = itemsQuery.isError && !itemsQuery.data;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6" aria-busy={isPending}>
      <div className="flex items-start justify-between gap-4">
        <h1 className="font-heading text-2xl font-medium tracking-tight">Wishlist</h1>
        <ViewToggle modes={["grid", "list"]} value={viewMode} onValueChange={setViewMode} />
      </div>

      {isPending && viewMode === "grid" ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-2">
          {Array.from({ length: 10 }).map((_, index) => (
            <Skeleton key={index} className="aspect-square w-full rounded-lg" />
          ))}
        </div>
      ) : null}

      {isPending && viewMode === "list" ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="flex items-center gap-3 p-2">
              <Skeleton className="size-16 shrink-0 rounded-md" />
              <div className="flex h-16 min-w-0 flex-1 items-center justify-between gap-4 py-0.5">
                <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5">
                  <Skeleton className="h-4 w-3/4" />
                  <div className="space-y-1">
                    <Skeleton className="h-2.5 w-16" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                </div>
                <div className="shrink-0 space-y-1">
                  <Skeleton className="ml-auto h-2.5 w-16" />
                  <Skeleton className="ml-auto h-3 w-14" />
                </div>
              </div>
              <div className="mr-1 flex shrink-0 gap-1 p-0.5">
                <Skeleton className="size-8 rounded-md" />
                <Skeleton className="size-8 rounded-md" />
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {hasInitialError ? (
        <div className="flex h-64 items-center justify-center text-lg font-medium text-destructive">
          Error: {itemsQuery.error?.message ?? "Failed to load Wishlist"}
        </div>
      ) : null}

      {!isPending && !hasInitialError && totalCount === 0 ? (
        <Empty className="py-16">
          <EmptyHeader>
            <EmptyTitle>Your Wishlist is empty</EmptyTitle>
            <EmptyDescription>Star an Item to keep it here for later.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Link to="/items" className={buttonVariants({ variant: "outline" })}>
              Browse Item Database
            </Link>
          </EmptyContent>
        </Empty>
      ) : null}

      {!isPending && !hasInitialError && items.length > 0 ? (
        <WishlistItemGrid
          items={items}
          viewMode={viewMode}
          currency={currency}
          dateFormat={dateFormat}
          totalCount={totalCount}
          isSaving={moveMutation.isPending}
          sortingDisabled={itemMutation.isPending}
          removingItemId={itemMutation.isPending ? itemMutation.variables?.itemId : undefined}
          hasNextPage={itemsQuery.hasNextPage}
          isFetchingNextPage={itemsQuery.isFetchingNextPage}
          onLoadMore={handleLoadMore}
          onRemove={async (itemId, itemExternalId) => {
            await itemMutation.mutateAsync({ itemId, itemExternalId, wishlisted: false });
          }}
          onMove={async (intent) => {
            await moveMutation.move(intent);
          }}
        />
      ) : null}

      {!isPending && !hasInitialError && totalCount > 0 ? (
        <InfiniteListStatus
          hasNextPage={itemsQuery.hasNextPage}
          isFetchingNextPage={itemsQuery.isFetchingNextPage}
          isFetchNextPageError={itemsQuery.isFetchNextPageError}
          disabled={itemMutation.isPending}
          onLoadMore={async () => {
            await handleLoadMore();
          }}
        />
      ) : null}
    </div>
  );
}
