import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useFilters } from "@/hooks/use-filters";
import type {
  CollectionFilters,
  CollectionQueryResponse,
  CollectionItemFormValues,
} from "@/lib/collection/types";
import { getCollection, updateCollectionItem } from "@/queries/collection";
import { CollectionDataGrid } from "@/components/collection/collection-data-grid";
import { collectionSearchSchema } from "@/lib/validations";
import { CollectionDataGridSkeleton } from "@/components/collection/collection-data-grid-skeleton";
import { deleteCollectionItems } from "@/queries/collection";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  createOptimisticDeleteUpdate,
  createOptimisticEditUpdate,
} from "@/lib/collection/utils";
import { useCallback } from "react";
import { KPICard } from "@/components/ui/kpi-card";
import { formatCurrency } from "@/lib/utils";

export const Route = createFileRoute("/(app)/collection")({
  component: RouteComponent,
  validateSearch: collectionSearchSchema,
  head: ({ params }) => ({
    meta: [
      {
        name: "description",
        content: `your collection`,
      },
      {
        title: `Collection — myakiba`,
      },
    ],
    links: [
      {
        rel: "icon",
        href: "/favicon.ico",
      },
    ],
    scripts: [],
  }),
});

function RouteComponent() {
  const { session } = Route.useRouteContext();
  const userCurrency = session?.user.currency || "USD";
  const queryClient = useQueryClient();
  const { filters, setFilters, resetFilters } = useFilters(Route.id);

  const handleFilterChange = useCallback(
    (filters: CollectionFilters) => {
      setFilters(filters);
    },
    [setFilters]
  );

  const { isPending, isError, data, error } = useQuery({
    queryKey: ["collection", filters],
    queryFn: () => getCollection(filters),
    placeholderData: keepPreviousData,
    staleTime: 1000 * 60 * 5,
    retry: false,
  });

  const deleteCollectionItemsMutation = useMutation({
    mutationFn: ({ collectionIds }: { collectionIds: Set<string> }) =>
      deleteCollectionItems(Array.from(collectionIds)),
    onMutate: async ({ collectionIds }) => {
      await queryClient.cancelQueries({ queryKey: ["collection", filters] });
      const previousData = queryClient.getQueryData(["collection", filters]);
      queryClient.setQueryData(
        ["collection", filters],
        (old: CollectionQueryResponse) => {
          return createOptimisticDeleteUpdate(old, collectionIds);
        }
      );
      return { previousData };
    },
    onError: (error, _, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(["collection", filters], context.previousData);
      }
      toast.error("Failed to delete collection item(s). Please try again.", {
        description: `Error: ${error.message}`,
      });
    },
    onSuccess: () => {},
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["orders"] }),
        queryClient.invalidateQueries({ queryKey: ["order"] }),
        queryClient.invalidateQueries({ queryKey: ["collection"] }),
        queryClient.invalidateQueries({ queryKey: ["item"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["analytics"] }),
      ]);
    },
  });

  const editCollectionItemMutation = useMutation({
    mutationFn: (values: CollectionItemFormValues) =>
      updateCollectionItem(values),
    onMutate: async (values) => {
      await queryClient.cancelQueries({ queryKey: ["collection", filters] });
      const previousData = queryClient.getQueryData(["collection", filters]);
      queryClient.setQueryData(
        ["collection", filters],
        (old: CollectionQueryResponse) => {
          return createOptimisticEditUpdate(old, values);
        }
      );
      return { previousData };
    },
    onError: (error, _, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(["collection", filters], context.previousData);
      }
      toast.error("Failed to update collection item. Please try again.", {
        description: `Error: ${error.message}`,
      });
    },
    onSuccess: () => {},
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["orders"] }),
        queryClient.invalidateQueries({ queryKey: ["order"] }),
        queryClient.invalidateQueries({ queryKey: ["collection"] }),
        queryClient.invalidateQueries({ queryKey: ["item"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["analytics"] }),
      ]);
    },
  });

  const handleDeleteCollectionItems = useCallback(
    async (collectionIds: Set<string>) => {
      await deleteCollectionItemsMutation.mutateAsync({ collectionIds });
    },
    [deleteCollectionItemsMutation]
  );

  const handleEditCollectionItem = useCallback(
    async (values: CollectionItemFormValues) => {
      await editCollectionItemMutation.mutateAsync(values);
    },
    [editCollectionItemMutation]
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
          <div className="text-lg font-medium text-destructive">
            Error: {error.message}
          </div>
        </div>
      </div>
    );
  }

  const collectionItems = data?.collection?.collectionItems ?? [];
  const collectionStats = data?.collection?.collectionStats;

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
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <KPICard
          title="Total Items"
          subtitle="all collection items"
          value={collectionStats?.totalItems}
        />
        <KPICard
          title="Total Spent"
          subtitle="based on total item prices"
          value={
            collectionStats
              ? formatCurrency(collectionStats.totalSpent, userCurrency)
              : undefined
          }
        />
        <KPICard
          title="Total Items This Month"
          subtitle="based on collection date"
          value={collectionStats?.totalItemsThisMonth}
        />
        <KPICard
          title="Total Spent This Month"
          subtitle="based on payment date"
          value={
            collectionStats
              ? formatCurrency(
                  collectionStats.totalSpentThisMonth,
                  userCurrency
                )
              : undefined
          }
        />
      </div>
      {isPending ? (
        <CollectionDataGridSkeleton />
      ) : (
        <CollectionDataGrid
          key="collection-data-grid"
          collection={collectionItems}
          totalCount={collectionItems?.[0]?.totalCount ?? 0}
          pagination={{
            limit: filters.limit ?? 10,
            offset: filters.offset ?? 0,
          }}
          sorting={{
            sort: filters.sort ?? "createdAt",
            order: filters.order ?? "desc",
          }}
          search={filters.search ?? ""}
          filters={filters}
          onFilterChange={handleFilterChange}
          onSearchChange={(search) =>
            handleFilterChange({ ...filters, search })
          }
          onResetFilters={resetFilters}
          onDeleteCollectionItems={handleDeleteCollectionItems}
          onEditCollectionItem={handleEditCollectionItem}
          currency={userCurrency}
        />
      )}
    </div>
  );
}
