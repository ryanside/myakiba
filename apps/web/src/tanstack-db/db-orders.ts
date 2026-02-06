import { QueryClient } from "@tanstack/react-query";
import {
  createCollection,
  createOptimisticAction,
  gte,
  ilike,
  inArray,
  lower,
  lte,
  useLiveQuery,
} from "@tanstack/react-db";
import { queryCollectionOptions } from "@tanstack/query-db-collection";
import type {
  CascadeOptions,
  CollectionItemFormValues,
  EditedOrder,
  NewOrder,
  Order,
  OrderFilters,
  OrderStatus,
  ShippingMethod,
} from "@myakiba/types";
import {
  deleteOrderItem,
  deleteOrderItems,
  deleteOrders,
  editOrder,
  getOrders,
  mergeOrders,
  moveItem,
  splitOrders,
} from "@/queries/orders";
import { updateCollectionItem } from "@/queries/collection";

const BASE_ORDERS_LIMIT: number = 10000;

export const createBaseOrders = (queryClient: QueryClient) => {
  const baseQueryKey: readonly [string] = ["orders"];
  const baseQueryFilters: OrderFilters = {
    limit: BASE_ORDERS_LIMIT,
    offset: 0,
    sort: "createdAt",
    order: "desc",
  };

  return createCollection(
    queryCollectionOptions({
      queryKey: baseQueryKey,
      queryFn: async (): Promise<Order[]> => {
        const response = await getOrders(baseQueryFilters);
        return response;
      },
      queryClient,
      getKey: (order) => order.orderId,
    }),
  );
};

type BaseOrders = ReturnType<typeof createBaseOrders>;

type CascadeOption = CascadeOptions[number];
type CascadeOptionsInput = ReadonlyArray<CascadeOption>;
type OrderIdsInput = ReadonlySet<string>;
type CollectionIdsInput = ReadonlySet<string>;

type CascadeUpdatePayload = Partial<{
  shop: string;
  shippingMethod: ShippingMethod;
  orderDate: string | null;
  paymentDate: string | null;
  shippingDate: string | null;
  collectionDate: string | null;
  status: OrderStatus;
}>;

type MergeOrdersParams = {
  readonly values: Readonly<NewOrder>;
  readonly orderIds: OrderIdsInput;
  readonly cascadeOptions: CascadeOptionsInput;
};

type SplitOrdersParams = {
  readonly values: Readonly<NewOrder>;
  readonly orderIds: OrderIdsInput;
  readonly collectionIds: CollectionIdsInput;
  readonly cascadeOptions: CascadeOptionsInput;
};

type EditOrderParams = {
  readonly values: Readonly<EditedOrder>;
  readonly cascadeOptions: CascadeOptionsInput;
};

type DeleteOrdersParams = {
  readonly orderIds: OrderIdsInput;
};

type EditItemParams = {
  readonly values: Readonly<CollectionItemFormValues>;
};

type DeleteItemParams = {
  readonly orderId: string;
  readonly itemId: string;
};

type DeleteItemsParams = {
  readonly collectionIds: CollectionIdsInput;
};

type MoveItemParams = {
  readonly targetOrderId: string;
  readonly collectionIds: CollectionIdsInput;
  readonly orderIds: OrderIdsInput;
};

type OptimisticAction<TVariables> = ReturnType<typeof createOptimisticAction<TVariables>>;

export type OrdersActions = {
  readonly mergeOrders: OptimisticAction<MergeOrdersParams>;
  readonly splitOrders: OptimisticAction<SplitOrdersParams>;
  readonly editOrder: OptimisticAction<EditOrderParams>;
  readonly deleteOrders: OptimisticAction<DeleteOrdersParams>;
  readonly editItem: OptimisticAction<EditItemParams>;
  readonly deleteItem: OptimisticAction<DeleteItemParams>;
  readonly deleteItems: OptimisticAction<DeleteItemsParams>;
  readonly moveItem: OptimisticAction<MoveItemParams>;
};

