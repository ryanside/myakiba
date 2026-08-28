import type { ReactNode } from "react";
import { useCallback, useState } from "react";
import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BackLink } from "@/components/ui/back-link";
import { OrderDetailItems } from "@/components/orders/order-detail-items";
import { OrderHero } from "@/components/orders/order-hero";
import { OrderItemsActionBar } from "@/components/orders/order-items-action-bar";
import { OrderSummary } from "@/components/orders/order-summary";
import { Skeleton } from "@/components/ui/skeleton";
import { useOrdersMutations } from "@/hooks/use-orders";
import { useUserPreferences } from "@/hooks/use-user-preferences";
import { formatTimestampForDisplay } from "@/lib/date-display";
import { getOrder } from "@/queries/orders";

export const Route = createFileRoute("/(app)/orders_/$id")({
  component: RouteComponent,
  head: ({ params }) => ({
    meta: [
      { name: "description", content: `order ${params.id} details` },
      { title: `Order ${params.id} - myakiba` },
    ],
  }),
});

function RouteComponent(): ReactNode {
  const { currency, locale, dateFormat } = useUserPreferences();
  const { id } = useParams({ from: "/(app)/orders_/$id" });
  const navigate = useNavigate();
  const [selectedOrderIdByCollectionId, setSelectedOrderIdByCollectionId] = useState(
    new Map<string, string>(),
  );

  const {
    handleEditOrder,
    handleDeleteOrders,
    handleEditItem,
    handleDeleteItem,
    handleDeleteItems,
    handleMoveItem,
    handleSplit,
    isCollectionItemPending,
    isDeletingOrders,
    isDeletingItems,
    isMovingItems,
    isSplitting,
  } = useOrdersMutations();

  const {
    data: order,
    isPending,
    isError,
    error: orderError,
  } = useQuery({
    queryKey: ["order", id],
    queryFn: () => getOrder(id),
    staleTime: 1000 * 60 * 5,
    retry: false,
  });

  const handleDeleteOrder = useCallback(
    async (orderId: string): Promise<void> => {
      await handleDeleteOrders(new Set([orderId]));
      await navigate({ to: "/orders" });
    },
    [handleDeleteOrders, navigate],
  );

  const selectedItems = {
    collectionIds: new Set(selectedOrderIdByCollectionId.keys()),
    orderIds: new Set(selectedOrderIdByCollectionId.values()),
  };

  if (isError) {
    return (
      <div className="flex flex-col gap-3">
        <BackLink fallbackTo="/orders" text="Back" font="sans" className="self-start" />
        <div className="animate-data-in text-lg font-medium text-destructive">
          Error: {orderError.message}
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col gap-8 min-h-full mx-auto max-w-352"
      aria-busy={isPending}
      aria-live="polite"
    >
      {isPending ? <span className="sr-only">Loading order details</span> : null}
      <BackLink fallbackTo="/orders" text="Back" font="sans" className="self-start" />

      <OrderHero
        order={order}
        isLoading={isPending}
        currency={currency}
        dateFormat={dateFormat}
        onEditOrder={handleEditOrder}
        onDeleteOrder={handleDeleteOrder}
      />

      <OrderSummary
        order={order}
        isLoading={isPending}
        currency={currency}
        locale={locale}
        dateFormat={dateFormat}
      />

      {order?.notes ? (
        <section className="animate-data-in flex flex-col gap-3">
          <h2 className="text-xs font-medium text-muted-foreground">Notes</h2>
          <div className="rounded-xl bg-card ring-1 ring-foreground/10 px-5 py-4">
            <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed max-w-prose">
              {order.notes}
            </p>
          </div>
        </section>
      ) : null}

      <OrderDetailItems
        orderId={id}
        order={order}
        isLoading={isPending}
        selectedOrderIdByCollectionId={selectedOrderIdByCollectionId}
        setSelectedOrderIdByCollectionId={setSelectedOrderIdByCollectionId}
        onEditItem={handleEditItem}
        onDeleteItem={handleDeleteItem}
        isCollectionItemPending={isCollectionItemPending}
      />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground/60 pb-2">
        {isPending ? (
          <>
            <span className="flex items-center gap-1">
              Created <Skeleton className="h-3 w-24" />
            </span>
            <span className="flex items-center gap-1">
              Updated <Skeleton className="h-3 w-24" />
            </span>
          </>
        ) : null}
        {!isPending && order ? (
          <>
            <span>
              Created{" "}
              <span className="animate-data-in inline-block">
                {formatTimestampForDisplay(order.createdAt, dateFormat)}
              </span>
            </span>
            <span>
              Updated{" "}
              <span className="animate-data-in inline-block">
                {formatTimestampForDisplay(order.updatedAt, dateFormat)}
              </span>
            </span>
          </>
        ) : null}
      </div>

      <OrderItemsActionBar
        selectedItems={selectedItems}
        currency={currency}
        isMovingItems={isMovingItems}
        isSplitting={isSplitting}
        isDeletingItems={isDeletingItems}
        isDeletingOrders={isDeletingOrders}
        onClearSelection={() => setSelectedOrderIdByCollectionId(new Map())}
        onMoveItem={handleMoveItem}
        onMoveToNew={handleSplit}
        onDeleteItems={handleDeleteItems}
      />
    </div>
  );
}
