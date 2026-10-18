import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { toast } from "@/components/ui/toast";
import { orThrow, useRead, useResourceMutation } from "@/data/client";
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

  const { data, isPending, isError, status } = useRead(ordersResource.list, filters);

  const orders = data ?? [];
  const head = orders[0];

  return {
    orders,
    totalCount: head?.totalCount ?? 0,
    totalSpent: head?.totalSpent ?? 0,
    activeOrders: head?.activeOrders ?? 0,
    unpaidCosts: head?.unpaidCosts ?? 0,
    isPending,
    isError,
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
    ): Promise<void> => {
      const mutableOrderIds = new Set(orderIds);

      if (!filtersActive) {
        await orThrow(
          mergeOrdersMutation.run({ values, orderIds: mutableOrderIds, cascadeOptions, list }),
        );
        return;
      }

      const ids = [...mutableOrderIds];
      const loadingToastId = toast.add({
        type: "loading",
        title: "Merging orders...",
        timeout: 0,
      });
      setPendingOrderIdList((previous) => addPendingIds(previous, ids));

      try {
        await orThrow(
          mergeOrdersMutation.run({ values, orderIds: mutableOrderIds, cascadeOptions, list }),
        );
      } finally {
        toast.close(loadingToastId);
        setPendingOrderIdList((previous) => removePendingIds(previous, ids));
      }
    },
    [filtersActive, list, mergeOrdersMutation],
  );

  const handleSplit = useCallback(
    async (
      values: NewOrder,
      cascadeOptions: CascadeOptions,
      collectionIds: ReadonlySet<string>,
    ): Promise<void> => {
      const mutableCollectionIds = new Set(collectionIds);

      if (!filtersActive) {
        await orThrow(
          splitOrdersMutation.run({ values, collectionIds: mutableCollectionIds, cascadeOptions }),
        );
        return;
      }

      const ids = [...mutableCollectionIds];
      const loadingToastId = toast.add({
        type: "loading",
        title: "Creating order...",
        timeout: 0,
      });
      setPendingCollectionItemIdList((previous) => addPendingIds(previous, ids));

      try {
        await orThrow(
          splitOrdersMutation.run({ values, collectionIds: mutableCollectionIds, cascadeOptions }),
        );
      } finally {
        toast.close(loadingToastId);
        setPendingCollectionItemIdList((previous) => removePendingIds(previous, ids));
      }
    },
    [filtersActive, splitOrdersMutation],
  );

  const handleEditOrder = useCallback(
    async (values: EditedOrder, cascadeOptions: CascadeOptions): Promise<void> => {
      const editOrderMutationState = editOrderMutationRef.current;
      const editList = listRef.current;
      if (!hasActiveFiltersOrSorting(editList)) {
        await orThrow(editOrderMutationState.run({ values, cascadeOptions, list: editList }));
        return;
      }

      setPendingOrderIdList((previous) => addPendingIds(previous, [values.orderId]));

      try {
        await orThrow(editOrderMutationState.run({ values, cascadeOptions, list: editList }));
      } finally {
        setPendingOrderIdList((previous) => removePendingIds(previous, [values.orderId]));
      }
    },
    [],
  );

  const handleDeleteOrders = useCallback(async (orderIds: ReadonlySet<string>): Promise<void> => {
    const deleteOrdersMutationState = deleteOrdersMutationRef.current;
    const mutableOrderIds = new Set(orderIds);
    const deleteList = listRef.current;
    if (!hasActiveFiltersOrSorting(deleteList)) {
      await orThrow(deleteOrdersMutationState.run({ orderIds: mutableOrderIds, list: deleteList }));
      return;
    }

    const ids = [...mutableOrderIds];
    const loadingToastId = toast.add({
      type: "loading",
      title: "Deleting orders...",
      timeout: 0,
    });
    setPendingOrderIdList((previous) => addPendingIds(previous, ids));

    try {
      await orThrow(deleteOrdersMutationState.run({ orderIds: mutableOrderIds, list: deleteList }));
    } finally {
      toast.close(loadingToastId);
      setPendingOrderIdList((previous) => removePendingIds(previous, ids));
    }
  }, []);

  const handleEditItem = useCallback(async (values: CollectionItemFormValues): Promise<void> => {
    const editItemMutationState = editItemMutationRef.current;
    const editList = listRef.current;
    if (!hasActiveFiltersOrSorting(editList)) {
      await orThrow(editItemMutationState.run({ values, list: editList }));
      return;
    }

    setPendingCollectionItemIdList((previous) => addPendingIds(previous, [values.id]));

    try {
      await orThrow(editItemMutationState.run({ values, list: editList }));
    } finally {
      setPendingCollectionItemIdList((previous) => removePendingIds(previous, [values.id]));
    }
  }, []);

  const handleDeleteItem = useCallback(async (orderId: string, itemId: string): Promise<void> => {
    const deleteItemMutationState = deleteItemMutationRef.current;
    const deleteList = listRef.current;
    if (!hasActiveFiltersOrSorting(deleteList)) {
      await orThrow(deleteItemMutationState.run({ orderId, itemId, list: deleteList }));
      return;
    }

    setPendingCollectionItemIdList((previous) => addPendingIds(previous, [itemId]));

    try {
      await orThrow(deleteItemMutationState.run({ orderId, itemId, list: deleteList }));
    } finally {
      setPendingCollectionItemIdList((previous) => removePendingIds(previous, [itemId]));
    }
  }, []);

  const handleDeleteItems = useCallback(
    async (collectionIds: ReadonlySet<string>): Promise<void> => {
      const mutableCollectionIds = new Set(collectionIds);

      if (!filtersActive) {
        await orThrow(deleteItemsMutation.run({ collectionIds: mutableCollectionIds }));
        return;
      }

      const ids = [...mutableCollectionIds];
      const loadingToastId = toast.add({
        type: "loading",
        title: "Deleting items...",
        timeout: 0,
      });
      setPendingCollectionItemIdList((previous) => addPendingIds(previous, ids));

      try {
        await orThrow(deleteItemsMutation.run({ collectionIds: mutableCollectionIds }));
      } finally {
        toast.close(loadingToastId);
        setPendingCollectionItemIdList((previous) => removePendingIds(previous, ids));
      }
    },
    [filtersActive, deleteItemsMutation],
  );

  const handleMoveItem = useCallback(
    async (
      targetOrderId: string,
      collectionIds: ReadonlySet<string>,
      orderIds?: ReadonlySet<string>,
    ): Promise<void> => {
      const mutableCollectionIds = new Set(collectionIds);
      const mutableOrderIds = orderIds ? new Set(orderIds) : undefined;

      if (!filtersActive) {
        await orThrow(
          moveItemMutation.run({
            targetOrderId,
            collectionIds: mutableCollectionIds,
            orderIds: mutableOrderIds,
          }),
        );
        return;
      }

      const ids = [...mutableCollectionIds];
      const loadingToastId = toast.add({
        type: "loading",
        title: "Moving items...",
        timeout: 0,
      });
      setPendingCollectionItemIdList((previous) => addPendingIds(previous, ids));

      try {
        await orThrow(
          moveItemMutation.run({
            targetOrderId,
            collectionIds: mutableCollectionIds,
            orderIds: mutableOrderIds,
          }),
        );
      } finally {
        toast.close(loadingToastId);
        setPendingCollectionItemIdList((previous) => removePendingIds(previous, ids));
      }
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