const createTemporaryOrderId = (): string => `temp-${crypto.randomUUID()}`;

const getCascadeProperties = (
  values: Readonly<NewOrder>,
  cascadeOptions: CascadeOptionsInput,
): CascadeUpdatePayload => {
  const properties: CascadeUpdatePayload = {};
  cascadeOptions.forEach((option) => {
    switch (option) {
      case "shop": {
        if (values.shop) {
          properties.shop = values.shop;
        }
        break;
      }
      case "shippingMethod": {
        properties.shippingMethod = values.shippingMethod;
        break;
      }
      case "orderDate": {
        properties.orderDate = values.orderDate;
        break;
      }
      case "paymentDate": {
        properties.paymentDate = values.paymentDate;
        break;
      }
      case "shippingDate": {
        properties.shippingDate = values.shippingDate;
        break;
      }
      case "collectionDate": {
        properties.collectionDate = values.collectionDate;
        break;
      }
      case "status": {
        properties.status = values.status;
        break;
      }
    }
  });
  return properties;
};

const calculateItemsTotal = (items: ReadonlyArray<Order["items"][number]>): number => {
  return items.reduce((sum, item) => sum + item.price, 0);
};

const calculateAdditionalFees = (
  fees: Readonly<Pick<NewOrder, "shippingFee" | "taxes" | "duties" | "tariffs" | "miscFees">>,
): number => {
  return fees.shippingFee + fees.taxes + fees.duties + fees.tariffs + fees.miscFees;
};

const calculateOrderTotal = (
  items: ReadonlyArray<Order["items"][number]>,
  fees: Readonly<Pick<Order, "shippingFee" | "taxes" | "duties" | "tariffs" | "miscFees">>,
): number => {
  return calculateItemsTotal(items) + calculateAdditionalFees(fees);
};

const mergeOrderItem = (
  item: Order["items"][number],
  updates: Partial<CollectionItemFormValues>,
): Order["items"][number] => {
  const updatedOrderId = updates.orderId ?? item.orderId;
  if (!updatedOrderId) {
    throw new Error("Order item requires an orderId");
  }

  return {
    ...item,
    ...updates,
    orderId: updatedOrderId,
    shop: updates.shop ?? item.shop,
    shippingMethod: updates.shippingMethod ?? item.shippingMethod,
    orderDate: updates.orderDate ?? item.orderDate,
    paymentDate: updates.paymentDate ?? item.paymentDate,
    shippingDate: updates.shippingDate ?? item.shippingDate,
    collectionDate: updates.collectionDate ?? item.collectionDate,
    status: updates.status ?? item.status,
    price: updates.price ?? item.price,
    count: updates.count ?? item.count,
    score: updates.score ?? item.score,
    notes: updates.notes ?? item.notes,
  };
};

const getOrdersByIds = (baseOrders: BaseOrders, orderIds: OrderIdsInput): readonly Order[] => {
  const orders: Order[] = [];
  orderIds.forEach((orderId) => {
    const order = baseOrders.get(orderId);
    if (order) {
      orders.push(order);
    }
  });
  return orders;
};

const toMutableNewOrder = (values: Readonly<NewOrder>): NewOrder => ({
  title: values.title,
  shop: values.shop,
  releaseDate: values.releaseDate,
  shippingMethod: values.shippingMethod,
  orderDate: values.orderDate,
  paymentDate: values.paymentDate,
  shippingDate: values.shippingDate,
  collectionDate: values.collectionDate,
  status: values.status,
  shippingFee: values.shippingFee,
  taxes: values.taxes,
  duties: values.duties,
  tariffs: values.tariffs,
  miscFees: values.miscFees,
  notes: values.notes,
});

const toMutableCascadeOptions = (options: CascadeOptionsInput): CascadeOptions => {
  return [...options];
};

