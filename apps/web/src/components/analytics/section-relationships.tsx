import { useId, useState } from "react";
import type { ReactNode } from "react";
import { useRead } from "@/data/client";
import { analytics } from "@/data/resources/analytics";
import { ANALYTICS_SECTIONS } from "@myakiba/contracts/shared/constants";
import type { AnalyticsSection } from "@myakiba/contracts/shared/types";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataTablePagination, pageRange } from "@/components/data-table/data-table-pagination";
import { sectionLabel } from "@/components/analytics/section-utils";
import { MediaGalleryLink, MediaGalleryTile } from "@/components/media-tile";
import type {
  AnalyticsSectionRelationshipPreviewItem,
  AnalyticsSectionRelationshipValue,
  AnalyticsSectionRelationshipsData,
} from "@/queries/analytics";
import { cn } from "@/lib/utils";
import { itemDestination } from "@/lib/item-destination";

const RELATIONSHIP_PAGE_SIZE = 5;
const RELATIONSHIP_SKELETONS = [0, 1, 2, 3, 4] as const;
const PREFERRED_RELATIONSHIP_SECTION = "characters" satisfies AnalyticsSection;

export function SectionRelationships({
  match,
  sectionName,
}: {
  readonly match: string;
  readonly sectionName: AnalyticsSection;
}): ReactNode {
  const headingId = useId();
  const relationshipSections = ANALYTICS_SECTIONS.filter((section) => section !== sectionName);
  const [relatedSection, setRelatedSection] = useState<AnalyticsSection>(() =>
    relationshipSections.includes(PREFERRED_RELATIONSHIP_SECTION)
      ? PREFERRED_RELATIONSHIP_SECTION
      : (relationshipSections[0] ?? PREFERRED_RELATIONSHIP_SECTION),
  );
  const [offset, setOffset] = useState(0);
  const { data, isPending, isError, error, isFetching, refetch } = useRead(
    analytics.sectionRelationships,
    {
      sectionName,
      filters: { match, relatedSection, limit: RELATIONSHIP_PAGE_SIZE, offset },
    },
  );

  const handleTabChange = (nextSection: AnalyticsSection): void => {
    setRelatedSection(nextSection);
    setOffset(0);
  };

  return (
    <section className="flex flex-col gap-3" aria-labelledby={headingId}>
      <h4 id={headingId} className="text-xs font-medium text-muted-foreground text-balance">
        Relationships
      </h4>

      <Tabs value={relatedSection} onValueChange={handleTabChange}>
        <div className="overflow-x-auto pb-1">
          <TabsList variant="line" className="min-w-max">
            {relationshipSections.map((relationshipSection) => (
              <TabsTrigger
                key={relationshipSection}
                value={relationshipSection}
                className="px-2.5 text-xs"
              >
                {sectionLabel(relationshipSection)}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value={relatedSection}>
          <RelationshipPage
            data={data}
            error={error}
            isError={isError}
            isFetching={isFetching}
            isPending={isPending}
            offset={offset}
            onOffsetChange={setOffset}
            onRetry={async () => {
              await refetch();
            }}
          />
        </TabsContent>
      </Tabs>
    </section>
  );
}

function RelationshipPage({
  data,
  error,
  isError,
  isFetching,
  isPending,
  offset,
  onOffsetChange,
  onRetry,
}: {
  readonly data: AnalyticsSectionRelationshipsData | undefined;
  readonly error: Error | null;
  readonly isError: boolean;
  readonly isFetching: boolean;
  readonly isPending: boolean;
  readonly offset: number;
  readonly onOffsetChange: (offset: number) => void;
  readonly onRetry: () => Promise<void>;
}): ReactNode {
  if (isPending) return <RelationshipsSkeleton />;

  if (isError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Failed to load relationships</AlertTitle>
        <AlertDescription>{error?.message}</AlertDescription>
        <AlertAction>
          <Button
            type="button"
            variant="outline"
            size="xs"
            className="min-h-10"
            disabled={isFetching}
            onClick={() => onRetry()}
          >
            {isFetching ? "Retrying…" : "Retry"}
          </Button>
        </AlertAction>
      </Alert>
    );
  }

  if (!data || data.items.length === 0) {
    const canRecover = offset > 0;

    return (
      <Empty className="min-h-24 p-4">
        <EmptyHeader>
          <EmptyDescription>
            {canRecover
              ? "This relationship page is no longer available."
              : "No relationships found for these items."}
          </EmptyDescription>
        </EmptyHeader>
        {canRecover ? (
          <EmptyContent>
            <Button type="button" variant="outline" size="xs" onClick={() => onOffsetChange(0)}>
              Return to first page
            </Button>
          </EmptyContent>
        ) : null}
      </Empty>
    );
  }

  return (
    <div className={cn("flex flex-col gap-3", isFetching && "opacity-60")}>
      <ul className="divide-y overflow-hidden rounded-lg border bg-card">
        {data.items.map((value) => (
          <RelationshipRow key={value.id ?? value.name} value={value} />
        ))}
      </ul>

      {data.totalCount > RELATIONSHIP_PAGE_SIZE ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground tabular-nums">
            Showing{" "}
            {pageRange({ totalCount: data.totalCount, limit: RELATIONSHIP_PAGE_SIZE, offset })}
          </p>
          <DataTablePagination
            totalCount={data.totalCount}
            limit={RELATIONSHIP_PAGE_SIZE}
            offset={offset}
            onOffsetChange={onOffsetChange}
          />
        </div>
      ) : null}
    </div>
  );
}

function RelationshipsSkeleton(): ReactNode {
  return (
    <div className="overflow-hidden rounded-lg border">
      {RELATIONSHIP_SKELETONS.map((index) => (
        <div key={index} className="flex items-center gap-3 border-b p-3 last:border-b-0">
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-16" />
          </div>
          <div className="flex gap-1">
            <Skeleton className="size-10 rounded-lg" />
            <Skeleton className="size-10 rounded-lg" />
            <Skeleton className="size-10 rounded-lg" />
          </div>
        </div>
      ))}
    </div>
  );
}

function RelationshipRow({
  value,
}: {
  readonly value: AnalyticsSectionRelationshipValue;
}): ReactNode {
  return (
    <li className="flex min-w-0 items-center gap-3 p-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium" title={value.name}>
          {value.name}
        </p>
        <p className="text-xs text-muted-foreground tabular-nums">
          {value.itemCount} {value.itemCount === 1 ? "item" : "items"}
        </p>
      </div>
      <RelationshipPreviews items={value.previewItems} />
    </li>
  );
}

function RelationshipPreviews({
  items,
}: {
  readonly items: readonly AnalyticsSectionRelationshipPreviewItem[];
}): ReactNode {
  if (items.length === 0) return null;

  return (
    <div className="flex shrink-0 gap-1" aria-label="Shared item previews">
      {items.map((item) => (
        <MediaGalleryTile key={item.id} className="size-10">
          <MediaGalleryLink
            destination={itemDestination(item.id, item.externalId)}
            title={item.title}
            tooltip
          >
            <img
              src={item.image}
              alt=""
              width={40}
              height={40}
              className="size-full object-cover object-top"
              loading="lazy"
            />
          </MediaGalleryLink>
        </MediaGalleryTile>
      ))}
    </div>
  );
}
