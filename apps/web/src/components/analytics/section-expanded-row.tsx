import type { ReactNode } from "react";
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useRead } from "@/data/client";
import { analytics } from "@/data/resources/analytics";
import type { AnalyticsSection } from "@myakiba/contracts/shared/types";
import type { CollectionFilters } from "@myakiba/contracts/collection/schema";
import { SectionRelationships } from "@/components/analytics/section-relationships";
import { ItemPicturePages } from "@/components/item-picture-pages";
import { Button } from "@/components/ui/button";
import type { AnalyticsSectionRow } from "@/queries/analytics";

const SECTION_ITEM_PAGE_SIZE = 6;

export type ExpandingSection = Extract<AnalyticsSection, "shops" | "scales">;

export function ExpandedRowContent({
  row,
  sectionName,
}: {
  readonly row: AnalyticsSectionRow;
  readonly sectionName: ExpandingSection;
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

        <ItemPicturePages
          data={data}
          isPending={isPending}
          isError={isError}
          error={error}
          isFetching={isFetching}
          pageSize={SECTION_ITEM_PAGE_SIZE}
          offset={offset}
          onOffsetChange={setOffset}
          empty={
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">No owned items found for this row.</p>
            </div>
          }
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

function getCollectionSearch(
  sectionName: ExpandingSection,
  row: AnalyticsSectionRow,
): Pick<CollectionFilters, "shop" | "scale" | "category"> {
  const value = row.id ?? row.name;

  if (sectionName === "shops") {
    return { shop: [value] };
  }

  return {
    scale: [value],
    category: ["Prepainted"],
  };
}
