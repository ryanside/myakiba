import type { ReactNode } from "react";
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { AnalyticsSection } from "@myakiba/contracts/shared/types";
import type { CollectionFilters } from "@myakiba/contracts/collection/schema";
import { DataTablePagination } from "@/components/data-table/data-table-pagination";
import { SectionRelationships } from "@/components/analytics/section-relationships";
import { Button } from "@/components/ui/button";
import { getAnalyticsSectionItems } from "@/queries/analytics";
import type { AnalyticsSectionItemsData, AnalyticsSectionRow } from "@/queries/analytics";
import { cn } from "@/lib/utils";

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
  const { data, isPending, isError, error, isFetching } = useQuery({
    queryKey: ["analytics", "section-items", sectionName, match, SECTION_ITEM_PAGE_SIZE, offset],
    queryFn: () =>
      getAnalyticsSectionItems(sectionName, {
        match,
        limit: SECTION_ITEM_PAGE_SIZE,
        offset,
      }),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  return (
    <div className="bg-muted/30 border-t border-border/30 p-4">
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            Items for <span className="font-medium text-foreground">{row.name}</span>
          </p>
          <Link
            to="/collection"
            search={collectionSearch}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors duration-150 underline-offset-2 hover:underline"
          >
            View in collection →
          </Link>
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
          <div
            key={idx}
            className="aspect-square rounded-md border border-border/50 bg-muted animate-pulse"
          />
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
          <Link
            key={`${item.id}-${offset + idx}`}
            {...(item.externalId !== null
              ? ({
                  to: "/item/$externalId",
                  params: { externalId: item.externalId },
                } as const)
              : ({ to: "/item/custom/$id", params: { id: item.id } } as const))}
            title={item.title}
            aria-label={item.title}
            className="animate-data-in aspect-square rounded-md overflow-hidden bg-background"
            style={{ "--data-in-delay": `${idx * 30}ms` } as React.CSSProperties}
          >
            {item.image ? (
              <img
                src={item.image}
                alt={item.title}
                className="w-full h-full object-cover object-top"
                loading="lazy"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-muted text-[10px] text-muted-foreground">
                No image
              </div>
            )}
          </Link>
        ))}
      </div>

      {data.totalCount > SECTION_ITEM_PAGE_SIZE ? (
        <div className="flex items-center justify-between gap-3 pt-1">
          <p className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
            Showing {offset + 1}–{Math.min(offset + SECTION_ITEM_PAGE_SIZE, data.totalCount)} of{" "}
            {data.totalCount}
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
