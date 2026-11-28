import type { ReactNode } from "react";
import { useId, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ENTRY_ITEMS_PAGE_SIZE } from "@myakiba/contracts/entries/schema";
import type { EntryItemState } from "@myakiba/contracts/entries/schema";
import { analyticsSectionSchema } from "@myakiba/contracts/analytics/schema";
import { SectionRelationships } from "@/components/analytics/section-relationships";
import { ItemPicturePages } from "@/components/item-picture-pages";
import { PageHeader } from "@/components/page-header";
import { LoadError } from "@/components/page-states";
import { RecordTitle } from "@/components/record-title";
import { BackLink } from "@/components/ui/back-link";
import { Skeleton } from "@/components/ui/skeleton";
import { useRead } from "@/data/client";
import { entryItemsInput, itemEntries, preloadEntryPage } from "@/data/resources/entries";

const SECTIONS = [
  { state: "owned", heading: "Owned" },
  { state: "ordered", heading: "On order" },
  { state: "wishlist", heading: "Wishlist" },
] as const satisfies readonly { readonly state: EntryItemState; readonly heading: string }[];

export const Route = createFileRoute("/(app)/entries/$entryId")({
  loader: ({ context: { queryClient }, cause, params: { entryId } }) =>
    preloadEntryPage(queryClient, cause, entryId),
  component: RouteComponent,
  remountDeps: ({ params }) => params.entryId,
});

function RouteComponent(): ReactNode {
  const { entryId } = Route.useParams();
  const { data: entry, isError, error } = useRead(itemEntries.detail, entryId);
  const relationshipSection = entry
    ? analyticsSectionSchema.safeParse(entry.category.toLowerCase()).data
    : undefined;

  return (
    <div className="flex flex-col gap-6 mx-auto w-full max-w-352">
      <RecordTitle kind="Item Entry" title={entry?.name} />
      <BackLink fallbackTo="/analytics" text="Back" font="sans" className="self-start" />

      {isError ? (
        <LoadError title="Couldn't load this Item Entry" error={error} />
      ) : (
        <>
          <PageHeader
            title={entry ? entry.name : <Skeleton className="h-7 w-48 max-w-full" />}
            meta={entry?.category ?? ""}
          />

          {SECTIONS.map(({ state, heading }) => (
            <EntryItemsSection key={state} entryId={entryId} state={state} heading={heading} />
          ))}

          {relationshipSection ? (
            <SectionRelationships match={entryId} sectionName={relationshipSection} />
          ) : null}
        </>
      )}
    </div>
  );
}

function EntryItemsSection({
  entryId,
  state,
  heading,
}: {
  readonly entryId: string;
  readonly state: EntryItemState;
  readonly heading: string;
}): ReactNode {
  const headingId = useId();
  const [offset, setOffset] = useState(0);
  const { data, isPending, isError, error, isFetching } = useRead(
    itemEntries.items,
    entryItemsInput(entryId, state, offset),
  );

  return (
    <section className="flex flex-col gap-3" aria-labelledby={headingId}>
      <h2 id={headingId} className="flex items-baseline gap-1.5 text-xs font-medium">
        <span className="text-muted-foreground">{heading}</span>
        {data ? <span className="tabular-nums">{data.totalCount.toLocaleString()}</span> : null}
      </h2>
      <ItemPicturePages
        data={data}
        isPending={isPending}
        isError={isError}
        error={error}
        isFetching={isFetching}
        pageSize={ENTRY_ITEMS_PAGE_SIZE}
        offset={offset}
        onOffsetChange={setOffset}
        empty={null}
      />
    </section>
  );
}
