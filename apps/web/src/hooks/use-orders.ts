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
import {
  getOrders,
  getOrderStats,
  getOrderItems,
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
  OrderItem,
  OrderListItem,
  PaginatedResult,
  OrderStats,
  CollectionItemFormValues,
} from "@myakiba/types";

export function ordersQueryOptions(filters: OrderFilters) {
  return queryOptions({
    queryKey: ["orders", filters] as const,
    queryFn: () => getOrders(filters),
    placeholderData: keepPreviousData,
  });
}

export function orderStatsQueryOptions() {
  return queryOptions({
    queryKey: ["orderStats"] as const,
    queryFn: () => getOrderStats(),
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

function computeStatsDelta(orders: readonly OrderListItem[], sign: 1 | -1): OrderStats {
  let totalOrders = 0;
  let totalSpent = 0;
  let activeOrders = 0;
  let unpaidCosts = 0;
  for (const o of orders) {
    const total = Number(o.total);
    totalOrders += sign;
    if (o.status !== "Owned") activeOrders += sign;
    if (o.status !== "Ordered") totalSpent += sign * total;
    if (o.status === "Ordered") unpaidCosts += sign * total;
  }
  return { totalOrders, totalSpent, activeOrders, unpaidCosts };
}

function applyStatsDelta(base: OrderStats, delta: OrderStats): OrderStats {
  return {
    totalOrders: Number(base.totalOrders) + delta.totalOrders,
    totalSpent: Number(base.totalSpent) + delta.totalSpent,
    activeOrders: Number(base.activeOrders) + delta.activeOrders,
    unpaidCosts: Number(base.unpaidCosts) + delta.unpaidCosts,
  };
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

export function useOrdersFilters() {
  return useFilters("/(app)/orders");
}

export function useOrdersQuery() {
  const { filters } = useOrdersFilters();
  const queryOpts = ordersQueryOptions(filters);
  const filtersActive = hasActiveFiltersOrSorting(filters);

  const { data, isPending, isError, status } = useQuery(queryOpts);

  const orders = data ?? [];

  return {
    orders,
    totalCount: orders[0]?.totalCount ?? 0,
    isPending,
    isError,
    status,
    queryOpts,
    filtersActive,
  } as const;
}

export function useOrderStatsQuery() {
  const statsOpts = orderStatsQueryOptions();
  const { data: orderStats, isPending: isStatsPending } = useQuery(statsOpts);

  return {
    orderStats,
    isStatsPending,
    statsOpts,
  } as const;
}

export function useOrdersMutations() {
  const queryClient = useQueryClient();
  const { filters } = useOrdersFilters();
  const ordersOpts = ordersQueryOptions(filters);
  const statsOpts = orderStatsQueryOptions();
  const filtersActive = hasActiveFiltersOrSorting(filters);

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
  filtersActiveRef.current = filtersActive;
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
      await queryClient.cancelQueries({ queryKey: statsOpts.queryKey });
      const previousStats = queryClient.getQueryData<OrderStats>(statsOpts.queryKey);

      if (filtersActive) {
        if (previousStats) {
          const allOrders = queryClient.getQueriesData<OrderListItem[]>({ queryKey: ["orders"] });
          const oldOrder = allOrders
            .flatMap(([, data]) => data ?? [])
            .find((o) => o.orderId === values.orderId);
          if (oldOrder) {
            const removeDelta = computeStatsDelta([oldOrder], -1);
            const newTotal =
              Number(oldOrder.total) +
              (values.shippingFee - Number(oldOrder.shippingFee)) +
              (values.taxes - Number(oldOrder.taxes)) +
              (values.duties - Number(oldOrder.duties)) +
              (values.tariffs - Number(oldOrder.tariffs)) +
              (values.miscFees - Number(oldOrder.miscFees));
            const updatedOrder: OrderListItem = { ...oldOrder, ...values, total: newTotal };
            const addDelta = computeStatsDelta([updatedOrder], 1);
            queryClient.setQueryData<OrderStats>(
              statsOpts.queryKey,
              applyStatsDelta(applyStatsDelta(previousStats, removeDelta), addDelta),
            );
          }
        }
        return { previousStats };
      }

      await queryClient.cancelQueries({ queryKey: ordersOpts.queryKey });
      const previous = queryClient.getQueryData<OrderListItem[]>(ordersOpts.queryKey);
      const oldOrder = previous?.find((o) => o.orderId === values.orderId);

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

      if (previousStats && oldOrder && newTotal !== undefined) {
        const removeDelta = computeStatsDelta([oldOrder], -1);
        const updatedOrder: OrderListItem = { ...oldOrder, ...values, total: newTotal };
        const addDelta = computeStatsDelta([updatedOrder], 1);
        queryClient.setQueryData<OrderStats>(
          statsOpts.queryKey,
          applyStatsDelta(applyStatsDelta(previousStats, removeDelta), addDelta),
        );
      }

      return { previous, previousStats };
    },
    onSuccess: () => {
      toast.success("Order updated");
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData<OrderListItem[]>(ordersOpts.queryKey, context.previous);
      }
      if (context?.previousStats) {
        queryClient.setQueryData<OrderStats>(statsOpts.queryKey, context.previousStats);
      }
      toast.error("Failed to update order. Please try again.");
    },
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["orders"] }),
        queryClient.invalidateQueries({ queryKey: ["orderStats"] }),
      ]);
    },
  });

  const deleteOrdersMutation = useMutation({
    mutationFn: (orderIds: Set<string>) => deleteOrders(orderIds),
    onMutate: async (orderIds) => {
      await queryClient.cancelQueries({ queryKey: statsOpts.queryKey });
      const previousStats = queryClient.getQueryData<OrderStats>(statsOpts.queryKey);

      if (filtersActive) {
        if (previousStats) {
          const allOrders = queryClient.getQueriesData<OrderListItem[]>({ queryKey: ["orders"] });
          const deletedOrders = allOrders.flatMap(([, data]) =>
            (data ?? []).filter((o) => orderIds.has(o.orderId)),
          );
          if (deletedOrders.length > 0) {
            const delta = computeStatsDelta(deletedOrders, -1);
            queryClient.setQueryData<OrderStats>(
              statsOpts.queryKey,
              applyStatsDelta(previousStats, delta),
            );
          }
        }
        return { previousStats };
      }

      await queryClient.cancelQueries({ queryKey: ordersOpts.queryKey });
      const previous = queryClient.getQueryData<OrderListItem[]>(ordersOpts.queryKey);
      const deletedOrders = previous?.filter((o) => orderIds.has(o.orderId)) ?? [];

      queryClient.setQueryData<OrderListItem[]>(ordersOpts.queryKey, (old) => {
        if (!old) return old;
        return old
          .filter((order) => !orderIds.has(order.orderId))
          .map((order) => ({
            ...order,
            totalCount: order.totalCount - orderIds.size,
          }));
      });

      if (previousStats && deletedOrders.length > 0) {
        const delta = computeStatsDelta(deletedOrders, -1);
        queryClient.setQueryData<OrderStats>(
          statsOpts.queryKey,
          applyStatsDelta(previousStats, delta),
        );
      }

      return { previous, previousStats };
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
      if (context?.previousStats) {
        queryClient.setQueryData<OrderStats>(statsOpts.queryKey, context.previousStats);
      }
      toast.error("Failed to delete order(s). Please try again.");
    },
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["orders"] }),
        queryClient.invalidateQueries({ queryKey: ["orderStats"] }),
      ]);
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
    onMutate: async ({ values, orderIds }) => {
      await queryClient.cancelQueries({ queryKey: statsOpts.queryKey });
      const previousStats = queryClient.getQueryData<OrderStats>(statsOpts.queryKey);

      const resolveOldOrders = (): readonly OrderListItem[] => {
        const allOrders = queryClient.getQueriesData<OrderListItem[]>({ queryKey: ["orders"] });
        return allOrders.flatMap(([, data]) => (data ?? []).filter((o) => orderIds.has(o.orderId)));
      };

      if (filtersActive) {
        if (previousStats) {
          const oldOrders = resolveOldOrders();
          if (oldOrders.length > 0) {
            const removeDelta = computeStatsDelta(oldOrders, -1);
            const itemTotal = oldOrders.reduce(
              (sum, o) =>
                sum +
                Number(o.total) -
                Number(o.shippingFee) -
                Number(o.taxes) -
                Number(o.duties) -
                Number(o.tariffs) -
                Number(o.miscFees),
              0,
            );
            const mergedTotal =
              itemTotal +
              values.shippingFee +
              values.taxes +
              values.duties +
              values.tariffs +
              values.miscFees;
            const mergedOrder = { status: values.status, total: mergedTotal } as OrderListItem;
            const addDelta = computeStatsDelta([mergedOrder], 1);
            queryClient.setQueryData<OrderStats>(
              statsOpts.queryKey,
              applyStatsDelta(applyStatsDelta(previousStats, removeDelta), addDelta),
            );
          }
        }
        return { previousStats };
      }

      await queryClient.cancelQueries({ queryKey: ordersOpts.queryKey });
      const previous = queryClient.getQueryData<OrderListItem[]>(ordersOpts.queryKey);
      const oldOrders = previous?.filter((o) => orderIds.has(o.orderId)) ?? [];

      queryClient.setQueryData<OrderListItem[]>(ordersOpts.queryKey, (old) => {
        if (!old) return old;
        return old.filter((order) => !orderIds.has(order.orderId));
      });

      if (previousStats && oldOrders.length > 0) {
        const removeDelta = computeStatsDelta(oldOrders, -1);
        const itemTotal = oldOrders.reduce(
          (sum, o) =>
            sum +
            Number(o.total) -
            Number(o.shippingFee) -
            Number(o.taxes) -
            Number(o.duties) -
            Number(o.tariffs) -
            Number(o.miscFees),
          0,
        );
        const mergedTotal =
          itemTotal +
          values.shippingFee +
          values.taxes +
          values.duties +
          values.tariffs +
          values.miscFees;
        const mergedOrder = { status: values.status, total: mergedTotal } as OrderListItem;
        const addDelta = computeStatsDelta([mergedOrder], 1);
        queryClient.setQueryData<OrderStats>(
          statsOpts.queryKey,
          applyStatsDelta(applyStatsDelta(previousStats, removeDelta), addDelta),
        );
      }

      return { previous, previousStats };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData<OrderListItem[]>(ordersOpts.queryKey, context.previous);
      }
      if (context?.previousStats) {
        queryClient.setQueryData<OrderStats>(statsOpts.queryKey, context.previousStats);
      }
      toast.error("Failed to merge orders. Please try again.");
    },
    onSuccess: (_data, { orderIds }) => {
      toast.success(`Successfully merged ${orderIds.size} orders into one!`);
    },
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["orders"] }),
        queryClient.invalidateQueries({ queryKey: ["orderStats"] }),
      ]);
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
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["orders"] }),
        queryClient.invalidateQueries({ queryKey: ["orderStats"] }),
        queryClient.invalidateQueries({ queryKey: ["orderItems"] }),
      ]);
    },
  });

  const editItemMutation = useMutation({
    mutationFn: (values: CollectionItemFormValues) => updateCollectionItem(values),
    onMutate: async (values) => {
      const itemOrderId = values.orderId;
      if (!itemOrderId) return undefined;

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

      let previousOrders: OrderListItem[] | undefined;

      if (!filtersActive && oldPrice !== undefined && oldPrice !== values.price) {
        await queryClient.cancelQueries({ queryKey: ordersOpts.queryKey });
        previousOrders = queryClient.getQueryData<OrderListItem[]>(ordersOpts.queryKey);
        const priceDelta = values.price - oldPrice;
        const nextOrders = previousOrders?.map((order) =>
          order.orderId === itemOrderId
            ? { ...order, total: Number(order.total) + priceDelta }
            : order,
        );
        queryClient.setQueryData<OrderListItem[]>(ordersOpts.queryKey, nextOrders);
      }

      await queryClient.cancelQueries({ queryKey: statsOpts.queryKey });
      const previousStats = queryClient.getQueryData<OrderStats>(statsOpts.queryKey);

      if (previousStats && oldPrice !== undefined && oldPrice !== values.price) {
        const priceDelta = values.price - oldPrice;
        const allOrders = queryClient.getQueriesData<OrderListItem[]>({ queryKey: ["orders"] });
        const parentOrder = allOrders
          .flatMap(([, data]) => data ?? [])
          .find((o) => o.orderId === itemOrderId);

        if (parentOrder) {
          const delta: OrderStats = {
            totalOrders: 0,
            activeOrders: 0,
            totalSpent: parentOrder.status !== "Ordered" ? priceDelta : 0,
            unpaidCosts: parentOrder.status === "Ordered" ? priceDelta : 0,
          };
          queryClient.setQueryData<OrderStats>(
            statsOpts.queryKey,
            applyStatsDelta(previousStats, delta),
          );
        }
      }

      return { previousOrderItems, previousOrders, previousStats };
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
      if (context?.previousStats) {
        queryClient.setQueryData<OrderStats>(statsOpts.queryKey, context.previousStats);
      }
      toast.error("Failed to update item. Please try again.");
    },
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["orders"] }),
        queryClient.invalidateQueries({ queryKey: ["orderStats"] }),
        queryClient.invalidateQueries({ queryKey: ["orderItems"] }),
      ]);
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

      await queryClient.cancelQueries({ queryKey: statsOpts.queryKey });
      const previousStats = queryClient.getQueryData<OrderStats>(statsOpts.queryKey);

      if (previousStats && removedPrice !== 0) {
        const allOrders = queryClient.getQueriesData<OrderListItem[]>({ queryKey: ["orders"] });
        const parentOrder = allOrders
          .flatMap(([, data]) => data ?? [])
          .find((o) => o.orderId === orderId);

        if (parentOrder) {
          const delta: OrderStats = {
            totalOrders: 0,
            activeOrders: 0,
            totalSpent: parentOrder.status !== "Ordered" ? -removedPrice : 0,
            unpaidCosts: parentOrder.status === "Ordered" ? -removedPrice : 0,
          };
          queryClient.setQueryData<OrderStats>(
            statsOpts.queryKey,
            applyStatsDelta(previousStats, delta),
          );
        }
      }

      return { previousOrderItems, previousOrders, previousStats };
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
      if (context?.previousStats) {
        queryClient.setQueryData<OrderStats>(statsOpts.queryKey, context.previousStats);
      }
      toast.error("Failed to delete item. Please try again.");
    },
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["orders"] }),
        queryClient.invalidateQueries({ queryKey: ["orderStats"] }),
        queryClient.invalidateQueries({ queryKey: ["orderItems"] }),
      ]);
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
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["orders"] }),
        queryClient.invalidateQueries({ queryKey: ["orderStats"] }),
        queryClient.invalidateQueries({ queryKey: ["orderItems"] }),
      ]);
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
      orderIds: Set<string>;
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
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["orders"] }),
        queryClient.invalidateQueries({ queryKey: ["orderStats"] }),
        queryClient.invalidateQueries({ queryKey: ["orderItems"] }),
      ]);
    },
  });
  const editOrderMutationRef = useRef(editOrderMutation);
  editOrderMutationRef.current = editOrderMutation;
  const deleteOrdersMutationRef = useRef(deleteOrdersMutation);
  deleteOrdersMutationRef.current = deleteOrdersMutation;
  const editItemMutationRef = useRef(editItemMutation);
  editItemMutationRef.current = editItemMutation;
  const deleteItemMutationRef = useRef(deleteItemMutation);
  deleteItemMutationRef.current = deleteItemMutation;
  const isOrderPending = useCallback((orderId: string): boolean => {
    return pendingOrderIdsRef.current.has(orderId);
  }, []);
  const isCollectionItemPending = useCallback((collectionId: string): boolean => {
    return pendingCollectionItemIdsRef.current.has(collectionId);
  }, []);

  const handleMerge = useCallback(
    async (
      values: NewOrder,
      cascadeOptions: CascadeOptions,
      orderIds: Set<string>,
    ): Promise<void> => {
      if (!filtersActive) {
        mergeOrdersMutation.mutate({ values, orderIds, cascadeOptions });
        return;
      }

      const ids = Array.from(orderIds);
      const loadingToastId = toast.loading("Merging orders...");
      setPendingOrderIdList((previous) => addPendingIds(previous, ids));

      try {
        await mergeOrdersMutation.mutateAsync({ values, orderIds, cascadeOptions });
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
      collectionIds: Set<string>,
    ): Promise<void> => {
      if (!filtersActive) {
        splitOrdersMutation.mutate({ values, collectionIds, cascadeOptions });
        return;
      }

      const ids = Array.from(collectionIds);
      const loadingToastId = toast.loading("Creating order...");
      setPendingCollectionItemIdList((previous) => addPendingIds(previous, ids));

      try {
        await splitOrdersMutation.mutateAsync({ values, collectionIds, cascadeOptions });
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
        editOrderMutationState.mutate({ values, cascadeOptions });
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

  const handleDeleteOrders = useCallback(async (orderIds: Set<string>): Promise<void> => {
    const deleteOrdersMutationState = deleteOrdersMutationRef.current;
    if (!filtersActiveRef.current) {
      deleteOrdersMutationState.mutate(orderIds);
      return;
    }

    const ids = Array.from(orderIds);
    const loadingToastId = toast.loading("Deleting orders...");
    setPendingOrderIdList((previous) => addPendingIds(previous, ids));

    try {
      await deleteOrdersMutationState.mutateAsync(orderIds);
    } finally {
      toast.dismiss(loadingToastId);
      setPendingOrderIdList((previous) => removePendingIds(previous, ids));
    }
  }, []);

  const handleEditItem = useCallback(async (values: CollectionItemFormValues): Promise<void> => {
    const editItemMutationState = editItemMutationRef.current;
    if (!filtersActiveRef.current) {
      editItemMutationState.mutate(values);
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
      deleteItemMutationState.mutate({ orderId, itemId });
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
    async (collectionIds: Set<string>): Promise<void> => {
      if (!filtersActive) {
        deleteItemsMutation.mutate(collectionIds);
        return;
      }

      const ids = Array.from(collectionIds);
      const loadingToastId = toast.loading("Deleting items...");
      setPendingCollectionItemIdList((previous) => addPendingIds(previous, ids));

      try {
        await deleteItemsMutation.mutateAsync(collectionIds);
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
      collectionIds: Set<string>,
      orderIds: Set<string>,
    ): Promise<void> => {
      if (!filtersActive) {
        moveItemMutation.mutate({ targetOrderId, collectionIds, orderIds });
        return;
      }

      const ids = Array.from(collectionIds);
      const loadingToastId = toast.loading("Moving items...");
      setPendingCollectionItemIdList((previous) => addPendingIds(previous, ids));

      try {
        await moveItemMutation.mutateAsync({ targetOrderId, collectionIds, orderIds });
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
    pendingOrderIds,
    pendingCollectionItemIds,
    isOrderPending,
    isCollectionItemPending,
    isMerging: mergeOrdersMutation.isPending,
    isSplitting: splitOrdersMutation.isPending,
    isDeletingOrders: deleteOrdersMutation.isPending,
    isDeletingItems: deleteItemsMutation.isPending,
    isMovingItems: moveItemMutation.isPending,
  } as const;
}