const toMutableOrderIds = (orderIds: OrderIdsInput): Set<string> => {
  return new Set(orderIds);
};

const toMutableCollectionIds = (collectionIds: CollectionIdsInput): Set<string> => {
  return new Set(collectionIds);
};

export const createOrdersActions = (
  baseOrders: BaseOrders,
  queryClient: QueryClient,
): OrdersActions => {
  const mergeOrdersAction = createOptimisticAction<MergeOrdersParams>({
    onMutate: ({ values, orderIds, cascadeOptions }: MergeOrdersParams): void => {
      const ordersToMerge = getOrdersByIds(baseOrders, orderIds);
      if (ordersToMerge.length === 0) return;

      const tempOrderId = createTemporaryOrderId();
      const cascadeProperties = getCascadeProperties(values, cascadeOptions);
      const combinedItems = ordersToMerge.flatMap((order) =>
        order.items.map((item) =>
          mergeOrderItem(item, { ...cascadeProperties, orderId: tempOrderId }),
        ),
      );
      const ordersTotal = ordersToMerge.reduce((sum, order) => sum + order.total, 0);
      const combinedTotal = ordersTotal + calculateAdditionalFees(values);
      const timestamp = new Date().toISOString();
      const mergedOrder: Order = {
        orderId: tempOrderId,
        title: values.title,
        shop: values.shop,
        releaseDate: values.releaseDate,
        shippingMethod: values.shippingMethod,
        orderDate: values.orderDate,
        paymentDate: values.paymentDate,
        shippingDate: values.shippingDate,
        collectionDate: values.collectionDate,
        status: values.status,
        total: combinedTotal,
        shippingFee: values.shippingFee,
        taxes: values.taxes,
        duties: values.duties,
        tariffs: values.tariffs,
        miscFees: values.miscFees,
        notes: values.notes,
        itemCount: combinedItems.length,
        createdAt: timestamp,
        updatedAt: timestamp,
        items: combinedItems,
      };

      const deleteIds = Array.from(orderIds);
      if (deleteIds.length > 0) {
        baseOrders.delete(deleteIds);
      }
      baseOrders.insert(mergedOrder);
    },
    mutationFn: async ({ values, orderIds, cascadeOptions }: MergeOrdersParams): Promise<void> => {
      await mergeOrders(
        toMutableNewOrder(values),
        toMutableOrderIds(orderIds),
        toMutableCascadeOptions(cascadeOptions),
      );
      await baseOrders.utils.refetch();
      await queryClient.invalidateQueries();
    },
  });

  const splitOrdersAction = createOptimisticAction<SplitOrdersParams>({
    onMutate: ({ values, orderIds, collectionIds, cascadeOptions }: SplitOrdersParams): void => {
      const ordersToSplit = getOrdersByIds(baseOrders, orderIds);
      if (ordersToSplit.length === 0) return;

      const tempOrderId = createTemporaryOrderId();
      const cascadeProperties = getCascadeProperties(values, cascadeOptions);
      const splitItems = ordersToSplit.flatMap((order) =>
        order.items
          .filter((item) => collectionIds.has(item.id))
          .map((item) => mergeOrderItem(item, { ...cascadeProperties, orderId: tempOrderId })),
      );

      if (splitItems.length === 0) return;

      const additionalFees = calculateAdditionalFees(values);
      const splitItemsTotal = calculateItemsTotal(splitItems);
      const combinedTotal = splitItemsTotal + additionalFees;
      const timestamp = new Date().toISOString();

      const newOrder: Order = {
        orderId: tempOrderId,
        title: values.title,
        shop: values.shop,
        releaseDate: values.releaseDate,
        shippingMethod: values.shippingMethod,
        orderDate: values.orderDate,
        paymentDate: values.paymentDate,
        shippingDate: values.shippingDate,
        collectionDate: values.collectionDate,
        status: values.status,
        total: combinedTotal,
        shippingFee: values.shippingFee,
        taxes: values.taxes,
        duties: values.duties,
        tariffs: values.tariffs,
        miscFees: values.miscFees,
        notes: values.notes,
        itemCount: splitItems.length,
        createdAt: timestamp,
        updatedAt: timestamp,
        items: splitItems,
      };

      ordersToSplit.forEach((order) => {
        const remainingItems = order.items.filter((item) => !collectionIds.has(item.id));
        const removedItems = order.items.filter((item) => collectionIds.has(item.id));
        if (removedItems.length === 0) return;
        const removedItemsTotal = calculateItemsTotal(removedItems);
        const updatedTotal = order.total - removedItemsTotal;
        baseOrders.update(order.orderId, (draft) => {
          draft.items = remainingItems;
          draft.itemCount = remainingItems.length;
          draft.total = updatedTotal;
        });
      });

      baseOrders.insert(newOrder);
    },
    mutationFn: async ({
      values,
      collectionIds,
      cascadeOptions,
    }: SplitOrdersParams): Promise<void> => {
      await splitOrders(
        toMutableNewOrder(values),
        toMutableCollectionIds(collectionIds),
        toMutableCascadeOptions(cascadeOptions),
      );
      await baseOrders.utils.refetch();
      await queryClient.invalidateQueries();
    },
  });

  const editOrderAction = createOptimisticAction<EditOrderParams>({
    onMutate: ({ values, cascadeOptions }: EditOrderParams): void => {
      if (!values.orderId) return;
      const order = baseOrders.get(values.orderId);
      if (!order) return;

      const cascadeProperties = getCascadeProperties(values, cascadeOptions);
      const updatedItems = order.items.map((item) => mergeOrderItem(item, cascadeProperties));
      const updatedTotal = calculateOrderTotal(updatedItems, values);

      baseOrders.update(values.orderId, (draft) => {
        draft.title = values.title;
        draft.shop = values.shop;
        draft.releaseDate = values.releaseDate;
        draft.shippingMethod = values.shippingMethod;
        draft.orderDate = values.orderDate;
        draft.paymentDate = values.paymentDate;
        draft.shippingDate = values.shippingDate;
        draft.collectionDate = values.collectionDate;
        draft.status = values.status;
        draft.shippingFee = values.shippingFee;
        draft.taxes = values.taxes;
        draft.duties = values.duties;
        draft.tariffs = values.tariffs;
        draft.miscFees = values.miscFees;
        draft.notes = values.notes;
        draft.items = updatedItems;
        draft.total = updatedTotal;
        draft.itemCount = updatedItems.length;
      });
    },
    mutationFn: async ({ values, cascadeOptions }: EditOrderParams): Promise<void> => {
      await editOrder(values, toMutableCascadeOptions(cascadeOptions));
      await baseOrders.utils.refetch();
      await queryClient.invalidateQueries();
    },
  });

  const deleteOrdersAction = createOptimisticAction<DeleteOrdersParams>({
    onMutate: ({ orderIds }: DeleteOrdersParams): void => {
      const deleteIds = Array.from(orderIds);
      if (deleteIds.length === 0) return;
      baseOrders.delete(deleteIds);
    },
    mutationFn: async ({ orderIds }: DeleteOrdersParams): Promise<void> => {
      await deleteOrders(toMutableOrderIds(orderIds));
      await baseOrders.utils.refetch();
      await queryClient.invalidateQueries();
    },
  });

  const editItemAction = createOptimisticAction<EditItemParams>({
    onMutate: ({ values }: EditItemParams): void => {
      if (!values.orderId) return;
      const order = baseOrders.get(values.orderId);
      if (!order) return;
      const item = order.items.find((entry) => entry.id === values.id);
      if (!item) return;

      const updatedItem = mergeOrderItem(item, values);
      const updatedItems = order.items.map((entry) =>
        entry.id === values.id ? updatedItem : entry,
      );
      const updatedTotal = calculateOrderTotal(updatedItems, order);

      baseOrders.update(values.orderId, (draft) => {
        draft.items = updatedItems;
        draft.total = updatedTotal;
        draft.itemCount = updatedItems.length;
      });
    },
    mutationFn: async ({ values }: EditItemParams): Promise<void> => {
      await updateCollectionItem(values);
      await baseOrders.utils.refetch();
      await queryClient.invalidateQueries();
    },
  });

  const deleteItemAction = createOptimisticAction<DeleteItemParams>({
    onMutate: ({ orderId, itemId }: DeleteItemParams): void => {
      const order = baseOrders.get(orderId);
      if (!order) return;
      const remainingItems = order.items.filter((item) => item.id !== itemId);
      if (remainingItems.length === order.items.length) return;

      const updatedTotal = calculateOrderTotal(remainingItems, order);
      baseOrders.update(orderId, (draft) => {
        draft.items = remainingItems;
        draft.total = updatedTotal;
        draft.itemCount = remainingItems.length;
      });
    },
    mutationFn: async ({ orderId, itemId }: DeleteItemParams): Promise<void> => {
      await deleteOrderItem(orderId, itemId);
      await baseOrders.utils.refetch();
      await queryClient.invalidateQueries();
    },
  });

  const deleteItemsAction = createOptimisticAction<DeleteItemsParams>({
    onMutate: ({ collectionIds }: DeleteItemsParams): void => {
      baseOrders.forEach((order) => {
        const remainingItems = order.items.filter((item) => !collectionIds.has(item.id));
        if (remainingItems.length === order.items.length) return;

        const updatedTotal = calculateOrderTotal(remainingItems, order);
        baseOrders.update(order.orderId, (draft) => {
          draft.items = remainingItems;
          draft.total = updatedTotal;
          draft.itemCount = remainingItems.length;
        });
      });
    },
    mutationFn: async ({ collectionIds }: DeleteItemsParams): Promise<void> => {
      await deleteOrderItems(toMutableCollectionIds(collectionIds));
      await baseOrders.utils.refetch();
      await queryClient.invalidateQueries();
    },
  });

  const moveItemAction = createOptimisticAction<MoveItemParams>({
    onMutate: ({ targetOrderId, collectionIds, orderIds }: MoveItemParams): void => {
      const targetOrder = baseOrders.get(targetOrderId);
      if (!targetOrder) return;
      const sourceOrderIds = Array.from(orderIds).filter((orderId) => orderId !== targetOrderId);
      if (sourceOrderIds.length === 0) return;

      const sourceOrders = sourceOrderIds
        .map((orderId) => baseOrders.get(orderId))
        .filter((order): order is Order => Boolean(order));
      if (sourceOrders.length === 0) return;

      const itemsToMove = sourceOrders.flatMap((order) =>
        order.items
          .filter((item) => collectionIds.has(item.id))
          .map((item) => mergeOrderItem(item, { orderId: targetOrderId })),
      );
      if (itemsToMove.length === 0) return;

      const updatedTargetItems = [...targetOrder.items, ...itemsToMove];
      const updatedTargetTotal = calculateOrderTotal(updatedTargetItems, targetOrder);
      baseOrders.update(targetOrderId, (draft) => {
        draft.items = updatedTargetItems;
        draft.total = updatedTargetTotal;
        draft.itemCount = updatedTargetItems.length;
      });

      sourceOrders.forEach((order) => {
        const remainingItems = order.items.filter((item) => !collectionIds.has(item.id));
        if (remainingItems.length === order.items.length) return;
        const updatedTotal = calculateOrderTotal(remainingItems, order);
        baseOrders.update(order.orderId, (draft) => {
          draft.items = remainingItems;
          draft.total = updatedTotal;
          draft.itemCount = remainingItems.length;
        });
      });
    },
    mutationFn: async ({
      targetOrderId,
      collectionIds,
      orderIds,
    }: MoveItemParams): Promise<void> => {
      await moveItem(
        targetOrderId,
        toMutableCollectionIds(collectionIds),
        toMutableOrderIds(orderIds),
      );
      await baseOrders.utils.refetch();
      await queryClient.invalidateQueries();
    },
  });

  const actions: OrdersActions = {
    mergeOrders: mergeOrdersAction,
    splitOrders: splitOrdersAction,
    editOrder: editOrderAction,
    deleteOrders: deleteOrdersAction,
    editItem: editItemAction,
    deleteItem: deleteItemAction,
    deleteItems: deleteItemsAction,
    moveItem: moveItemAction,
  };

  return actions;
};

