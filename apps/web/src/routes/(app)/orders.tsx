import { createFileRoute } from "@tanstack/react-router";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import OrdersDataGrid from "@/components/orders/orders-data-grid";
import { useFilters } from "@/hooks/use-filters";
import type {
  EditedOrder,
  NewOrder,
  OrdersQueryResponse,
  CascadeOptions,
  OrderFilters,
} from "@/lib/orders/types";
import { toast } from "sonner";
import {
  createOptimisticMergeUpdate,
  createOptimisticSplitUpdate,
  createOptimisticEditUpdate,
  createOptimisticDeleteUpdate,
  createOptimisticEditItemUpdate,
  createOptimisticDeleteItemUpdate,
  createOptimisticMoveItemUpdate,
} from "@/lib/orders/utils";
import {
  editOrder,
  getOrders,
  mergeOrders,
  splitOrders,
  deleteOrders,
  deleteOrderItem,
  moveItem,
} from "@/queries/orders";
import { searchSchema } from "@/lib/validations";
import type { CollectionItemFormValues } from "@/lib/collection/types";
import { updateCollectionItem } from "@/queries/collection";
import { authClient } from "@/lib/auth-client";
import { OrdersGridSkeleton } from "@/components/skeletons/orders-grid-skeleton";
import { useCallback } from "react";
import { KPICard } from "@/components/ui/kpi-card";
import { formatCurrency } from "@/lib/utils";

