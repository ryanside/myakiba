import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { toast } from "@/components/ui/toast";
import { useRead, useResourceMutation } from "@/data/client";
import type { Saving } from "@/data/client";
import {
  deleteOrderItemCommand,
  deleteOrderItemsCommand,
  deleteOrdersCommand,
  editOrderCommand,
  editOrderItemCommand,
  mergeOrdersCommand,
  moveOrderItemsCommand,
  orders as ordersResource,
  splitOrdersCommand,
} from "@/data/resources/orders";
import { useFilters } from "@/hooks/use-filters";
import { hasActiveFiltersOrSorting } from "@/lib/filters";
import type {
  EditedOrder,
  NewOrder,
  CascadeOptions,
  OrderFilters,
} from "@myakiba/contracts/orders/schema";
import type { CollectionItemFormValues } from "@myakiba/contracts/collection/types";

const NO_FILTERS: OrderFilters = {};

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

export function useOrdersFilters() {
  return useFilters("/(app)/orders", { resetOffsetOnFilterChange: true });
}

export function useOrdersQuery() {
  const { filters } = useOrdersFilters();
  const filtersActive = hasActiveFiltersOrSorting(filters);

  const { data, isPending, isError, error, status } = useRead(ordersResource.list, filters);

  return {
    orders: data?.items ?? [],
    totalCount: data?.totalCount ?? 0,
    totalSpent: data?.totalSpent ?? 0,
    activeOrders: data?.activeOrders ?? 0,
    unpaidCosts: data?.unpaidCosts ?? 0,
    isPending,
    isError,
    error,
    status,
    filtersActive,
  } as const;
}

