import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { CollectionDataGrid } from "@/components/collection/collection-data-grid";
import { collectionSearchSchema } from "@myakiba/contracts/collection/schema";
import { KPICard, KPIGroup } from "@/components/ui/kpi-card";
import { formatCurrencyFromMinorUnits } from "@myakiba/utils/currency";
import { useCollectionQuery } from "@/hooks/use-collection";
import { useUserPreferences } from "@/hooks/use-user-preferences";
import { PageHeader } from "@/components/page-header";
import { CollectionQuickFilters } from "@/components/collection/collection-quick-filters";
import { LoadError } from "@/components/page-states";
import { DEFAULT_LIMIT } from "@myakiba/contracts/shared/constants";

export const Route = createFileRoute("/(app)/collection")({
  component: RouteComponent,
  validateSearch: collectionSearchSchema,
  search: {
    middlewares: [
      stripSearchParams({ limit: DEFAULT_LIMIT, offset: 0, sort: "createdAt", order: "desc" }),
    ],
  },
  head: () => ({
    meta: [
      {
        name: "description",
        content: `your collection`,
      },
      {
        title: `Collection - myakiba`,
      },
    ],
  }),
});

function RouteComponent() {
  const { currency, locale } = useUserPreferences();
  const { isPending, isError, error, totalCount, totalValue, totalItemsThisMonth } =
    useCollectionQuery();
  const averageItemCost = totalCount > 0 ? Math.round(totalValue / totalCount) : 0;

  if (isError) {
    return (
      <div className="mx-auto flex flex-col gap-8 max-w-352">
        <PageHeader title="Collection" />
        <LoadError title="Couldn't load your Collection" message={error?.message} />
      </div>
    );
  }

  return (
    <div className="mx-auto flex flex-col gap-8 max-w-352">
      <PageHeader title="Collection" />
      <KPIGroup>
        <KPICard
          title="Total Items"
          value={isPending ? undefined : totalCount}
          isLoading={isPending}
        />
        <KPICard
          title="Item Spend"
          value={isPending ? undefined : formatCurrencyFromMinorUnits(totalValue, currency, locale)}
          isLoading={isPending}
        />
        <KPICard
          title="Added This Month"
          value={isPending ? undefined : totalItemsThisMonth}
          isLoading={isPending}
        />
        <KPICard
          title="Average Cost"
          value={
            isPending ? undefined : formatCurrencyFromMinorUnits(averageItemCost, currency, locale)
          }
          isLoading={isPending}
        />
      </KPIGroup>
      <CollectionQuickFilters />
      <CollectionDataGrid key="collection-data-grid" />
    </div>
  );
}