export const Route = createFileRoute("/(app)/orders")({
  component: RouteComponent,
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      {
        name: "description",
        content: "your orders",
      },
      {
        title: "Orders — myakiba",
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
  const { data: session } = authClient.useSession();
  const userCurrency = session?.user.currency || "USD";
  const queryClient = useQueryClient();
  const { filters, setFilters, resetFilters } = useFilters(Route.id);

  const handleFilterChange = useCallback(
    (filters: OrderFilters) => {
      setFilters(filters);
    },
    [setFilters]
  );

  const { isPending, isError, data, error } = useQuery({
    queryKey: ["orders", filters],
    queryFn: () => getOrders(filters),
    placeholderData: keepPreviousData,
    staleTime: 1000 * 60 * 5,
    retry: false,
  });

  const mergeMutation = useMutation({
    mutationFn: ({
      values,
      orderIds,
      cascadeOptions,
    }: {
      values: NewOrder;
      orderIds: Set<string>;
      cascadeOptions: CascadeOptions;
    }) => mergeOrders(values, orderIds, cascadeOptions),
    onMutate: async ({ values, orderIds, cascadeOptions }) => {
      await queryClient.cancelQueries({ queryKey: ["orders", filters] });
      const previousData = queryClient.getQueryData(["orders", filters]);
      queryClient.setQueryData(
        ["orders", filters],
        (old: OrdersQueryResponse) => {
          return createOptimisticMergeUpdate(
            old,
            values,
            orderIds,
            filters,
            cascadeOptions
          );
        }
      );
      // Return context for rollback
      return { previousData, orderIds };
    },
    onError: (error, _, context) => {
      // Rollback to previous data on error
      if (context?.previousData) {
        queryClient.setQueryData(["orders", filters], context.previousData);
      }
      toast.error("Failed to merge orders. Please try again.", {
        description: `Error: ${error.message}`,
      });
    },
    onSuccess: (_, variables) => {
      toast.success(
        `Successfully merged ${variables.orderIds.size} orders into one!`
      );
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

  const splitMutation = useMutation({
    mutationFn: ({
      values,
      orderIds, // eslint-disable-line @typescript-eslint/no-unused-vars
      collectionIds,
      cascadeOptions,
    }: {
      values: NewOrder;
      orderIds: Set<string>;
      collectionIds: Set<string>;
      cascadeOptions: CascadeOptions;
    }) => splitOrders(values, collectionIds, cascadeOptions),
    onMutate: async ({ values, orderIds, collectionIds, cascadeOptions }) => {
      await queryClient.cancelQueries({ queryKey: ["orders", filters] });
      const previousData = queryClient.getQueryData(["orders", filters]);
      queryClient.setQueryData(
        ["orders", filters],
        (old: OrdersQueryResponse) => {
          return createOptimisticSplitUpdate(
            old,
            values,
            orderIds,
            collectionIds,
            filters,
            cascadeOptions
          );
        }
      );
      return { previousData, orderIds, collectionIds };
    },
    onError: (error, _, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(["orders", filters], context.previousData);
      }
      toast.error("Failed to move items to a new order. Please try again.", {
        description: `Error: ${error.message}`,
      });
    },
    onSuccess: (_, variables) => {
      toast.success(
        `Successfully moved ${variables.collectionIds.size} items to a new order!`
      );
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

  const editOrderMutation = useMutation({
    mutationFn: ({
      values,
      cascadeOptions,
    }: {
      values: EditedOrder;
      cascadeOptions: CascadeOptions;
    }) => editOrder(values, cascadeOptions),
    onMutate: async ({ values, cascadeOptions }) => {
      await queryClient.cancelQueries({ queryKey: ["orders", filters] });
      const previousData = queryClient.getQueryData(["orders", filters]);
      queryClient.setQueryData(
        ["orders", filters],
        (old: OrdersQueryResponse) => {
          return createOptimisticEditUpdate(old, values, cascadeOptions);
        }
      );
      return { previousData };
    },
    onError: (error, _, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(["orders", filters], context.previousData);
      }
      toast.error("Failed to update order. Please try again.", {
        description: `Error: ${error.message}`,
      });
    },
    onSuccess: () => {
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

  const deleteOrderMutation = useMutation({
    mutationFn: (orderIds: Set<string>) => deleteOrders(orderIds),
    onMutate: async (orderIds) => {
      await queryClient.cancelQueries({ queryKey: ["orders", filters] });
      const previousData = queryClient.getQueryData(["orders", filters]);
      queryClient.setQueryData(
        ["orders", filters],
        (old: OrdersQueryResponse) => {
          return createOptimisticDeleteUpdate(old, orderIds);
        }
      );
      return { previousData };
    },
    onError: (error, _, context) => {
      // Rollback to previous data on error
      if (context?.previousData) {
        queryClient.setQueryData(["orders", filters], context.previousData);
      }
      toast.error("Failed to delete order(s). Please try again.", {
        description: `Error: ${error.message}`,
      });
    },
    onSuccess: () => {
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

  const editItemMutation = useMutation({
    mutationFn: ({ values }: { values: CollectionItemFormValues }) =>
      updateCollectionItem(values),
    onMutate: async ({ values }) => {
      await queryClient.cancelQueries({ queryKey: ["orders", filters] });
      const previousData = queryClient.getQueryData(["orders", filters]);
      queryClient.setQueryData(
        ["orders", filters],
        (old: OrdersQueryResponse) => {
          return createOptimisticEditItemUpdate(old, values);
        }
      );

      return { previousData };
    },
    onError: (error, _, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(["orders", filters], context.previousData);
      }
      toast.error("Failed to update item. Please try again.", {
        description: `Error: ${error.message}`,
      });
    },
    onSuccess: () => {
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

  const deleteItemMutation = useMutation({
    mutationFn: ({ orderId, itemId }: { orderId: string; itemId: string }) =>
      deleteOrderItem(orderId, itemId),
    onMutate: async ({ orderId, itemId }) => {
      await queryClient.cancelQueries({ queryKey: ["orders", filters] });
      const previousData = queryClient.getQueryData(["orders", filters]);
      queryClient.setQueryData(
        ["orders", filters],
        (old: OrdersQueryResponse) => {
          return createOptimisticDeleteItemUpdate(old, orderId, itemId);
        }
      );
      return { previousData };
    },
    onError: (error, _, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(["orders", filters], context.previousData);
      }
      toast.error("Failed to delete item. Please try again.", {
        description: `Error: ${error.message}`,
      });
    },
    onSuccess: () => {
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
    onMutate: async ({ targetOrderId, collectionIds, orderIds }) => {
      await queryClient.cancelQueries({ queryKey: ["orders", filters] });
      const previousData = queryClient.getQueryData(["orders", filters]);
      queryClient.setQueryData(
        ["orders", filters],
        (old: OrdersQueryResponse) => {
          return createOptimisticMoveItemUpdate(
            old,
            targetOrderId,
            collectionIds,
            orderIds,
            filters
          );
        }
      );
      return { previousData };
    },
    onError: (error, _, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(["orders", filters], context.previousData);
      }
      toast.error("Failed to move items. Please try again.", {
        description: `Error: ${error.message}`,
      });
    },
    onSuccess: () => {
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

  const handleMerge = useCallback(
    async (
      values: NewOrder,
      cascadeOptions: CascadeOptions,
      orderIds: Set<string>
    ) => {
      mergeMutation.mutate({ values, orderIds, cascadeOptions });
    },
    [mergeMutation]
  );
  const handleSplit = useCallback(
    async (
      values: NewOrder,
      cascadeOptions: CascadeOptions,
      collectionIds: Set<string>,
      orderIds: Set<string>
    ) => {
      splitMutation.mutate({
        values,
        orderIds,
        collectionIds,
        cascadeOptions,
      });
    },
    [splitMutation]
  );
  const handleEditOrder = useCallback(
    async (values: EditedOrder, cascadeOptions: CascadeOptions) => {
      editOrderMutation.mutate({ values, cascadeOptions });
    },
    [editOrderMutation]
  );

  const handleDeleteOrders = useCallback(
    async (orderIds: Set<string>) => {
      deleteOrderMutation.mutate(orderIds);
    },
    [deleteOrderMutation]
  );

  const handleEditItem = useCallback(
    async (values: CollectionItemFormValues) => {
      // console.log(values.releaseId);
      editItemMutation.mutate({ values });
    },
    [editItemMutation]
  );

  const handleDeleteItem = useCallback(
    async (orderId: string, itemId: string) => {
      deleteItemMutation.mutate({ orderId, itemId });
    },
    [deleteItemMutation]
  );

  const handleMoveItem = useCallback(
    async (
      targetOrderId: string,
      collectionIds: Set<string>,
      orderIds: Set<string>
    ) => {
      moveItemMutation.mutate({ targetOrderId, collectionIds, orderIds });
    },
    [moveItemMutation]
  );

  const handleSearchChange = useCallback(
    (search: string) => {
      setFilters({ ...filters, search });
    },
    [filters, setFilters]
  );

  if (isPending) {
    return <OrdersGridSkeleton />;
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-y-4">
        <div className="text-lg font-medium text-destructive">
          Error: {error.message}
        </div>
      </div>
    );
  }

  const { orders, orderStats, totalCount } = data;

  return (
    <div className="w-full space-y-8">
      <div className="flex flex-col gap-2">
        <div className="flex flex-row items-start gap-4">
          <h1 className="text-2xl tracking-tight">Orders</h1>
        </div>
        <p className="text-muted-foreground text-sm font-light">
          Manage and track your orders
        </p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <KPICard
          title="Total Orders"
          subtitle="all time"
          value={orderStats.totalOrders}
        />
        <KPICard
          title="Total Spent"
          subtitle="all time, including all fees"
          value={formatCurrency(orderStats.totalSpent, userCurrency)}
        />
        <KPICard
          title="Active Orders"
          subtitle="orders not yet collected"
          value={orderStats.activeOrders}
        />
        <KPICard
          title="Unpaid Costs"
          subtitle="unpaid order costs"
          value={formatCurrency(orderStats.unpaidCosts, userCurrency)}
        />
      </div>
      <OrdersDataGrid
        key="orders-data-grid"
        orders={orders}
        totalCount={totalCount}
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
        onSearchChange={handleSearchChange}
        onResetFilters={resetFilters}
        onMerge={handleMerge}
        onSplit={handleSplit}
        onEditOrder={handleEditOrder}
        onDeleteOrders={handleDeleteOrders}
        onEditItem={handleEditItem}
        onDeleteItem={handleDeleteItem}
        onMoveItem={handleMoveItem}
        currency={userCurrency}
      />
    </div>
  );
}
