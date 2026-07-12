import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  queryOptions,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { useFilters } from "@/hooks/use-filters";
import {
  getOrders,
  getOrderItems,
  getOrderItemReleases,
  mergeOrders,
  splitOrders,
  editOrder,
  deleteOrders,
  deleteOrderItem,
  deleteOrderItems,
  moveItem,
} from "@/queries/orders";
import { updateCollectionItem } from "@/queries/collection";
import { hasActiveFiltersOrSorting } from "@/lib/filters";
import type {
  EditedOrder,
  NewOrder,
  CascadeOptions,
  OrderFilters,
} from "@myakiba/contracts/orders/schema";
import type {
  Order,
  OrderItem,
  OrderListItem,
  PaginatedResult,
} from "@myakiba/contracts/orders/types";
import type { CollectionItemFormValues } from "@myakiba/contracts/collection/types";

function ordersQueryOptions(filters: OrderFilters) {
  return queryOptions({
    queryKey: ["orders", filters] as const,
    queryFn: () => getOrders(filters),
    placeholderData: keepPreviousData,
  });
}

export function orderItemsQueryOptions(orderId: string, limit: number, offset: number) {
  return queryOptions({
    queryKey: ["orderItems", orderId, limit, offset] as const,
    queryFn: () => getOrderItems(orderId, limit, offset),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}

export function orderItemReleasesQueryOptions(orderId: string) {
  return queryOptions({
    queryKey: ["orderItemReleases", orderId] as const,
    queryFn: () => getOrderItemReleases(orderId),
    staleTime: 30_000,
  });
}

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
  const queryOpts = ordersQueryOptions(filters);
  const filtersActive = hasActiveFiltersOrSorting(filters);

  const { data, isPending, isError, status } = useQuery(queryOpts);

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
    queryOpts,
    filtersActive,
  } as const;
}

