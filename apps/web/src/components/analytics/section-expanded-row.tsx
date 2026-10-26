import type { ReactNode } from "react";
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useRead } from "@/data/client";
import { analytics } from "@/data/resources/analytics";
import type { AnalyticsSection } from "@myakiba/contracts/shared/types";
import type { CollectionFilters } from "@myakiba/contracts/collection/schema";
import { DataTablePagination, pageRange } from "@/components/data-table/data-table-pagination";
import { SectionRelationships } from "@/components/analytics/section-relationships";
import { MediaGalleryLink, MediaGallerySkeleton, MediaGalleryTile } from "@/components/media-tile";
import { Button } from "@/components/ui/button";
import type { AnalyticsSectionItemsData, AnalyticsSectionRow } from "@/queries/analytics";
import { cn } from "@/lib/utils";
import { itemDestination } from "@/lib/item-destination";

const SECTION_ITEM_PAGE_SIZE = 6;

export function ExpandedRowContent({
  row,
  sectionName,
}: {
  readonly row: AnalyticsSectionRow;
  readonly sectionName: AnalyticsSection;
}): ReactNode {
  const [offset, setOffset] = useState(0);
  const collectionSearch = getCollectionSearch(sectionName, row);
  const match = row.id ?? row.name;
  const { data, isPending, isError, error, isFetching } = useRead(analytics.sectionItems, {
    sectionName,
    filters: { match, limit: SECTION_ITEM_PAGE_SIZE, offset },
  });

  return (
    <div className="bg-muted/30 border-t border-border/30 p-4">
      <div className="flex flex-col gap-6">
        <div className="flex items-baseline justify-between gap-4">
          <p className="text-xs text-muted-foreground">
            Items for <span className="font-medium text-foreground">{row.name}</span>
          </p>
          <Button
            variant="ghost"
            size="xs"
            className="-my-1 -mr-2 text-muted-foreground"
            render={<Link to="/collection" search={collectionSearch} />}
            nativeButton={false}
          >
            View in collection
          </Button>
        </div>

        <ExpandedRowItems
          data={data}
          isPending={isPending}
          isError={isError}
          error={error}
          isFetching={isFetching}
          offset={offset}
          onOffsetChange={setOffset}
        />

        <SectionRelationships
          key={`${sectionName}:${match}`}
          match={match}
          sectionName={sectionName}
        />
      </div>
    </div>
  );
}

function ExpandedRowItems({
  data,
  isPending,
  isError,
  error,
  isFetching,
  offset,
  onOffsetChange,
}: {
  readonly data: AnalyticsSectionItemsData | undefined;
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly error: Error | null;
  readonly isFetching: boolean;
  readonly offset: number;
  readonly onOffsetChange: (offset: number) => void;
}): ReactNode {
  if (isPending) {
    return (
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {Array.from({ length: SECTION_ITEM_PAGE_SIZE }, (_, idx) => (
          <MediaGallerySkeleton key={idx} />
        ))}
      </div>
    );
  }

  if (isError) {
    return <p className="text-xs text-destructive">Failed to load items: {error?.message}</p>;
  }

  if (!data || data.items.length === 0) {
    const canRecover = offset > 0;

    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {canRecover
            ? "This item page is no longer available."
            : "No owned items found for this row."}
        </p>
        {canRecover ? (
          <Button type="button" variant="outline" size="xs" onClick={() => onOffsetChange(0)}>
            Return to first page
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <>
      <div
        className={cn(
          "grid grid-cols-3 sm:grid-cols-6 gap-2 transition-opacity duration-150",
          isFetching && "opacity-60",
        )}
      >
        {data.items.map((item, idx) => (
          <MediaGalleryTile key={`${item.id}-${offset + idx}`} className="animate-data-in">
            <MediaGalleryLink
              destination={itemDestination(item.id, item.externalId)}
              title={item.title}
              tooltip
            >
              {item.image ? (
                <img
                  src={item.image}
                  alt=""
                  className="size-full object-cover object-top"
                  loading="lazy"
                />
              ) : (
                <div
                  aria-hidden="true"
                  className="flex size-full items-center justify-center text-[10px] text-muted-foreground"
                >
                  No image
                </div>
              )}
            </MediaGalleryLink>
          </MediaGalleryTile>
        ))}
      </div>

      {data.totalCount > SECTION_ITEM_PAGE_SIZE ? (
        <div className="flex items-center justify-between gap-3 pt-1">
          <p className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
            Showing{" "}
            {pageRange({ totalCount: data.totalCount, limit: SECTION_ITEM_PAGE_SIZE, offset })}
          </p>
          <DataTablePagination
            totalCount={data.totalCount}
            limit={SECTION_ITEM_PAGE_SIZE}
            offset={offset}
            onOffsetChange={onOffsetChange}
          />
        </div>
      ) : null}
    </>
  );
}

function getCollectionSearch(
  sectionName: AnalyticsSection,
  row: AnalyticsSectionRow,
): Pick<CollectionFilters, "shop" | "scale" | "entries" | "category"> {
  const value = row.id ?? row.name;

  if (sectionName === "shops") {
    return { shop: [value] };
  }

  if (sectionName === "scales") {
    return {
      scale: [value],
      category: ["Prepainted"],
    };
  }

  return { entries: [value] };
}
