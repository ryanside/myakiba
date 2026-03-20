import { useCallback, useMemo, useRef, useState } from "react";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  queryOptions,
} from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { toast } from "sonner";
import { useFilters } from "@/hooks/use-filters";
import { getCollection, deleteCollectionItems, updateCollectionItem } from "@/queries/collection";
import { hasActiveFiltersOrSorting } from "@/lib/filters";
import type {
  CollectionFilters,
  CollectionItem,
  CollectionItemFormValues,
} from "@myakiba/types/collection";
import type { DateFormat } from "@myakiba/types/enums";

export function collectionQueryOptions(filters: CollectionFilters) {
  return queryOptions({
    queryKey: ["collection", filters] as const,
    queryFn: () => getCollection(filters),
    placeholderData: keepPreviousData,
  });
}

const appRouteApi = getRouteApi("/(app)");

export function useUserPreferences(): {
  readonly currency: string;
  readonly dateFormat: DateFormat;
} {
  const { session } = appRouteApi.useRouteContext();
  return {
    currency: session?.user.currency ?? "USD",
    dateFormat: (session?.user.dateFormat ?? "yyyy-MM-dd") as DateFormat,
  };
}

export function useCollectionFilters() {
  return useFilters("/(app)/collection");
}

export function useCollectionQuery() {
  const { filters } = useCollectionFilters();
  const queryOpts = collectionQueryOptions(filters);
  const filtersActive = hasActiveFiltersOrSorting(filters);

  const { data, isPending, isError, status } = useQuery(queryOpts);

  const items = data ?? [];

  return {
    items,
    totalCount: items[0]?.totalCount ?? 0,
    totalValue: items[0]?.totalValue ?? 0,
    isPending,
    isError,
    status,
    queryOpts,
    filtersActive,
  } as const;
}

export function useCollectionMutations() {
  const queryClient = useQueryClient();
  const { filters } = useCollectionFilters();
  const queryOpts = collectionQueryOptions(filters);
  const filtersActive = hasActiveFiltersOrSorting(filters);

  const [pendingCollectionIdList, setPendingCollectionIdList] = useState<readonly string[]>([]);
  const pendingCollectionIds = useMemo(
    () => new Set(pendingCollectionIdList),
    [pendingCollectionIdList],
  );
  const filtersActiveRef = useRef(filtersActive);
  filtersActiveRef.current = filtersActive;
  const pendingCollectionIdsRef = useRef<ReadonlySet<string>>(pendingCollectionIds);
  pendingCollectionIdsRef.current = pendingCollectionIds;

  const updateMutation = useMutation({
    mutationFn: (values: CollectionItemFormValues) => updateCollectionItem(values),
    onMutate: async (values: CollectionItemFormValues) => {
      if (filtersActive) {
        return undefined;
      }

      await queryClient.cancelQueries({ queryKey: queryOpts.queryKey });
      const previous = queryClient.getQueryData<CollectionItem[]>(queryOpts.queryKey);

      queryClient.setQueryData<CollectionItem[]>(queryOpts.queryKey, (old) =>
        old?.map((item) => (item.id === values.id ? { ...item, ...values } : item)),
      );

      return { previous };
    },
    onError: (_err, _values, context) => {
      if (context?.previous) {
        queryClient.setQueryData<CollectionItem[]>(queryOpts.queryKey, context.previous);
      }
      toast.error("Failed to update collection item. Please try again.");
    },
    onSuccess: () => {
      toast.success("Collection updated");
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: queryOpts.queryKey });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (ids: readonly string[]) => deleteCollectionItems([...ids]),
    onMutate: async (ids: readonly string[]) => {
      if (filtersActive) return undefined;

      await queryClient.cancelQueries({ queryKey: queryOpts.queryKey });
      const previous = queryClient.getQueryData<CollectionItem[]>(queryOpts.queryKey);

      queryClient.setQueryData<CollectionItem[]>(queryOpts.queryKey, (old) => {
        if (!old) return old;
        const idSet = new Set(ids);
        const deletedValue = old
          .filter((item) => idSet.has(item.id))
          .reduce((sum, item) => sum + item.price, 0);
        const deletedCount = ids.length;

        return old
          .filter((item) => !idSet.has(item.id))
          .map((item) => ({
            ...item,
            totalCount: item.totalCount - deletedCount,
            totalValue: item.totalValue - deletedValue,
          }));
      });

      return { previous };
    },
    onError: (_err, _ids, context) => {
      if (context?.previous) {
        queryClient.setQueryData<CollectionItem[]>(queryOpts.queryKey, context.previous);
      }
      toast.error("Failed to delete collection item(s). Please try again.");
    },
    onSuccess: () => {
      toast.success("Collection deleted");
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: queryOpts.queryKey });
    },
  });
  const updateMutationRef = useRef(updateMutation);
  updateMutationRef.current = updateMutation;
  const deleteMutationRef = useRef(deleteMutation);
  deleteMutationRef.current = deleteMutation;

  const isCollectionPending = useCallback((collectionId: string): boolean => {
    return pendingCollectionIdsRef.current.has(collectionId);
  }, []);

  const handleDeleteCollectionItems = useCallback(
    async (collectionIds: Set<string>): Promise<void> => {
      const deleteMutationState = deleteMutationRef.current;
      if (!filtersActiveRef.current) {
        deleteMutationState.mutate(Array.from(collectionIds));
        return;
      }

      const ids = Array.from(collectionIds);
      const loadingToastId = toast.loading("Deleting collection items...");
      setPendingCollectionIdList((previous) => {
        const nextIds = new Set([...previous, ...ids]);
        return Array.from(nextIds);
      });

      try {
        await deleteMutationState.mutateAsync(ids);
      } finally {
        toast.dismiss(loadingToastId);
        setPendingCollectionIdList((previous) =>
          previous.filter((collectionId) => !collectionIds.has(collectionId)),
        );
      }
    },
    [],
  );

  const handleEditCollectionItem = useCallback(
    async (values: CollectionItemFormValues): Promise<void> => {
      const updateMutationState = updateMutationRef.current;
      if (!filtersActiveRef.current) {
        updateMutationState.mutate(values);
        return;
      }
      setPendingCollectionIdList((previous) => {
        const nextIds = new Set([...previous, values.id]);
        return Array.from(nextIds);
      });

      try {
        await updateMutationState.mutateAsync(values);
      } finally {
        setPendingCollectionIdList((previous) =>
          previous.filter((collectionId) => collectionId !== values.id),
        );
      }
    },
    [],
  );

  return {
    handleEditCollectionItem,
    handleDeleteCollectionItems,
    isCollectionPending,
    isDeletingCollectionItems: deleteMutation.isPending,
  } as const;
}
