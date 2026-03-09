import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useFilters } from "@/hooks/use-filters";
import type { CollectionItem, CollectionFilters, CollectionItemFormValues } from "@myakiba/types";
import { CollectionDataGrid } from "@/components/collection/collection-data-grid";
import { collectionSearchSchema } from "@myakiba/schemas";
import { toast } from "sonner";
import { useCallback, useMemo } from "react";
import { KPICard } from "@/components/ui/kpi-card";
import { formatCurrencyFromMinorUnits } from "@myakiba/utils";
import type { DateFormat } from "@myakiba/types";
import { createBaseCollection, useCollectionLiveQuery } from "@/tanstack-db/db-collections";

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
  const { session } = Route.useRouteContext();
  const userCurrency = session?.user.currency;
  const dateFormat = session?.user.dateFormat as DateFormat;
  const queryClient = useQueryClient();
  const { filters, setFilters, resetFilters } = useFilters(Route.id);

  const handleFilterChange = useCallback(
    (filters: CollectionFilters) => {
      setFilters(filters);
    },
    [setFilters],
  );

  const baseCollection = useMemo(
    () => createBaseCollection(filters, queryClient),
    [filters, queryClient],
  );

  const {
    data,
    isLoading: isPending,
    isError,
    status,
  } = useCollectionLiveQuery(baseCollection, filters);

  const collectionItems = data ?? [];
  const limit = filters.limit ?? 10;
  const offset = filters.offset ?? 0;
  const pagedItems = useMemo((): CollectionItem[] => {
    if (collectionItems.length === 0) return [];
    return collectionItems.slice(offset, offset + limit);
  }, [collectionItems, offset, limit]);

  const totalItems = isPending ? undefined : collectionItems.length;
  const totalSpent = useMemo((): number | undefined => {
    if (isPending) return undefined;
    return collectionItems.reduce((sum, item) => sum + item.price, 0);
  }, [collectionItems, isPending]);

  const handleDeleteCollectionItems = useCallback(
    async (collectionIds: Set<string>): Promise<void> => {
      const transaction = baseCollection.delete(Array.from(collectionIds));
      await transaction.isPersisted.promise.catch(() => {
        toast.error("Failed to delete collection item(s). Please try again.");
      });
    },
    [baseCollection],
  );

  const handleEditCollectionItem = useCallback(
    async (values: CollectionItemFormValues): Promise<void> => {
      const transaction = baseCollection.update(values.id, (draft) => {
        Object.assign(draft, values);
      });
      await transaction.isPersisted.promise.catch(() => {
        toast.error("Failed to update collection item. Please try again.");
      });
    },
    [baseCollection],
  );

  if (isError) {
    return (
      <div className="w-full space-y-8">
        <div className="flex flex-col gap-2">
          <div className="flex flex-row items-start gap-4">
            <h1 className="text-2xl tracking-tight">Collection</h1>
          </div>
          <p className="text-muted-foreground text-sm font-light">
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
    <div className="flex flex-col gap-6 mx-auto w-full">
      <div className="flex flex-col gap-2 mb-4">
        <div className="flex flex-row items-start gap-4">
          <h1 className="text-2xl tracking-tight">Collection</h1>
        </div>
        <p className="text-muted-foreground text-sm font-light">
          Manage and track your collection items
        </p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <KPICard
          title="Total Items"
          subtitle="all collection items"
          value={totalItems}
          isLoading={isPending}
        />
        <KPICard
          title="Total Spent"
          subtitle="based on total item prices"
          value={
            totalSpent !== undefined
              ? formatCurrencyFromMinorUnits(totalSpent, userCurrency)
              : undefined
          }
          isLoading={isPending}
        />
      </div>
      <CollectionDataGrid
        key="collection-data-grid"
        collection={pagedItems}
        totalCount={totalItems ?? 0}
        pagination={{
          limit,
          offset,
        }}
        sorting={{
          sort: filters.sort ?? "createdAt",
          order: filters.order ?? "desc",
        }}
        search={filters.search ?? ""}
        filters={filters}
        onFilterChange={handleFilterChange}
        onSearchChange={(search) => handleFilterChange({ ...filters, search })}
        onResetFilters={resetFilters}
        onDeleteCollectionItems={handleDeleteCollectionItems}
        onEditCollectionItem={handleEditCollectionItem}
        currency={userCurrency}
        dateFormat={dateFormat}
        isLoading={isPending}
      />
    </div>
  );
}