export const useOrdersLiveQuery = (baseOrders: BaseOrders, filters: OrderFilters) => {
  const searchTerm = filters.search?.trim() ?? "";
  const shopKey = filters.shop?.join("|") ?? "";
  const shipMethodKey = filters.shipMethod?.join("|") ?? "";
  const statusKey = filters.status?.join("|") ?? "";
  const sortField = filters.sort ?? "createdAt";
  const sortOrder: "asc" | "desc" = filters.order ?? "desc";

  return useLiveQuery(
    (q) => {
      let query = q.from({ order: baseOrders });

      if (searchTerm) {
        query = query.where(({ order }) => ilike(order.title, `%${searchTerm}%`));
      }
      if (filters.shop && filters.shop.length > 0) {
        query = query.where(({ order }) => inArray(order.shop, filters.shop));
      }
      if (filters.releaseDateStart) {
        query = query.where(({ order }) => gte(order.releaseDate, filters.releaseDateStart));
      }
      if (filters.releaseDateEnd) {
        query = query.where(({ order }) => lte(order.releaseDate, filters.releaseDateEnd));
      }
      if (filters.shipMethod && filters.shipMethod.length > 0) {
        query = query.where(({ order }) => inArray(order.shippingMethod, filters.shipMethod));
      }
      if (filters.orderDateStart) {
        query = query.where(({ order }) => gte(order.orderDate, filters.orderDateStart));
      }
      if (filters.orderDateEnd) {
        query = query.where(({ order }) => lte(order.orderDate, filters.orderDateEnd));
      }
      if (filters.payDateStart) {
        query = query.where(({ order }) => gte(order.paymentDate, filters.payDateStart));
      }
      if (filters.payDateEnd) {
        query = query.where(({ order }) => lte(order.paymentDate, filters.payDateEnd));
      }
      if (filters.shipDateStart) {
        query = query.where(({ order }) => gte(order.shippingDate, filters.shipDateStart));
      }
      if (filters.shipDateEnd) {
        query = query.where(({ order }) => lte(order.shippingDate, filters.shipDateEnd));
      }
      if (filters.colDateStart) {
        query = query.where(({ order }) => gte(order.collectionDate, filters.colDateStart));
      }
      if (filters.colDateEnd) {
        query = query.where(({ order }) => lte(order.collectionDate, filters.colDateEnd));
      }
      if (filters.status && filters.status.length > 0) {
        query = query.where(({ order }) => inArray(order.status, filters.status));
      }
      if (filters.totalMin !== undefined) {
        query = query.where(({ order }) => gte(order.total, filters.totalMin));
      }
      if (filters.totalMax !== undefined) {
        query = query.where(({ order }) => lte(order.total, filters.totalMax));
      }
      if (filters.shippingFeeMin !== undefined) {
        query = query.where(({ order }) => gte(order.shippingFee, filters.shippingFeeMin));
      }
      if (filters.shippingFeeMax !== undefined) {
        query = query.where(({ order }) => lte(order.shippingFee, filters.shippingFeeMax));
      }
      if (filters.taxesMin !== undefined) {
        query = query.where(({ order }) => gte(order.taxes, filters.taxesMin));
      }
      if (filters.taxesMax !== undefined) {
        query = query.where(({ order }) => lte(order.taxes, filters.taxesMax));
      }
      if (filters.dutiesMin !== undefined) {
        query = query.where(({ order }) => gte(order.duties, filters.dutiesMin));
      }
      if (filters.dutiesMax !== undefined) {
        query = query.where(({ order }) => lte(order.duties, filters.dutiesMax));
      }
      if (filters.tariffsMin !== undefined) {
        query = query.where(({ order }) => gte(order.tariffs, filters.tariffsMin));
      }
      if (filters.tariffsMax !== undefined) {
        query = query.where(({ order }) => lte(order.tariffs, filters.tariffsMax));
      }
      if (filters.miscFeesMin !== undefined) {
        query = query.where(({ order }) => gte(order.miscFees, filters.miscFeesMin));
      }
      if (filters.miscFeesMax !== undefined) {
        query = query.where(({ order }) => lte(order.miscFees, filters.miscFeesMax));
      }

      switch (sortField) {
        case "title":
          query = query.orderBy(({ order }) => order.title, sortOrder);
          break;
        case "shop":
          query = query.orderBy(({ order }) => lower(order.shop), sortOrder);
          break;
        case "orderDate":
          query = query.orderBy(({ order }) => order.orderDate, sortOrder);
          break;
        case "paymentDate":
          query = query.orderBy(({ order }) => order.paymentDate, sortOrder);
          break;
        case "shippingDate":
          query = query.orderBy(({ order }) => order.shippingDate, sortOrder);
          break;
        case "collectionDate":
          query = query.orderBy(({ order }) => order.collectionDate, sortOrder);
          break;
        case "releaseDate":
          query = query.orderBy(({ order }) => order.releaseDate, sortOrder);
          break;
        case "shippingMethod":
          query = query.orderBy(({ order }) => order.shippingMethod, sortOrder);
          break;
        case "total":
          query = query.orderBy(({ order }) => order.total, sortOrder);
          break;
        case "shippingFee":
          query = query.orderBy(({ order }) => order.shippingFee, sortOrder);
          break;
        case "taxes":
          query = query.orderBy(({ order }) => order.taxes, sortOrder);
          break;
        case "duties":
          query = query.orderBy(({ order }) => order.duties, sortOrder);
          break;
        case "tariffs":
          query = query.orderBy(({ order }) => order.tariffs, sortOrder);
          break;
        case "miscFees":
          query = query.orderBy(({ order }) => order.miscFees, sortOrder);
          break;
        case "itemCount":
          query = query.orderBy(({ order }) => order.itemCount, sortOrder);
          break;
        case "status":
          query = query.orderBy(({ order }) => order.status, sortOrder);
          break;
        case "createdAt":
        default:
          query = query.orderBy(({ order }) => order.createdAt, sortOrder);
          break;
      }

      return query.orderBy(({ order }) => order.createdAt, sortOrder);
    },
    [
      baseOrders,
      searchTerm,
      shopKey,
      filters.releaseDateStart,
      filters.releaseDateEnd,
      shipMethodKey,
      filters.orderDateStart,
      filters.orderDateEnd,
      filters.payDateStart,
      filters.payDateEnd,
      filters.shipDateStart,
      filters.shipDateEnd,
      filters.colDateStart,
      filters.colDateEnd,
      statusKey,
      filters.totalMin,
      filters.totalMax,
      filters.shippingFeeMin,
      filters.shippingFeeMax,
      filters.taxesMin,
      filters.taxesMax,
      filters.dutiesMin,
      filters.dutiesMax,
      filters.tariffsMin,
      filters.tariffsMax,
      filters.miscFeesMin,
      filters.miscFeesMax,
      sortField,
      sortOrder,
    ],
  );
};
