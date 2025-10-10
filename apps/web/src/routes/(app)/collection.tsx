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
import Loader from "@/components/loader";
import { CollectionDataGrid } from "@/components/collection/collection-data-grid";
import { collectionSearchSchema } from "@/lib/validations";
import { deleteCollectionItems } from "@/queries/collection";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  createOptimisticDeleteUpdate,
  createOptimisticEditUpdate,
} from "@/lib/collection/utils";

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
  const queryClient = useQueryClient();
  const { filters, setFilters, resetFilters } = useFilters(Route.id);

  const handleFilterChange = (filters: CollectionFilters) => {
    setFilters(filters);
  };

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
    onSuccess: () => {
      toast.success("Collection item(s) deleted successfully");
    },
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
    onSuccess: () => {
      toast.success("Collection item updated successfully");
    },
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

  const handleDeleteCollectionItems = async (collectionIds: Set<string>) => {
    await deleteCollectionItemsMutation.mutateAsync({ collectionIds });
  };

  const handleEditCollectionItem = async (values: CollectionItemFormValues) => {
    await editCollectionItemMutation.mutateAsync(values);
  };

  if (isPending) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <Loader />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <div className="text-lg font-medium text-destructive">
          Error: {error.message}
        </div>
      </div>
    );
  }

  const { collection } = data;

  return (
    <div className="w-full space-y-4">
      <CollectionDataGrid
        collection={collection}
        totalCount={collection[0]?.totalCount ?? 0}
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
        onSearchChange={(search) => handleFilterChange({ ...filters, search })}
        onResetFilters={resetFilters}
        onDeleteCollectionItems={handleDeleteCollectionItems}
        onEditCollectionItem={handleEditCollectionItem}
      />
    </div>
  );
}
