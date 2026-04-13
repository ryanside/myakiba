import { useCallback, useMemo, useRef, useState } from "react";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  queryOptions,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { useFilters } from "@/hooks/use-filters";
import { getCollection, deleteCollectionItems, updateCollectionItem } from "@/queries/collection";
import { moveItem, splitOrders } from "@/queries/orders";
import { hasActiveFiltersOrSorting } from "@/lib/filters";
import type { CollectionFilters } from "@myakiba/contracts/collection/schema";
import type { CollectionItem, CollectionItemFormValues } from "@myakiba/contracts/collection/types";
import type { CascadeOptions, NewOrder } from "@myakiba/contracts/orders/schema";

export function collectionQueryOptions(filters: CollectionFilters) {
  return queryOptions({
    queryKey: ["collection", filters] as const,
    queryFn: () => getCollection(filters),
    placeholderData: keepPreviousData,
  });
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

function addPendingIds(previous: readonly string[], ids: readonly string[]): readonly string[] {
  return Array.from(new Set([...previous, ...ids]));
}

function removePendingIds(previous: readonly string[], ids: readonly string[]): readonly string[] {
  if (ids.length === 0) {
    return previous;
  }

  const idsToRemove = new Set(ids);
  return previous.filter((id) => !idsToRemove.has(id));
}

export function useCollectionOrderMutations() {
  const queryClient = useQueryClient();
  const [pendingCollectionIdList, setPendingCollectionIdList] = useState<readonly string[]>([]);
  const pendingCollectionIds = useMemo(
    () => new Set(pendingCollectionIdList),
    [pendingCollectionIdList],
  );
  const pendingCollectionIdsRef = useRef<ReadonlySet<string>>(pendingCollectionIds);
  pendingCollectionIdsRef.current = pendingCollectionIds;

  const moveItemsMutation = useMutation({
    mutationFn: ({
      targetOrderId,
      collectionIds,
      orderIds,
    }: {
      targetOrderId: string;
      collectionIds: ReadonlySet<string>;
      orderIds?: ReadonlySet<string>;
    }) => moveItem(targetOrderId, collectionIds, orderIds),
    onSuccess: (_data, { collectionIds }) => {
      toast.success(
        collectionIds.size === 1
          ? "Order assigned"
          : `Successfully assigned ${collectionIds.size} items to an order`,
      );
    },
    onError: () => {
      toast.error("Failed to assign items to an order. Please try again.");
    },
    onSettled: async () => {
      await queryClient.invalidateQueries();
    },
  });

  const splitItemsMutation = useMutation({
    mutationFn: ({
      values,
      collectionIds,
      cascadeOptions,
    }: {
      values: NewOrder;
      collectionIds: ReadonlySet<string>;
      cascadeOptions: CascadeOptions;
    }) => splitOrders(values, collectionIds, cascadeOptions),
    onSuccess: (_data, { collectionIds }) => {
      toast.success(
        collectionIds.size === 1
          ? "Order assigned"
          : `Successfully assigned ${collectionIds.size} items to a new order`,
      );
    },
    onError: () => {
      toast.error("Failed to assign items to a new order. Please try again.");
    },
    onSettled: async () => {
      await queryClient.invalidateQueries();
    },
  });
  // Keep the latest mutation objects in refs so these action callbacks can stay stable.
  // Recreating them churns CollectionDataGrid columns and causes editable cells to remount.
  const moveItemsMutationRef = useRef(moveItemsMutation);
  moveItemsMutationRef.current = moveItemsMutation;
  const splitItemsMutationRef = useRef(splitItemsMutation);
  splitItemsMutationRef.current = splitItemsMutation;

  const handleAddCollectionItemsToOrder = useCallback(
    async (
      targetOrderId: string,
      collectionIds: ReadonlySet<string>,
      orderIds?: ReadonlySet<string>,
    ): Promise<void> => {
      const ids = Array.from(collectionIds);
      const loadingToastId = toast.loading("Assigning order...");
      setPendingCollectionIdList((previous) => addPendingIds(previous, ids));

      try {
        await moveItemsMutationRef.current.mutateAsync({ targetOrderId, collectionIds, orderIds });
      } finally {
        toast.dismiss(loadingToastId);
        setPendingCollectionIdList((previous) => removePendingIds(previous, ids));
      }
    },
    [],
  );

  const handleAddCollectionItemsToNewOrder = useCallback(
    async (
      values: NewOrder,
      cascadeOptions: CascadeOptions,
      collectionIds: ReadonlySet<string>,
    ): Promise<void> => {
      const ids = Array.from(collectionIds);
      const loadingToastId = toast.loading("Creating order...");
      setPendingCollectionIdList((previous) => addPendingIds(previous, ids));

      try {
        await splitItemsMutationRef.current.mutateAsync({ values, cascadeOptions, collectionIds });
      } finally {
        toast.dismiss(loadingToastId);
        setPendingCollectionIdList((previous) => removePendingIds(previous, ids));
      }
    },
    [],
  );

  const isCollectionOrderPending = useCallback((collectionId: string): boolean => {
    return pendingCollectionIdsRef.current.has(collectionId);
  }, []);

  return {
    handleAddCollectionItemsToOrder,
    handleAddCollectionItemsToNewOrder,
    isCollectionOrderPending,
    isMovingCollectionItems: moveItemsMutation.isPending,
    isSplittingCollectionItems: splitItemsMutation.isPending,
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
      await queryClient.invalidateQueries();
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
      await queryClient.invalidateQueries();
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
    async (collectionIds: ReadonlySet<string>): Promise<void> => {
      const deleteMutationState = deleteMutationRef.current;
      const ids = Array.from(collectionIds);

      if (!filtersActiveRef.current) {
        deleteMutationState.mutate(ids);
        return;
      }

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
