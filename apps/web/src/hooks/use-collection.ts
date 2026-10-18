import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { toast } from "@/components/ui/toast";
import { orThrow, useRead, useResourceMutation } from "@/data/client";
import {
  assignToNewOrderCommand,
  assignToOrderCommand,
  collection as collectionResource,
  deleteCollectionItemsCommand,
  updateCollectionItemCommand,
} from "@/data/resources/collection";
import { useFilters } from "@/hooks/use-filters";
import { hasActiveFiltersOrSorting } from "@/lib/filters";
import type { CollectionFilters } from "@myakiba/contracts/collection/schema";
import type { CollectionItemFormValues } from "@myakiba/contracts/collection/types";
import type { CascadeOptions, NewOrder } from "@myakiba/contracts/orders/schema";

export function useCollectionFilters() {
  return useFilters("/(app)/collection", { resetOffsetOnFilterChange: true });
}

export function useCollectionQuery() {
  const { filters } = useCollectionFilters();
  const filtersActive = hasActiveFiltersOrSorting(filters);

  const { data, isPending, isError, status } = useRead(collectionResource.list, filters);

  return {
    items: data?.items ?? [],
    totalCount: data?.totalCount ?? 0,
    totalValue: data?.totalValue ?? 0,
    totalItemsThisMonth: data?.totalItemsThisMonth ?? 0,
    isPending,
    isError,
    status,
    filtersActive,
  } as const;
}

const NO_FILTERS: CollectionFilters = {};

function addPendingIds(previous: readonly string[], ids: readonly string[]): readonly string[] {
  return [...new Set([...previous, ...ids])];
}

function removePendingIds(previous: readonly string[], ids: readonly string[]): readonly string[] {
  if (ids.length === 0) {
    return previous;
  }

  const idsToRemove = new Set(ids);
  return previous.filter((id) => !idsToRemove.has(id));
}

export function useCollectionOrderMutations() {
  const [pendingCollectionIdList, setPendingCollectionIdList] = useState<readonly string[]>([]);
  const pendingCollectionIds = useMemo(
    () => new Set(pendingCollectionIdList),
    [pendingCollectionIdList],
  );

  const moveItemsMutation = useResourceMutation(assignToOrderCommand);
  const splitItemsMutation = useResourceMutation(assignToNewOrderCommand);
  // Keep the latest mutation objects in refs so these action callbacks can stay stable.
  // Recreating them churns CollectionDataGrid columns and causes editable cells to remount.
  const moveItemsMutationRef = useRef(moveItemsMutation);
  const splitItemsMutationRef = useRef(splitItemsMutation);
  useLayoutEffect(() => {
    moveItemsMutationRef.current = moveItemsMutation;
    splitItemsMutationRef.current = splitItemsMutation;
  }, [moveItemsMutation, splitItemsMutation]);

  const handleAddCollectionItemsToOrder = useCallback(
    async (
      targetOrderId: string,
      collectionIds: ReadonlySet<string>,
      orderIds?: ReadonlySet<string>,
    ): Promise<void> => {
      const ids = [...collectionIds];
      const loadingToastId = toast.add({
        type: "loading",
        title: "Assigning order...",
        timeout: 0,
      });
      setPendingCollectionIdList((previous) => addPendingIds(previous, ids));

      try {
        await orThrow(moveItemsMutationRef.current.run({ targetOrderId, collectionIds, orderIds }));
      } finally {
        toast.close(loadingToastId);
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
      const ids = [...collectionIds];
      const loadingToastId = toast.add({
        type: "loading",
        title: "Creating order...",
        timeout: 0,
      });
      setPendingCollectionIdList((previous) => addPendingIds(previous, ids));

      try {
        await orThrow(splitItemsMutationRef.current.run({ values, cascadeOptions, collectionIds }));
      } finally {
        toast.close(loadingToastId);
        setPendingCollectionIdList((previous) => removePendingIds(previous, ids));
      }
    },
    [],
  );

  const isCollectionOrderPending = useCallback(
    (collectionId: string): boolean => pendingCollectionIds.has(collectionId),
    [pendingCollectionIds],
  );

  return {
    handleAddCollectionItemsToOrder,
    handleAddCollectionItemsToNewOrder,
    isCollectionOrderPending,
    isMovingCollectionItems: moveItemsMutation.isPending,
    isSplittingCollectionItems: splitItemsMutation.isPending,
  } as const;
}

export function useCollectionMutations(options?: { readonly filters?: CollectionFilters }) {
  const list = options?.filters ?? NO_FILTERS;

  const [pendingCollectionIdList, setPendingCollectionIdList] = useState<readonly string[]>([]);
  const pendingCollectionIds = useMemo(
    () => new Set(pendingCollectionIdList),
    [pendingCollectionIdList],
  );
  const listRef = useRef(list);
  useLayoutEffect(() => {
    listRef.current = list;
  }, [list]);

  const updateMutation = useResourceMutation(updateCollectionItemCommand);
  const deleteMutation = useResourceMutation(deleteCollectionItemsCommand);
  const updateMutationRef = useRef(updateMutation);
  const deleteMutationRef = useRef(deleteMutation);
  useLayoutEffect(() => {
    updateMutationRef.current = updateMutation;
    deleteMutationRef.current = deleteMutation;
  }, [deleteMutation, updateMutation]);

  const isCollectionPending = useCallback(
    (collectionId: string): boolean => pendingCollectionIds.has(collectionId),
    [pendingCollectionIds],
  );

  const handleDeleteCollectionItems = useCallback(
    async (collectionIds: ReadonlySet<string>): Promise<void> => {
      const deleteMutationState = deleteMutationRef.current;
      const ids = [...collectionIds];
      const deleteList = listRef.current;

      if (!hasActiveFiltersOrSorting(deleteList)) {
        await orThrow(deleteMutationState.run({ ids, list: deleteList }));
        return;
      }

      const loadingToastId = toast.add({
        type: "loading",
        title: "Deleting collection items...",
        timeout: 0,
      });
      setPendingCollectionIdList((previous) => {
        const nextIds = new Set([...previous, ...ids]);
        return [...nextIds];
      });

      try {
        await orThrow(deleteMutationState.run({ ids, list: deleteList }));
      } finally {
        toast.close(loadingToastId);
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
      const editList = listRef.current;
      if (!hasActiveFiltersOrSorting(editList)) {
        await orThrow(updateMutationState.run({ values, list: editList }));
        return;
      }
      setPendingCollectionIdList((previous) => {
        const nextIds = new Set([...previous, values.id]);
        return [...nextIds];
      });

      try {
        await orThrow(updateMutationState.run({ values, list: editList }));
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
