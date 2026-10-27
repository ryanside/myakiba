import { useRead } from "@/data/client";
import { searches } from "@/data/resources/search";
import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { InformationCircleIcon, PackageSearchIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ReactNode } from "react";
import { DataTablePagination, pageRange } from "@/components/data-table/data-table-pagination";
import { DebouncedInput } from "@/components/debounced-input";
import { LoadError, STATE_ICON_CLASS_NAME, STATE_PANEL_CLASS_NAME } from "@/components/page-states";
import { MediaViewCollection, MediaViewSkeletons } from "@/components/media-tile";
import { PageHeader, formatCount } from "@/components/page-header";
import { ReleaseItemTile } from "@/components/release-item-tile";
import { SyncSheetButton } from "@/components/sync/sync-sheet-button";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
    results = <LoadError title="Couldn't load the Item Database" message={error.message} />;
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
        titleAccessory={
          <Tooltip>
            <TooltipTrigger
              render={
                <Button variant="ghost" size="icon-xs" aria-label="About the item database">
                  <HugeiconsIcon icon={InformationCircleIcon} className="size-4" />
                </Button>
              }
            />
            <TooltipContent side="right" sideOffset={12}>
              <div className="flex max-w-xs flex-col gap-1">
                <h3 className="text-sm font-medium">dev note:</h3>
                <p className="text-pretty">
                  This is an early, simple version of the Item Database.
                </p>
              </div>
            </TooltipContent>
          </Tooltip>
        }
        meta={isPending || isError ? null : formatCount(totalCount, "Item", "Items")}
        actions={
          <>
            <ViewToggle
              modes={VIEW_PREFERENCES.itemDatabase.modes}
              value={viewMode}
              onValueChange={setViewMode}
            />
            <SyncSheetButton syncType="item" label="Add" />
          </>
        }
      />

      <DebouncedInput
        value={search.query ?? ""}
        onChange={(value) =>
          navigate({
            to: ".",
            search: (previous) => ({
              ...previous,
              query: value.toString() || undefined,
              page: 1,
            }),
          })
        }
        placeholder="Search by title, MFC ID, or entry"
        className="w-full sm:max-w-sm"
      />

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
              })
            }
          />
        </div>
      ) : null}
    </>
  );
}
