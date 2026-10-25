import {
  wishlistReleaseStatusSchema,
  wishlistSearchSchema,
} from "@myakiba/contracts/wishlist/schema";
import { StarIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link, createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { useMemo } from "react";
import { WishlistItemGrid } from "@/components/wishlist/wishlist-item-grid";
import { InfiniteListStatus } from "@/components/lists/infinite-list-status";
import { LoadError, STATE_ICON_CLASS_NAME, STATE_PANEL_CLASS_NAME } from "@/components/page-states";
import { PageHeader, formatCount } from "@/components/page-header";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { ViewToggle } from "@/components/ui/view-toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { buttonVariants } from "@/components/ui/button";
import { useResourceMutation } from "@/data/client";
import { setWishlistMembership } from "@/data/resources/wishlist";
import { useMoveWishlistItemsMutation, useWishlistItemsQuery } from "@/hooks/use-wishlist";
import { VIEW_PREFERENCES, useViewPreference } from "@/lib/layout-preferences";
import { useUserPreferences } from "@/hooks/use-user-preferences";

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
  const [viewMode, setViewMode] = useViewPreference(VIEW_PREFERENCES.wishlist);
  const { currency, dateFormat } = useUserPreferences();
  const itemMutation = useResourceMutation(setWishlistMembership);
  const moveMutation = useMoveWishlistItemsMutation();
  const handleLoadMore = itemsQuery.fetchNextPage;
  const isPending = itemsQuery.isPending;
  const hasInitialError = itemsQuery.isError && !itemsQuery.data;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6" aria-busy={isPending}>
      <PageHeader
        title="Wishlist"
        meta={isPending || hasInitialError ? null : formatCount(totalCount, "Item", "Items")}
        actions={
          <>
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
            <ViewToggle
              modes={VIEW_PREFERENCES.wishlist.modes}
              value={viewMode}
              onValueChange={setViewMode}
            />
          </>
        }
      />

      {hasInitialError ? (
        <LoadError
          title="Couldn't load your Wishlist"
          message={itemsQuery.error?.message ?? "Failed to load Wishlist"}
        />
      ) : null}

      {!isPending && !hasInitialError && totalCount === 0 ? (
        <Empty className={STATE_PANEL_CLASS_NAME}>
          <EmptyHeader>
            <EmptyMedia variant="icon" className={STATE_ICON_CLASS_NAME}>
              <HugeiconsIcon icon={StarIcon} className="size-5" aria-hidden="true" />
            </EmptyMedia>
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
          removingItemId={itemMutation.pendingInput?.itemId}
          hasNextPage={itemsQuery.hasNextPage}
          isFetchingNextPage={itemsQuery.isFetchingNextPage}
          onLoadMore={handleLoadMore}
          onRemove={async (itemId, itemExternalId) => {
            await itemMutation.run({ itemId, itemExternalId, wishlisted: false });
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
          onLoadMore={handleLoadMore}
        />
      ) : null}
    </div>
  );
}
