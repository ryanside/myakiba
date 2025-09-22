import { createFileRoute } from "@tanstack/react-router";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import OrdersDataGrid from "@/components/orders/order-table";
import { OrderForm } from "@/components/orders/order-form";
import { useFilters } from "@/hooks/use-filters";
import { DebouncedInput } from "@/components/debounced-input";
import type {
  EditedOrder,
  NewOrder,
  Order,
  OrdersQueryResponse,
  CascadeOptions,
  OrderItem,
} from "@/lib/types";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ListRestart, Merge, Split, Trash } from "lucide-react";
import {
  createOptimisticMergeUpdate,
  createOptimisticSplitUpdate,
} from "@/lib/utils";
import {
  editOrder,
  getOrders,
  mergeOrders,
  splitOrders,
} from "@/queries/orders";
import { searchSchema } from "@/lib/validations";
import { useSelection } from "@/hooks/use-selection";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useState } from "react";

export const Route = createFileRoute("/_layout/orders")({
  component: RouteComponent,
  validateSearch: searchSchema,
});

function RouteComponent() {
  const queryClient = useQueryClient();
  const [editDialogState, setEditDialogState] = useState<{
    isOpen: boolean;
    order: Order | null;
  }>({ isOpen: false, order: null });
  const { filters, setFilters, resetFilters } = useFilters(Route.id);
  const {
    rowSelection,
    setRowSelection,
    itemSelection,
    setItemSelection,
    getSelectedOrderIds,
    getSelectedItemData,
    clearSelections,
  } = useSelection();
  const { isPending, isError, data, error } = useQuery({
    queryKey: ["orders", filters],
    queryFn: () => getOrders(filters),
    placeholderData: keepPreviousData,
    staleTime: 1000 * 60 * 5, // 5 minutes
    retry: false,
  });

  const mergeMutation = useMutation({
    mutationFn: ({
      values,
      orderIds,
      cascadeOptions,
    }: {
      values: NewOrder;
      orderIds: string[];
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
        `Successfully merged ${variables.orderIds.length} orders into one!`
      );
    },
    onSettled: (data, error) => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      clearSelections();
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
      // Rollback to previous data on error
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
      // Always refetch after error or success and clear selection
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      clearSelections();
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
          const editedOrder = old.orders.find(
            (order: Order) => order.orderId === values.orderId
          );

          if (!editedOrder) {
            return old;
          }

          const cascadedProperties = Object.fromEntries(
            cascadeOptions.map((option) => [option, values[option]])
          );
          const items = editedOrder.items.map((item: OrderItem) => {
            return {
              ...item,
              ...cascadedProperties,
            };
          });

          return {
            ...old,
            orders: old.orders.map((order: Order) =>
              order.orderId === values.orderId ? { ...values, items } : order
            ),
          };
        }
      );
      return { previousData };
    },
    onError: (error, variables, context) => {
      // Rollback to previous data on error
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
      // Always refetch after error or success and clear selection
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      clearSelections();
    },
  });

  const handleMerge = async (
    values: NewOrder,
    cascadeOptions: CascadeOptions
  ) => {
    const orderIds = getSelectedOrderIds;
    mergeMutation.mutate({ values, orderIds, cascadeOptions });
  };
  const handleSplit = async (
    values: NewOrder,
    cascadeOptions: CascadeOptions
  ) => {
    const { collectionIds, orderIds } = getSelectedItemData;
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
    console.log("values", values);
    // editOrderMutation.mutate({ values, cascadeOptions });
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
      <div className="flex items-center justify-start gap-2">
        <DebouncedInput
          value={filters.search ?? ""}
          onChange={(e) => setFilters({ ...filters, search: e.toString() })}
          placeholder="Search"
          className="max-w-xs"
        />
        <Button onClick={resetFilters} variant="outline">
          <ListRestart className="md:hidden" />
          <span className="hidden md:block">Reset Filters</span>
        </Button>
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="primary" disabled={getSelectedOrderIds.length < 2}>
              <Merge className="md:hidden" />
              <span className="hidden md:block">Merge Orders</span>
            </Button>
          </DialogTrigger>
          <OrderForm
            selectedCount={getSelectedOrderIds.length}
            callbackFn={handleMerge}
            type="merge"
          />
        </Dialog>
        <Dialog>
          <DialogTrigger asChild>
            <Button
              variant="primary"
              disabled={getSelectedItemData.collectionIds.size === 0}
            >
              <Split className="md:hidden" />
              <span className="hidden md:block">Split Items</span>
            </Button>
          </DialogTrigger>
          <OrderForm
            selectedCount={getSelectedItemData.collectionIds.size}
            callbackFn={handleSplit}
            type="split"
          />
        </Dialog>
        <Dialog
          open={editDialogState.isOpen}
          onOpenChange={(isOpen) =>
            setEditDialogState({
              isOpen,
              order: isOpen ? editDialogState.order : null,
            })
          }
        >
          {editDialogState.order && (
            <OrderForm
              type="edit-order"
              orderData={editDialogState.order}
              callbackFn={handleEditOrder}
            />
          )}
        </Dialog>
        <Popover>
          <PopoverTrigger>
            <Trash />
          </PopoverTrigger>
          <PopoverContent>
            <div className="flex flex-col gap-2">
              <p>Are you sure you want to delete the selected orders?</p>
            </div>
          </PopoverContent>
        </Popover>
      </div>
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
        search={filters.search}
        setFilters={setFilters}
        rowSelection={rowSelection}
        setRowSelection={setRowSelection}
        itemSelection={itemSelection}
        setItemSelection={setItemSelection}
        setEditDialogState={setEditDialogState}
      />
    </div>
  );
}
