import { createFileRoute } from "@tanstack/react-router";
import { CollectionDataGrid } from "@/components/collection/collection-data-grid";
import { CollectionQuickFilters } from "@/components/collection/collection-quick-filters";
import { collectionSearchSchema } from "@myakiba/contracts/collection/schema";
import { KPICard } from "@/components/ui/kpi-card";
import { formatCurrencyFromMinorUnits } from "@myakiba/utils/currency";
import { useCollectionQuery } from "@/hooks/use-collection";
import { useUserPreferences } from "@/hooks/use-user-preferences";

export const Route = createFileRoute("/(app)/collection")({
  component: RouteComponent,
  validateSearch: collectionSearchSchema,
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
  const { isPending, isError, status, totalCount, totalValue } = useCollectionQuery();

  if (isError) {
    return (
      <div className="w-full space-y-8">
        <div className="flex flex-col gap-2">
          <div className="flex flex-row items-start gap-4">
            <h1 className="text-2xl tracking-tight">Collection</h1>
          </div>
          <p className="text-muted-foreground text-sm font-normal">
            Manage and track your collection items
          </p>
        </div>
        <div className="flex flex-col items-center justify-center h-64 gap-y-4">
          <div className="text-lg font-medium text-destructive">Error: {status}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 mx-auto w-full">
      <div className="flex flex-col gap-2 mb-4">
        <div className="flex flex-row items-start gap-4">
          <h1 className="text-2xl tracking-tight">Collection</h1>
        </div>
        <p className="text-muted-foreground text-sm font-normal">
          Manage and track your collection items
        </p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <KPICard
          title="Total Items"
          subtitle="all collection items"
          value={isPending ? undefined : totalCount}
          isLoading={isPending}
        />
        <KPICard
          title="Total Spent"
          subtitle="based on total item prices"
          value={isPending ? undefined : formatCurrencyFromMinorUnits(totalValue, currency, locale)}
          isLoading={isPending}
        />
      </div>
      <CollectionQuickFilters />
      <CollectionDataGrid key="collection-data-grid" />
    </div>
  );
}
