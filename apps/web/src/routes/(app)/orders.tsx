import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import OrdersDataGrid from "@/components/orders/orders-data-grid";
import { useFilters } from "@/hooks/use-filters";
import type {
  EditedOrder,
  NewOrder,
  OrderStats,
  CascadeOptions,
  OrderFilters,
} from "@myakiba/types";
import { toast } from "sonner";
import { searchSchema } from "@myakiba/schemas";
import type { CollectionItemFormValues, Order } from "@myakiba/types";
import { OrdersDataGridSkeleton } from "@/components/orders/orders-data-grid-skeleton";
import { useCallback, useMemo } from "react";
import { KPICard } from "@/components/ui/kpi-card";
import { formatCurrencyFromMinorUnits } from "@myakiba/utils";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Grid, TableOfContents } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { DateFormat } from "@myakiba/types";
import { createBaseOrders, createOrdersActions, useOrdersLiveQuery } from "@/tanstack-db/db-orders";

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
        title: "Orders - myakiba",
      },
    ],
  }),
});

function RouteComponent() {
  const { session } = Route.useRouteContext();
  const userCurrency = session?.user.currency;
  const dateFormat = session?.user.dateFormat as DateFormat;
  const queryClient = useQueryClient();
  const { filters, setFilters, resetFilters } = useFilters(Route.id);

  const handleFilterChange = useCallback(
    (filters: OrderFilters) => {
      setFilters(filters);
    },
    [setFilters],
  );

  const baseOrders = useMemo(
    (): ReturnType<typeof createBaseOrders> => createBaseOrders(queryClient),
    [queryClient],
  );

  const ordersActions = useMemo(
    () => createOrdersActions(baseOrders, queryClient),
    [baseOrders, queryClient],
  );

  const { data, isLoading: isPending, isError, status } = useOrdersLiveQuery(baseOrders, filters);

  const handleMerge = useCallback(
    async (values: NewOrder, cascadeOptions: CascadeOptions, orderIds: Set<string>) => {
      const transaction = ordersActions.mergeOrders({
        values,
        orderIds,
        cascadeOptions,
      });
      await transaction.isPersisted.promise.then(
        () => {
          toast.success(`Successfully merged ${orderIds.size} orders into one!`);
        },
        (error: Error) => {
          toast.error("Failed to merge orders. Please try again.", {
            description: `Error: ${error.message}`,
          });
        },
      );
    },
    [ordersActions],
  );
  const handleSplit = useCallback(
    async (
      values: NewOrder,
      cascadeOptions: CascadeOptions,
      collectionIds: Set<string>,
      orderIds: Set<string>,
    ) => {
      const transaction = ordersActions.splitOrders({
        values,
        orderIds,
        collectionIds,
        cascadeOptions,
      });
      await transaction.isPersisted.promise.then(
        () => {
          toast.success(`Successfully moved ${collectionIds.size} items to a new order!`);
        },
        (error: Error) => {
          toast.error("Failed to move items to a new order. Please try again.", {
            description: `Error: ${error.message}`,
          });
        },
      );
    },
    [ordersActions],
  );
  const handleEditOrder = useCallback(
    async (values: EditedOrder, cascadeOptions: CascadeOptions) => {
      const transaction = ordersActions.editOrder({ values, cascadeOptions });
      await transaction.isPersisted.promise.catch((error: Error) => {
        toast.error("Failed to update order. Please try again.", {
          description: `Error: ${error.message}`,
        });
      });
    },
    [ordersActions],
  );

  const handleDeleteOrders = useCallback(
    async (orderIds: Set<string>) => {
      const transaction = ordersActions.deleteOrders({ orderIds });
      await transaction.isPersisted.promise.catch((error: Error) => {
        toast.error("Failed to delete order(s). Please try again.", {
          description: `Error: ${error.message}`,
        });
      });
    },
    [ordersActions],
  );

  const handleEditItem = useCallback(
    async (values: CollectionItemFormValues) => {
      const transaction = ordersActions.editItem({ values });
      await transaction.isPersisted.promise.catch((error: Error) => {
        toast.error("Failed to update item. Please try again.", {
          description: `Error: ${error.message}`,
        });
      });
    },
    [ordersActions],
  );

  const handleDeleteItem = useCallback(
    async (orderId: string, itemId: string) => {
      const transaction = ordersActions.deleteItem({ orderId, itemId });
      await transaction.isPersisted.promise.catch((error: Error) => {
        toast.error("Failed to delete item. Please try again.", {
          description: `Error: ${error.message}`,
        });
      });
    },
    [ordersActions],
  );

  const handleDeleteItems = useCallback(
    async (collectionIds: Set<string>) => {
      const transaction = ordersActions.deleteItems({ collectionIds });
      await transaction.isPersisted.promise.catch((error: Error) => {
        toast.error("Failed to delete items. Please try again.", {
          description: `Error: ${error.message}`,
        });
      });
    },
    [ordersActions],
  );

  const handleMoveItem = useCallback(
    async (targetOrderId: string, collectionIds: Set<string>, orderIds: Set<string>) => {
      const transaction = ordersActions.moveItem({
        targetOrderId,
        collectionIds,
        orderIds,
      });
      await transaction.isPersisted.promise.catch((error: Error) => {
        toast.error("Failed to move items. Please try again.", {
          description: `Error: ${error.message}`,
        });
      });
    },
    [ordersActions],
  );

  const handleSearchChange = useCallback(
    (search: string) => {
      setFilters({ ...filters, search });
    },
    [filters, setFilters],
  );

  const orders = data ?? [];
  const limit = filters.limit ?? 10;
  const offset = filters.offset ?? 0;
  const pagedOrders = useMemo((): Order[] => {
    if (orders.length === 0) return [];
    return orders.slice(offset, offset + limit);
  }, [orders, offset, limit]);
  const totalCount = isPending ? undefined : orders.length;
  const orderStats = useMemo((): OrderStats | undefined => {
    if (isPending) return undefined;

    const totalOrders = orders.length;
    const totalSpent = orders.reduce((sum, order) => sum + Number(order.total), 0);
    const activeOrders = orders.reduce((sum, order) => sum + (order.status !== "Owned" ? 1 : 0), 0);
    const unpaidCosts = orders.reduce(
      (sum, order) => sum + (order.status === "Ordered" ? Number(order.total) : 0),
      0,
    );

    return {
      totalOrders,
      totalSpent,
      activeOrders,
      unpaidCosts,
    };
  }, [orders, isPending]);

  if (isError) {
    return (
      <div className="w-full space-y-8">
        <div className="flex flex-col gap-2">
          <div className="flex flex-row items-start gap-4">
            <h1 className="text-2xl tracking-tight">Orders</h1>
          </div>
          <p className="text-muted-foreground text-sm font-light">Manage and track your orders</p>
        </div>
        <div className="flex flex-col items-center justify-center h-64 gap-y-4">
          <div className="text-lg font-medium text-destructive">Error: {status}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-8">
      <div className="flex flex-col gap-2">
        <div className="flex flex-row items-start gap-4">
          <h1 className="text-2xl tracking-tight">Orders</h1>
        </div>
        <p className="text-muted-foreground text-sm font-light">Manage and track your orders</p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <KPICard title="Total Orders" subtitle="all time" value={orderStats?.totalOrders} />
        <KPICard
          title="Total Spent"
          subtitle="all time, including all fees"
          value={
            orderStats
              ? formatCurrencyFromMinorUnits(orderStats.totalSpent, userCurrency)
              : undefined
          }
        />
        <KPICard
          title="Active Orders"
          subtitle="orders without status 'Owned'"
          value={orderStats?.activeOrders}
        />
        <KPICard
          title="Unpaid Costs"
          subtitle="costs with status 'Ordered'"
          value={
            orderStats
              ? formatCurrencyFromMinorUnits(orderStats.unpaidCosts, userCurrency)
              : undefined
          }
        />
      </div>
      <Tabs defaultValue="table" className="w-[375px] text-sm text-muted-foreground">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="table">
            <TableOfContents /> Table
          </TabsTrigger>
          <Tooltip>
            <TooltipTrigger>
              <TabsTrigger value="grid" disabled>
                <Grid /> Grid
              </TabsTrigger>
            </TooltipTrigger>
            <TooltipContent>
              <p>More views coming soon! Grid, Kanban, Gallery, etc.</p>
            </TooltipContent>
          </Tooltip>
        </TabsList>
      </Tabs>
      {isPending ? (
        <OrdersDataGridSkeleton />
      ) : (
        <OrdersDataGrid
          key="orders-data-grid"
          orders={pagedOrders}
          totalCount={totalCount ?? 0}
          pagination={{
            limit,
            offset,
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
          onDeleteItems={handleDeleteItems}
          onMoveItem={handleMoveItem}
          currency={userCurrency}
          dateFormat={dateFormat}
        />
      )}
    </div>
  );
}
