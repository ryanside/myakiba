import { createFileRoute } from "@tanstack/react-router";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import OrdersDataGrid from "@/components/orders/order-table";
import { useFilters } from "@/hooks/use-filters";
import type {
  EditedOrder,
  NewOrder,
  OrdersQueryResponse,
  CascadeOptions,
  Filters,
  OrderItem,
} from "@/lib/types";
import { toast } from "sonner";
import {
  createOptimisticMergeUpdate,
  createOptimisticSplitUpdate,
  createOptimisticEditUpdate,
  createOptimisticDeleteUpdate,
  createOptimisticEditItemUpdate,
  createOptimisticDeleteItemUpdate,
  createOptimisticMoveItemUpdate,
} from "@/lib/utils";
import {
  editOrder,
  getOrders,
  mergeOrders,
  splitOrders,
  deleteOrders,
  editOrderItem,
  deleteOrderItem,
  moveItem,
} from "@/queries/orders";
import { searchSchema } from "@/lib/validations";

export const Route = createFileRoute("/_layout/orders")({
  component: RouteComponent,
  validateSearch: searchSchema,
});

function RouteComponent() {
  const queryClient = useQueryClient();
  const { filters, setFilters, resetFilters } = useFilters(Route.id);

  const handleFilterChange = (filters: Filters) => {
    setFilters(filters);
  };

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
    onError: (error, variables, context) => {
      // Rollback to previous data on error
      if (context?.previousData) {
        queryClient.setQueryData(["orders", filters], context.previousData);
      }
      toast.error("Failed to merge orders. Please try again.", {
        description: `Error: ${error.message}`,
      });
    },
    onSuccess: (data, variables) => {
      toast.success(
        `Successfully merged ${variables.orderIds.size} orders into one!`
      );
    },
    onSettled: (data, error) => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
    },
  });

  const splitMutation = useMutation({
    mutationFn: ({
      values,
      orderIds,
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
    onError: (error, variables, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(["orders", filters], context.previousData);
      }
      toast.error("Failed to split orders. Please try again.", {
        description: `Error: ${error.message}`,
      });
    },
    onSuccess: (data, variables) => {
      toast.success(
        `Successfully split ${variables.collectionIds.size} items into one!`
      );
    },
    onSettled: (data, error) => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
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
    onError: (error, variables, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(["orders", filters], context.previousData);
      }
      toast.error("Failed to update order. Please try again.", {
        description: `Error: ${error.message}`,
      });
    },
    onSuccess: (data, variables) => {
      toast.success(`Successfully updated order!`);
    },
    onSettled: (data, error) => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
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
    onError: (error, variables, context) => {
      // Rollback to previous data on error
      if (context?.previousData) {
        queryClient.setQueryData(["orders", filters], context.previousData);
      }
    },
    onSuccess: (data, variables) => {
      toast.success(`Successfully deleted orders!`);
    },
    onSettled: (data, error) => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
    },
  });

  const editItemMutation = useMutation({
    mutationFn: ({
      orderId,
      itemId,
      values,
    }: {
      orderId: string;
      itemId: string;
      values: OrderItem;
    }) => editOrderItem(orderId, itemId, values),
    onMutate: async ({ orderId, itemId, values }) => {
      await queryClient.cancelQueries({ queryKey: ["orders", filters] });
      const previousData = queryClient.getQueryData(["orders", filters]);
      queryClient.setQueryData(
        ["orders", filters],
        (old: OrdersQueryResponse) => {
          return createOptimisticEditItemUpdate(old, orderId, itemId, values);
        }
      );

      return { previousData };
    },
    onError: (error, variables, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(["orders", filters], context.previousData);
      }
      toast.error("Failed to update item. Please try again.", {
        description: `Error: ${error.message}`,
      });
    },
    onSuccess: (data, variables) => {
      toast.success(`Successfully updated order item!`);
    },
    onSettled: (data, error) => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
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
    onError: (error, variables, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(["orders", filters], context.previousData);
      }
    },
    onSuccess: (data, variables) => {
      toast.success(`Successfully deleted order item!`);
    },
    onSettled: (data, error) => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
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
    onError: (error, variables, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(["orders", filters], context.previousData);
      }
      toast.error("Failed to move items. Please try again.", {
        description: `Error: ${error.message}`,
      });
    },
    onSuccess: (data, variables) => {
      toast.success(`Successfully moved items!`);
    },
    onSettled: (data, error) => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
    },
  });

  const handleMerge = async (
    values: NewOrder,
    cascadeOptions: CascadeOptions,
    orderIds: Set<string>
  ) => {
    mergeMutation.mutate({ values, orderIds, cascadeOptions });
  };
  const handleSplit = async (
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
  };
  const handleEditOrder = async (
    values: EditedOrder,
    cascadeOptions: CascadeOptions
  ) => {
    editOrderMutation.mutate({ values, cascadeOptions });
  };

  const handleDeleteOrders = async (orderIds: Set<string>) => {
    deleteOrderMutation.mutate(orderIds);
  };

  const handleEditItem = async (
    orderId: string,
    itemId: string,
    values: OrderItem
  ) => {
    // console.log(values.releaseId);
    editItemMutation.mutate({ orderId, itemId, values });
  };

  const handleDeleteItem = async (orderId: string, itemId: string) => {
    deleteItemMutation.mutate({ orderId, itemId });
  };

  const handleMoveItem = async (
    targetOrderId: string,
    collectionIds: Set<string>,
    orderIds: Set<string>
  ) => {
    moveItemMutation.mutate({ targetOrderId, collectionIds, orderIds });
  };

  if (isPending) {
    return <div>Loading...</div>;
  }

  if (isError) {
    return <div>Error: {error.message}</div>;
  }

  const { orders, totalCount } = data;

  return (
    <div className="w-full space-y-4">
      <OrdersDataGrid
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
        onFilterChange={handleFilterChange}
        onSearchChange={(search) => handleFilterChange({ ...filters, search })}
        onResetFilters={resetFilters}
        onMerge={handleMerge}
        onSplit={handleSplit}
        onEditOrder={handleEditOrder}
        onDeleteOrders={handleDeleteOrders}
        onEditItem={handleEditItem}
        onDeleteItem={handleDeleteItem}
        onMoveItem={handleMoveItem}
      />
    </div>
  );
}