export function useOrdersMutations(options?: { readonly filters?: OrderFilters }) {
  const list = options?.filters ?? NO_FILTERS;
  const filtersActive = hasActiveFiltersOrSorting(list);

  const [pendingOrderIdList, setPendingOrderIdList] = useState<readonly string[]>([]);
  const [pendingCollectionItemIdList, setPendingCollectionItemIdList] = useState<readonly string[]>(
    [],
  );
  const pendingOrderIds = useMemo(() => new Set(pendingOrderIdList), [pendingOrderIdList]);
  const pendingCollectionItemIds = useMemo(
    () => new Set(pendingCollectionItemIdList),
    [pendingCollectionItemIdList],
  );
  const listRef = useRef(list);

  const editOrderMutation = useResourceMutation(editOrderCommand);
  const deleteOrdersMutation = useResourceMutation(deleteOrdersCommand);
  const mergeOrdersMutation = useResourceMutation(mergeOrdersCommand);
  const splitOrdersMutation = useResourceMutation(splitOrdersCommand);
  const editItemMutation = useResourceMutation(editOrderItemCommand);
  const deleteItemMutation = useResourceMutation(deleteOrderItemCommand);
  const deleteItemsMutation = useResourceMutation(deleteOrderItemsCommand);
  const moveItemMutation = useResourceMutation(moveOrderItemsCommand);
  const editOrderMutationRef = useRef(editOrderMutation);
  const deleteOrdersMutationRef = useRef(deleteOrdersMutation);
  const editItemMutationRef = useRef(editItemMutation);
  const deleteItemMutationRef = useRef(deleteItemMutation);

  useLayoutEffect(() => {
    listRef.current = list;
    editOrderMutationRef.current = editOrderMutation;
    deleteOrdersMutationRef.current = deleteOrdersMutation;
    editItemMutationRef.current = editItemMutation;
    deleteItemMutationRef.current = deleteItemMutation;
  }, [list, editOrderMutation, deleteOrdersMutation, editItemMutation, deleteItemMutation]);

  const isOrderPending = useCallback(
    (orderId: string): boolean => pendingOrderIds.has(orderId),
    [pendingOrderIds],
  );
  const isCollectionItemPending = useCallback(
    (collectionId: string): boolean => pendingCollectionItemIds.has(collectionId),
    [pendingCollectionItemIds],
  );

  const handleMerge = useCallback(
    async (
      values: NewOrder,
      cascadeOptions: CascadeOptions,
      orderIds: ReadonlySet<string>,
    ): Saving => {
      const mutableOrderIds = new Set(orderIds);

      if (!filtersActive) {
        return mergeOrdersMutation.run({ values, orderIds: mutableOrderIds, cascadeOptions, list });
      }

      const ids = [...mutableOrderIds];
      const loadingToastId = toast.add({
        type: "loading",
        title: "Merging orders...",
        timeout: 0,
      });
      setPendingOrderIdList((previous) => addPendingIds(previous, ids));

      const saved = await mergeOrdersMutation.run({
        values,
        orderIds: mutableOrderIds,
        cascadeOptions,
        list,
      });
      toast.close(loadingToastId);
      setPendingOrderIdList((previous) => removePendingIds(previous, ids));
      return saved;
    },
    [filtersActive, list, mergeOrdersMutation],
  );

  const handleSplit = useCallback(
    async (
      values: NewOrder,
      cascadeOptions: CascadeOptions,
      collectionIds: ReadonlySet<string>,
    ): Saving => {
      const mutableCollectionIds = new Set(collectionIds);

      if (!filtersActive) {
        return splitOrdersMutation.run({
          values,
          collectionIds: mutableCollectionIds,
          cascadeOptions,
        });
      }

      const ids = [...mutableCollectionIds];
      const loadingToastId = toast.add({
        type: "loading",
        title: "Creating order...",
        timeout: 0,
      });
      setPendingCollectionItemIdList((previous) => addPendingIds(previous, ids));

      const saved = await splitOrdersMutation.run({
        values,
        collectionIds: mutableCollectionIds,
        cascadeOptions,
      });
      toast.close(loadingToastId);
      setPendingCollectionItemIdList((previous) => removePendingIds(previous, ids));
      return saved;
    },
    [filtersActive, splitOrdersMutation],
  );

  const handleEditOrder = useCallback(
    async (values: EditedOrder, cascadeOptions: CascadeOptions): Saving => {
      const editOrderMutationState = editOrderMutationRef.current;
      const editList = listRef.current;
      if (!hasActiveFiltersOrSorting(editList)) {
        return editOrderMutationState.run({ values, cascadeOptions, list: editList });
      }

      setPendingOrderIdList((previous) => addPendingIds(previous, [values.orderId]));

      const saved = await editOrderMutationState.run({ values, cascadeOptions, list: editList });
      setPendingOrderIdList((previous) => removePendingIds(previous, [values.orderId]));
      return saved;
    },
    [],
  );

  const handleDeleteOrders = useCallback(async (orderIds: ReadonlySet<string>): Saving => {
    const deleteOrdersMutationState = deleteOrdersMutationRef.current;
    const mutableOrderIds = new Set(orderIds);
    const deleteList = listRef.current;
    if (!hasActiveFiltersOrSorting(deleteList)) {
      return deleteOrdersMutationState.run({ orderIds: mutableOrderIds, list: deleteList });
    }

    const ids = [...mutableOrderIds];
    const loadingToastId = toast.add({
      type: "loading",
      title: "Deleting orders...",
      timeout: 0,
    });
    setPendingOrderIdList((previous) => addPendingIds(previous, ids));

    const saved = await deleteOrdersMutationState.run({
      orderIds: mutableOrderIds,
      list: deleteList,
    });
    toast.close(loadingToastId);
    setPendingOrderIdList((previous) => removePendingIds(previous, ids));
    return saved;
  }, []);

  const handleEditItem = useCallback(async (values: CollectionItemFormValues): Saving => {
    const editItemMutationState = editItemMutationRef.current;
    const editList = listRef.current;
    if (!hasActiveFiltersOrSorting(editList)) {
      return editItemMutationState.run({ values, list: editList });
    }

    setPendingCollectionItemIdList((previous) => addPendingIds(previous, [values.id]));

    const saved = await editItemMutationState.run({ values, list: editList });
    setPendingCollectionItemIdList((previous) => removePendingIds(previous, [values.id]));
    return saved;
  }, []);

  const handleDeleteItem = useCallback(async (orderId: string, itemId: string): Saving => {
    const deleteItemMutationState = deleteItemMutationRef.current;
    const deleteList = listRef.current;
    if (!hasActiveFiltersOrSorting(deleteList)) {
      return deleteItemMutationState.run({ orderId, itemId, list: deleteList });
    }

    setPendingCollectionItemIdList((previous) => addPendingIds(previous, [itemId]));

    const saved = await deleteItemMutationState.run({ orderId, itemId, list: deleteList });
    setPendingCollectionItemIdList((previous) => removePendingIds(previous, [itemId]));
    return saved;
  }, []);

  const handleDeleteItems = useCallback(
    async (collectionIds: ReadonlySet<string>): Saving => {
      const mutableCollectionIds = new Set(collectionIds);

      if (!filtersActive) {
        return deleteItemsMutation.run({ collectionIds: mutableCollectionIds });
      }

      const ids = [...mutableCollectionIds];
      const loadingToastId = toast.add({
        type: "loading",
        title: "Deleting items...",
        timeout: 0,
      });
      setPendingCollectionItemIdList((previous) => addPendingIds(previous, ids));

      const saved = await deleteItemsMutation.run({ collectionIds: mutableCollectionIds });
      toast.close(loadingToastId);
      setPendingCollectionItemIdList((previous) => removePendingIds(previous, ids));
      return saved;
    },
    [filtersActive, deleteItemsMutation],
  );

  const handleMoveItem = useCallback(
    async (
      targetOrderId: string,
      collectionIds: ReadonlySet<string>,
      orderIds?: ReadonlySet<string>,
    ): Saving => {
      const mutableCollectionIds = new Set(collectionIds);
      const mutableOrderIds = orderIds ? new Set(orderIds) : undefined;

      if (!filtersActive) {
        return moveItemMutation.run({
          targetOrderId,
          collectionIds: mutableCollectionIds,
          orderIds: mutableOrderIds,
        });
      }

      const ids = [...mutableCollectionIds];
      const loadingToastId = toast.add({
        type: "loading",
        title: "Moving items...",
        timeout: 0,
      });
      setPendingCollectionItemIdList((previous) => addPendingIds(previous, ids));

      const saved = await moveItemMutation.run({
        targetOrderId,
        collectionIds: mutableCollectionIds,
        orderIds: mutableOrderIds,
      });
      toast.close(loadingToastId);
      setPendingCollectionItemIdList((previous) => removePendingIds(previous, ids));
      return saved;
    },
    [filtersActive, moveItemMutation],
  );

  return {
    handleEditOrder,
    handleDeleteOrders,
    handleMerge,
    handleSplit,
    handleEditItem,
    handleDeleteItem,
    handleDeleteItems,
    handleMoveItem,
    isOrderPending,
    isCollectionItemPending,
    isMerging: mergeOrdersMutation.isPending,
    isSplitting: splitOrdersMutation.isPending,
    isDeletingOrders: deleteOrdersMutation.isPending,
    isDeletingItems: deleteItemsMutation.isPending,
    isMovingItems: moveItemMutation.isPending,
  } as const;
}