export function useOrdersMutations(options?: { readonly filters?: OrderFilters }) {
  const queryClient = useQueryClient();
  const filters = options?.filters;
  const ordersOpts = ordersQueryOptions(filters ?? {});
  // The order detail route renders this hook without filters and cannot apply
  // any. Treat that case as "no filters active" so it gets the same
  // optimistic, fire-and-forget path as the unfiltered list view.
  const filtersActive = filters === undefined ? false : hasActiveFiltersOrSorting(filters);

  const [pendingOrderIdList, setPendingOrderIdList] = useState<readonly string[]>([]);
  const [pendingCollectionItemIdList, setPendingCollectionItemIdList] = useState<readonly string[]>(
    [],
  );
  const pendingOrderIds = useMemo(() => new Set(pendingOrderIdList), [pendingOrderIdList]);
  const pendingCollectionItemIds = useMemo(
    () => new Set(pendingCollectionItemIdList),
    [pendingCollectionItemIdList],
  );
  const filtersActiveRef = useRef(filtersActive);
  const pendingOrderIdsRef = useRef<ReadonlySet<string>>(pendingOrderIds);
  pendingOrderIdsRef.current = pendingOrderIds;
  const pendingCollectionItemIdsRef = useRef<ReadonlySet<string>>(pendingCollectionItemIds);
  pendingCollectionItemIdsRef.current = pendingCollectionItemIds;

  const editOrderMutation = useMutation({
    mutationFn: ({
      values,
      cascadeOptions,
    }: {
      values: EditedOrder;
      cascadeOptions: CascadeOptions;
    }) => editOrder(values, cascadeOptions),
    onMutate: async ({ values }) => {
      // Always patch the order detail cache (`["order", orderId]`); it is keyed
      // by id, so it is safe to update regardless of any list-page filter state.
      const orderDetailKey = ["order", values.orderId] as const;
      await queryClient.cancelQueries({ queryKey: orderDetailKey });
      const previousOrderDetail = queryClient.getQueryData<Order>(orderDetailKey);
      const detailNewTotal = previousOrderDetail
        ? Number(previousOrderDetail.total) +
          (values.shippingFee - Number(previousOrderDetail.shippingFee)) +
          (values.taxes - Number(previousOrderDetail.taxes)) +
          (values.duties - Number(previousOrderDetail.duties)) +
          (values.tariffs - Number(previousOrderDetail.tariffs)) +
          (values.miscFees - Number(previousOrderDetail.miscFees))
        : undefined;
      queryClient.setQueryData<Order>(orderDetailKey, (old) =>
        old
          ? { ...old, ...values, ...(detailNewTotal !== undefined && { total: detailNewTotal }) }
          : old,
      );

      if (filtersActive) {
        return { previousOrderDetail };
      }

      await queryClient.cancelQueries({ queryKey: ordersOpts.queryKey });
      const previousList = queryClient.getQueryData<OrderListItem[]>(ordersOpts.queryKey);
      const oldOrder = previousList?.find((o) => o.orderId === values.orderId);

      const newTotal = oldOrder
        ? Number(oldOrder.total) +
          (values.shippingFee - Number(oldOrder.shippingFee)) +
          (values.taxes - Number(oldOrder.taxes)) +
          (values.duties - Number(oldOrder.duties)) +
          (values.tariffs - Number(oldOrder.tariffs)) +
          (values.miscFees - Number(oldOrder.miscFees))
        : undefined;

      queryClient.setQueryData<OrderListItem[]>(ordersOpts.queryKey, (old) =>
        old?.map((order) =>
          order.orderId === values.orderId
            ? { ...order, ...values, ...(newTotal !== undefined && { total: newTotal }) }
            : order,
        ),
      );

      return { previousList, previousOrderDetail };
    },
    onSuccess: () => {
      toast.success("Order updated");
    },
    onError: (_err, _vars, context) => {
      if (context?.previousList) {
        queryClient.setQueryData<OrderListItem[]>(ordersOpts.queryKey, context.previousList);
      }
      if (context?.previousOrderDetail) {
        queryClient.setQueryData<Order>(
          ["order", context.previousOrderDetail.orderId],
          context.previousOrderDetail,
        );
      }
      toast.error("Failed to update order. Please try again.");
    },
    onSettled: async () => {
      await queryClient.invalidateQueries();
    },
  });

  const deleteOrdersMutation = useMutation({
    mutationFn: (orderIds: Set<string>) => deleteOrders(orderIds),
    onMutate: async (orderIds) => {
      if (filtersActive) return;

      await queryClient.cancelQueries({ queryKey: ordersOpts.queryKey });
      const previous = queryClient.getQueryData<OrderListItem[]>(ordersOpts.queryKey);

      queryClient.setQueryData<OrderListItem[]>(ordersOpts.queryKey, (old) => {
        if (!old) return old;
        return old.flatMap((order) =>
          orderIds.has(order.orderId)
            ? []
            : [{ ...order, totalCount: order.totalCount - orderIds.size }],
        );
      });

      return { previous };
    },
    onSuccess: (_data, orderIds) => {
      toast.success(
        orderIds.size === 1 ? "Order deleted" : `Successfully deleted ${orderIds.size} orders`,
      );
    },
    onError: (_err, _ids, context) => {
      if (context?.previous) {
        queryClient.setQueryData<OrderListItem[]>(ordersOpts.queryKey, context.previous);
      }
      toast.error("Failed to delete order(s). Please try again.");
    },
    onSettled: async () => {
      await queryClient.invalidateQueries();
    },
  });

  const mergeOrdersMutation = useMutation({
    mutationFn: ({
      values,
      orderIds,
      cascadeOptions,
    }: {
      values: NewOrder;
      orderIds: Set<string>;
      cascadeOptions: CascadeOptions;
    }) => mergeOrders(values, orderIds, cascadeOptions),
    onMutate: async ({ orderIds }) => {
      if (filtersActive) return;

      await queryClient.cancelQueries({ queryKey: ordersOpts.queryKey });
      const previous = queryClient.getQueryData<OrderListItem[]>(ordersOpts.queryKey);

      queryClient.setQueryData<OrderListItem[]>(ordersOpts.queryKey, (old) => {
        if (!old) return old;
        return old.filter((order) => !orderIds.has(order.orderId));
      });

      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData<OrderListItem[]>(ordersOpts.queryKey, context.previous);
      }
      toast.error("Failed to merge orders. Please try again.");
    },
    onSuccess: (_data, { orderIds }) => {
      toast.success(`Successfully merged ${orderIds.size} orders into one!`);
    },
    onSettled: async () => {
      await queryClient.invalidateQueries();
    },
  });

  const splitOrdersMutation = useMutation({
    mutationFn: ({
      values,
      collectionIds,
      cascadeOptions,
    }: {
      values: NewOrder;
      collectionIds: Set<string>;
      cascadeOptions: CascadeOptions;
    }) => splitOrders(values, collectionIds, cascadeOptions),
    onSuccess: (_data, { collectionIds }) => {
      toast.success(`Successfully moved ${collectionIds.size} items to a new order!`);
    },
    onError: () => {
      toast.error("Failed to move items to a new order. Please try again.");
    },
    onSettled: async () => {
      await queryClient.invalidateQueries();
    },
  });

  const editItemMutation = useMutation({
    mutationFn: (values: CollectionItemFormValues) => updateCollectionItem(values),
    onMutate: async (values) => {
      const itemOrderId = values.orderId;
      if (!itemOrderId) return;

      await queryClient.cancelQueries({ queryKey: ["orderItems", itemOrderId] });
      const previousOrderItems = queryClient.getQueriesData<PaginatedResult<OrderItem>>({
        queryKey: ["orderItems", itemOrderId],
      });

      let oldPrice: number | undefined;
      queryClient.setQueriesData<PaginatedResult<OrderItem>>(
        { queryKey: ["orderItems", itemOrderId] },
        (old) => {
          if (!old) return old;
          return {
            ...old,
            items: old.items.map((item) => {
              if (item.id === values.id) {
                oldPrice = item.price;
                return { ...item, ...values };
              }
              return item;
            }),
          };
        },
      );

      const priceChanged = oldPrice !== undefined && oldPrice !== values.price;
      const priceDelta = priceChanged ? values.price - (oldPrice as number) : 0;

      const orderDetailKey = ["order", itemOrderId] as const;
      await queryClient.cancelQueries({ queryKey: orderDetailKey });
      const previousOrderDetail = queryClient.getQueryData<Order>(orderDetailKey);
      if (priceChanged) {
        queryClient.setQueryData<Order>(orderDetailKey, (old) =>
          old ? { ...old, total: Number(old.total) + priceDelta } : old,
        );
      }

      let previousOrders: OrderListItem[] | undefined;

      if (!filtersActive && priceChanged) {
        await queryClient.cancelQueries({ queryKey: ordersOpts.queryKey });
        previousOrders = queryClient.getQueryData<OrderListItem[]>(ordersOpts.queryKey);
        const nextOrders = previousOrders?.map((order) =>
          order.orderId === itemOrderId
            ? { ...order, total: Number(order.total) + priceDelta }
            : order,
        );
        queryClient.setQueryData<OrderListItem[]>(ordersOpts.queryKey, nextOrders);
      }

      return { previousOrderItems, previousOrders, previousOrderDetail, orderDetailKey };
    },
    onSuccess: () => {
      toast.success("Item updated");
    },
    onError: (_err, _values, context) => {
      if (context?.previousOrderItems) {
        for (const [queryKey, data] of context.previousOrderItems) {
          queryClient.setQueryData(queryKey, data);
        }
      }
      if (context?.previousOrders) {
        queryClient.setQueryData<OrderListItem[]>(ordersOpts.queryKey, context.previousOrders);
      }
      if (context?.previousOrderDetail && context.orderDetailKey) {
        queryClient.setQueryData<Order>(context.orderDetailKey, context.previousOrderDetail);
      }
      toast.error("Failed to update item. Please try again.");
    },
    onSettled: async () => {
      await queryClient.invalidateQueries();
    },
  });

  const deleteItemMutation = useMutation({
    mutationFn: ({ orderId, itemId }: { orderId: string; itemId: string }) =>
      deleteOrderItem(orderId, itemId),
    onMutate: async ({ orderId, itemId }) => {
      await queryClient.cancelQueries({ queryKey: ["orderItems", orderId] });
      const previousOrderItems = queryClient.getQueriesData<PaginatedResult<OrderItem>>({
        queryKey: ["orderItems", orderId],
      });

      let removedPrice = 0;
      queryClient.setQueriesData<PaginatedResult<OrderItem>>(
        { queryKey: ["orderItems", orderId] },
        (old) => {
          if (!old) return old;
          const removedItem = old.items.find((item) => item.id === itemId);
          if (removedItem) removedPrice = removedItem.price;
          return {
            items: old.items.filter((item) => item.id !== itemId),
            totalCount: old.totalCount - 1,
          };
        },
      );

      const orderDetailKey = ["order", orderId] as const;
      await queryClient.cancelQueries({ queryKey: orderDetailKey });
      const previousOrderDetail = queryClient.getQueryData<Order>(orderDetailKey);
      queryClient.setQueryData<Order>(orderDetailKey, (old) =>
        old
          ? {
              ...old,
              total: old.total - removedPrice,
              itemCount: old.itemCount - 1,
            }
          : old,
      );

      let previousOrders: OrderListItem[] | undefined;

      if (!filtersActive) {
        await queryClient.cancelQueries({ queryKey: ordersOpts.queryKey });
        previousOrders = queryClient.getQueryData<OrderListItem[]>(ordersOpts.queryKey);
        queryClient.setQueryData<OrderListItem[]>(ordersOpts.queryKey, (old) =>
          old?.map((order) =>
            order.orderId === orderId
              ? {
                  ...order,
                  total: order.total - removedPrice,
                  itemCount: order.itemCount - 1,
                }
              : order,
          ),
        );
      }

      return { previousOrderItems, previousOrders, previousOrderDetail, orderDetailKey };
    },
    onSuccess: () => {
      toast.success("Item deleted");
    },
    onError: (_err, _vars, context) => {
      if (context?.previousOrderItems) {
        for (const [queryKey, data] of context.previousOrderItems) {
          queryClient.setQueryData(queryKey, data);
        }
      }
      if (context?.previousOrders) {
        queryClient.setQueryData<OrderListItem[]>(ordersOpts.queryKey, context.previousOrders);
      }
      if (context?.previousOrderDetail && context.orderDetailKey) {
        queryClient.setQueryData<Order>(context.orderDetailKey, context.previousOrderDetail);
      }
      toast.error("Failed to delete item. Please try again.");
    },
    onSettled: async () => {
      await queryClient.invalidateQueries();
    },
  });

  const deleteItemsMutation = useMutation({
    mutationFn: (collectionIds: Set<string>) => deleteOrderItems(collectionIds),
    onSuccess: (_data, collectionIds) => {
      toast.success(
        collectionIds.size === 1
          ? "Item deleted"
          : `Successfully deleted ${collectionIds.size} items`,
      );
    },
    onError: () => {
      toast.error("Failed to delete items. Please try again.");
    },
    onSettled: async () => {
      await queryClient.invalidateQueries();
    },
  });

  const moveItemMutation = useMutation({
    mutationFn: ({
      targetOrderId,
      collectionIds,
      orderIds,
    }: {
      targetOrderId: string;
      collectionIds: Set<string>;
      orderIds?: Set<string>;
    }) => moveItem(targetOrderId, collectionIds, orderIds),
    onSuccess: (_data, { collectionIds }) => {
      toast.success(
        collectionIds.size === 1 ? "Item moved" : `Successfully moved ${collectionIds.size} items`,
      );
    },
    onError: () => {
      toast.error("Failed to move items. Please try again.");
    },
    onSettled: async () => {
      await queryClient.invalidateQueries();
    },
  });
  const editOrderMutationRef = useRef(editOrderMutation);
  const deleteOrdersMutationRef = useRef(deleteOrdersMutation);
  const editItemMutationRef = useRef(editItemMutation);
  const deleteItemMutationRef = useRef(deleteItemMutation);

  useLayoutEffect(() => {
    filtersActiveRef.current = filtersActive;
    editOrderMutationRef.current = editOrderMutation;
    deleteOrdersMutationRef.current = deleteOrdersMutation;
    editItemMutationRef.current = editItemMutation;
    deleteItemMutationRef.current = deleteItemMutation;
  }, [
    filtersActive,
    editOrderMutation,
    deleteOrdersMutation,
    editItemMutation,
    deleteItemMutation,
  ]);

  const isOrderPending = useCallback(
    (orderId: string): boolean => pendingOrderIdsRef.current.has(orderId),
    [],
  );
  const isCollectionItemPending = useCallback(
    (collectionId: string): boolean => pendingCollectionItemIdsRef.current.has(collectionId),
    [],
  );

  const handleMerge = useCallback(
    async (
      values: NewOrder,
      cascadeOptions: CascadeOptions,
      orderIds: ReadonlySet<string>,
    ): Promise<void> => {
      const mutableOrderIds = new Set(orderIds);

      if (!filtersActive) {
        mergeOrdersMutation.mutate({ values, orderIds: mutableOrderIds, cascadeOptions });
        return;
      }

      const ids = [...mutableOrderIds];
      const loadingToastId = toast.loading("Merging orders...");
      setPendingOrderIdList((previous) => addPendingIds(previous, ids));

      try {
        await mergeOrdersMutation.mutateAsync({
          values,
          orderIds: mutableOrderIds,
          cascadeOptions,
        });
      } finally {
        toast.dismiss(loadingToastId);
        setPendingOrderIdList((previous) => removePendingIds(previous, ids));
      }
    },
    [filtersActive, mergeOrdersMutation],
  );

  const handleSplit = useCallback(
    async (
      values: NewOrder,
      cascadeOptions: CascadeOptions,
      collectionIds: ReadonlySet<string>,
    ): Promise<void> => {
      const mutableCollectionIds = new Set(collectionIds);

      if (!filtersActive) {
        splitOrdersMutation.mutate({
          values,
          collectionIds: mutableCollectionIds,
          cascadeOptions,
        });
        return;
      }

      const ids = [...mutableCollectionIds];
      const loadingToastId = toast.loading("Creating order...");
      setPendingCollectionItemIdList((previous) => addPendingIds(previous, ids));

      try {
        await splitOrdersMutation.mutateAsync({
          values,
          collectionIds: mutableCollectionIds,
          cascadeOptions,
        });
      } finally {
        toast.dismiss(loadingToastId);
        setPendingCollectionItemIdList((previous) => removePendingIds(previous, ids));
      }
    },
    [filtersActive, splitOrdersMutation],
  );

  const handleEditOrder = useCallback(
    async (values: EditedOrder, cascadeOptions: CascadeOptions): Promise<void> => {
      const editOrderMutationState = editOrderMutationRef.current;
      if (!filtersActiveRef.current) {
        await editOrderMutationState.mutateAsync({ values, cascadeOptions });
        return;
      }

      setPendingOrderIdList((previous) => addPendingIds(previous, [values.orderId]));

      try {
        await editOrderMutationState.mutateAsync({ values, cascadeOptions });
      } finally {
        setPendingOrderIdList((previous) => removePendingIds(previous, [values.orderId]));
      }
    },
    [],
  );

  const handleDeleteOrders = useCallback(async (orderIds: ReadonlySet<string>): Promise<void> => {
    const deleteOrdersMutationState = deleteOrdersMutationRef.current;
    const mutableOrderIds = new Set(orderIds);
    if (!filtersActiveRef.current) {
      await deleteOrdersMutationState.mutateAsync(mutableOrderIds);
      return;
    }

    const ids = [...mutableOrderIds];
    const loadingToastId = toast.loading("Deleting orders...");
    setPendingOrderIdList((previous) => addPendingIds(previous, ids));

    try {
      await deleteOrdersMutationState.mutateAsync(mutableOrderIds);
    } finally {
      toast.dismiss(loadingToastId);
      setPendingOrderIdList((previous) => removePendingIds(previous, ids));
    }
  }, []);

  const handleEditItem = useCallback(async (values: CollectionItemFormValues): Promise<void> => {
    const editItemMutationState = editItemMutationRef.current;
    if (!filtersActiveRef.current) {
      await editItemMutationState.mutateAsync(values);
      return;
    }

    setPendingCollectionItemIdList((previous) => addPendingIds(previous, [values.id]));

    try {
      await editItemMutationState.mutateAsync(values);
    } finally {
      setPendingCollectionItemIdList((previous) => removePendingIds(previous, [values.id]));
    }
  }, []);

  const handleDeleteItem = useCallback(async (orderId: string, itemId: string): Promise<void> => {
    const deleteItemMutationState = deleteItemMutationRef.current;
    if (!filtersActiveRef.current) {
      await deleteItemMutationState.mutateAsync({ orderId, itemId });
      return;
    }

    setPendingCollectionItemIdList((previous) => addPendingIds(previous, [itemId]));

    try {
      await deleteItemMutationState.mutateAsync({ orderId, itemId });
    } finally {
      setPendingCollectionItemIdList((previous) => removePendingIds(previous, [itemId]));
    }
  }, []);

  const handleDeleteItems = useCallback(
    async (collectionIds: ReadonlySet<string>): Promise<void> => {
      const mutableCollectionIds = new Set(collectionIds);

      if (!filtersActive) {
        deleteItemsMutation.mutate(mutableCollectionIds);
        return;
      }

      const ids = [...mutableCollectionIds];
      const loadingToastId = toast.loading("Deleting items...");
      setPendingCollectionItemIdList((previous) => addPendingIds(previous, ids));

      try {
        await deleteItemsMutation.mutateAsync(mutableCollectionIds);
      } finally {
        toast.dismiss(loadingToastId);
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
        moveItemMutation.mutate({
          targetOrderId,
          collectionIds: mutableCollectionIds,
          orderIds: mutableOrderIds,
        });
        return;
      }

      const ids = [...mutableCollectionIds];
      const loadingToastId = toast.loading("Moving items...");
      setPendingCollectionItemIdList((previous) => addPendingIds(previous, ids));

      try {
        await moveItemMutation.mutateAsync({
          targetOrderId,
          collectionIds: mutableCollectionIds,
          orderIds: mutableOrderIds,
        });
      } finally {
        toast.dismiss(loadingToastId);
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
