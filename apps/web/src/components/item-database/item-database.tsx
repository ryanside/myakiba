import { useRead } from "@/data/client";
import { searches } from "@/data/resources/search";
import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { PackageSearchIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ReactNode } from "react";
import { DataTablePagination, pageRange } from "@/components/data-table/data-table-pagination";
import { SearchPill } from "@/components/search-pill";
import { LoadError, STATE_ICON_CLASS_NAME, STATE_PANEL_CLASS_NAME } from "@/components/page-states";
import { MediaViewCollection, MediaViewSkeletons } from "@/components/media-tile";
import { PageHeader, formatCount } from "@/components/page-header";
import { ReleaseItemTile } from "@/components/release-item-tile";
import { AddLink } from "@/components/add/add-link";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { ViewToggle } from "@/components/ui/view-toggle";
import { VIEW_PREFERENCES, useViewPreference } from "@/lib/layout-preferences";
import { useUserPreferences } from "@/hooks/use-user-preferences";

const itemsRoute = getRouteApi("/(app)/items");

export function ItemDatabase(): React.JSX.Element {
  const search = itemsRoute.useSearch();
  const navigate = useNavigate();
  const { currency, dateFormat } = useUserPreferences();
  const [viewMode, setViewMode] = useViewPreference(VIEW_PREFERENCES.itemDatabase);
  const { data, isPending, isError, error } = useRead(searches.itemDatabase, search);

  const items = data?.items ?? [];
  const totalCount = data?.totalCount ?? 0;
  const offset = (search.page - 1) * search.pageSize;
  let results: ReactNode;

  if (isPending) {
    results = <MediaViewSkeletons viewMode={viewMode} count={viewMode === "list" ? 8 : 15} />;
  } else if (isError) {
    results = <LoadError title="Couldn't load the Item Database" error={error} />;
  } else if (items.length === 0) {
    const isLaterPage = search.page > 1;

    results = (
      <Empty className={STATE_PANEL_CLASS_NAME}>
        <EmptyHeader>
          <EmptyMedia variant="icon" className={STATE_ICON_CLASS_NAME}>
            <HugeiconsIcon icon={PackageSearchIcon} className="size-5" aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>{isLaterPage ? "No items on this page." : "No items found."}</EmptyTitle>
          {search.query && !isLaterPage ? (
            <EmptyDescription>Nothing matches “{search.query}”.</EmptyDescription>
          ) : null}
        </EmptyHeader>
        {isLaterPage ? (
          <EmptyContent>
            <Button
              variant="outline"
              onClick={() =>
                navigate({
                  to: ".",
                  search: (previous) => ({ ...previous, page: 1 }),
                  replace: true,
                })
              }
            >
              Go to first page
            </Button>
          </EmptyContent>
        ) : null}
      </Empty>
    );
  } else {
    results = (
      <MediaViewCollection viewMode={viewMode}>
        {items.map((item) => (
          <ReleaseItemTile
            key={item.itemId}
            item={item}
            destination={{ to: "/item/$externalId", params: { externalId: item.externalId } }}
            viewMode={viewMode}
            currency={currency}
            dateFormat={dateFormat}
            className="animate-data-in"
          />
        ))}
      </MediaViewCollection>
    );
  }

  return (
    <>
      <PageHeader
        title="Item Database"
        meta={isPending || isError ? null : formatCount(totalCount, "Item", "Items")}
      />

      <div className="flex w-full flex-wrap items-center gap-2">
        <SearchPill
          value={search.query ?? ""}
          onChange={(value) =>
            navigate({
              to: ".",
              search: (previous) => ({
                ...previous,
                query: value.toString() || undefined,
                page: 1,
              }),
              replace: true,
            })
          }
          placeholder="Search by title, MFC ID, or entry"
          aria-label="Search the Item Database"
          className="flex-1 sm:max-w-sm"
        />
        <div className="ml-auto flex items-center gap-2">
          <ViewToggle
            modes={VIEW_PREFERENCES.itemDatabase.modes}
            value={viewMode}
            onValueChange={setViewMode}
          />
          <AddLink search={{ to: "none" }} />
        </div>
      </div>

      {results}

      {!isPending && !isError && totalCount > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground tabular-nums">
            Showing {pageRange({ totalCount, limit: search.pageSize, offset })}
          </p>
          <DataTablePagination
            totalCount={totalCount}
            limit={search.pageSize}
            offset={offset}
            onOffsetChange={(nextOffset) =>
              navigate({
                to: ".",
                search: (previous) => ({
                  ...previous,
                  page: Math.floor(nextOffset / search.pageSize) + 1,
                }),
                replace: true,
              })
            }
          />
        </div>
      ) : null}
    </>
  );
}
