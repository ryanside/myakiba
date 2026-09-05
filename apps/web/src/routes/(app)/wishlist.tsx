import {
  wishlistReleaseStatusSchema,
  wishlistSearchSchema,
} from "@myakiba/contracts/wishlist/schema";
import { Link, createFileRoute, stripSearchParams } from "@tanstack/react-router";
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
import { ViewToggle } from "@/components/ui/view-toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
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
const RELEASE_FILTERS = {
  all: { label: "All", emptyTitle: "Your Wishlist is empty" },
  upcoming: { label: "Upcoming", emptyTitle: "No upcoming items" },
  available: { label: "Available", emptyTitle: "No available items" },
};

export const Route = createFileRoute("/(app)/wishlist")({
  validateSearch: wishlistSearchSchema,
  search: { middlewares: [stripSearchParams({ releaseStatus: "all" })] },
  component: RouteComponent,
  head: () => ({
    meta: [
      { name: "description", content: "Items you plan to get" },
      { title: "Wishlist - myakiba" },
    ],
  }),
});

function RouteComponent(): React.JSX.Element {
  const { releaseStatus } = Route.useSearch();
  const navigate = Route.useNavigate();
  const itemsQuery = useWishlistItemsQuery(releaseStatus);
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
      <div className="flex flex-wrap items-start justify-between gap-4">
        <h1 className="font-heading text-2xl font-medium tracking-tight">Wishlist</h1>
        <div className="flex items-center gap-2">
          <ToggleGroup
            value={[releaseStatus]}
            variant="outline"
            aria-label="Filter Wishlist by release date"
          >
            {wishlistReleaseStatusSchema.options.map((value) => (
              <ToggleGroupItem
                key={value}
                value={value}
                onPressedChange={(pressed) => {
                  if (pressed) {
                    navigate({ search: { releaseStatus: value }, resetScroll: false });
                  }
                }}
              >
                {RELEASE_FILTERS[value].label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <ViewToggle modes={["grid", "list"]} value={viewMode} onValueChange={setViewMode} />
        </div>
      </div>

      {hasInitialError ? (
        <div className="flex h-64 items-center justify-center text-lg font-medium text-destructive">
          Error: {itemsQuery.error?.message ?? "Failed to load Wishlist"}
        </div>
      ) : null}

      {!isPending && !hasInitialError && totalCount === 0 ? (
        <Empty className="py-16">
          <EmptyHeader>
            <EmptyTitle>{RELEASE_FILTERS[releaseStatus].emptyTitle}</EmptyTitle>
            <EmptyDescription>
              {releaseStatus === "all"
                ? "Star an Item to keep it here for later."
                : "No Items in your Wishlist match this release filter."}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            {releaseStatus === "all" ? (
              <Link to="/items" className={buttonVariants({ variant: "outline" })}>
                Browse Item Database
              </Link>
            ) : (
              <Link
                to="/wishlist"
                search={{ releaseStatus: "all" }}
                resetScroll={false}
                className={buttonVariants({ variant: "outline" })}
              >
                Show all
              </Link>
            )}
          </EmptyContent>
        </Empty>
      ) : null}

      {!hasInitialError && (isPending || items.length > 0) ? (
        <WishlistItemGrid
          key={releaseStatus}
          items={items}
          releaseStatus={releaseStatus}
          viewMode={viewMode}
          currency={currency}
          dateFormat={dateFormat}
          totalCount={totalCount}
          isPending={isPending}
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
