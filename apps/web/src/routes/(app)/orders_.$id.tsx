import type { ReactNode } from "react";
import { useCallback, useMemo, useState } from "react";
import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { BackLink } from "@/components/ui/back-link";
import { OrderDetailItems } from "@/components/orders/order-detail-items";
import { OrderHero } from "@/components/orders/order-hero";
import { OrderItemsActionBar } from "@/components/orders/order-items-action-bar";
import { OrderPendingContext } from "@/components/orders/order-pending-context";
import { OrderSummary } from "@/components/orders/order-summary";
import { RecordTitle } from "@/components/record-title";
import { preload, preloadPage, useRead } from "@/data/client";
import { orderItemsInput, orders } from "@/data/resources/orders";
import { useOrdersMutations } from "@/hooks/use-orders";
import { withoutOrderItems } from "@/hooks/use-selection";
import { useUserPreferences } from "@/hooks/use-user-preferences";
import { ORDER_LOAD_FAILED } from "@/queries/orders";
import type { Saving } from "@/data/client";
import { shownMessageOf } from "@/data/api";

export const Route = createFileRoute("/(app)/orders_/$id")({
  loader: ({ context: { queryClient }, cause, params }) =>
    preloadPage(cause, () => [
      preload(queryClient, orders.detail, params.id),
      preload(queryClient, orders.items, orderItemsInput(params.id)),
    ]),
  component: RouteComponent,
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
    handleFillItems,
    isOrderPending,
    isCollectionItemPending,
    isDeletingOrders,
    isDeletingItems,
    isMovingItems,
    isSplitting,
    isFillingItems,
  } = useOrdersMutations();

  const pendingContextValue = useMemo(
    () => ({ isOrderPending, isCollectionItemPending }),
    [isOrderPending, isCollectionItemPending],
  );

  const { data: order, isPending, isError, error: orderError } = useRead(orders.detail, id);

  const handleDeleteOrder = useCallback(
    async (orderId: string): Saving => {
      const deleted = await handleDeleteOrders(new Set([orderId]));
      if (deleted.isOk()) await navigate({ to: "/orders" });
      return deleted;
    },
    [handleDeleteOrders, navigate],
  );
  const deleteItems = useCallback(
    async (collectionIds: ReadonlySet<string>): Saving => {
      const deleted = await handleDeleteItems(collectionIds);
      if (deleted.isOk()) {
        setSelectedOrderIdByCollectionId((current) =>
          withoutOrderItems(current, (collectionId) => collectionIds.has(collectionId)),
        );
      }
      return deleted;
    },
    [handleDeleteItems],
  );
  const deleteItem = useCallback(
    async (orderId: string, itemId: string): Saving => {
      const deleted = await handleDeleteItem(orderId, itemId);
      if (deleted.isOk()) {
        setSelectedOrderIdByCollectionId((current) =>
          withoutOrderItems(current, (collectionId) => collectionId === itemId),
        );
      }
      return deleted;
    },
    [handleDeleteItem],
  );

  const selectedItems = {
    collectionIds: new Set(selectedOrderIdByCollectionId.keys()),
    orderIds: new Set(selectedOrderIdByCollectionId.values()),
  };

  if (isError) {
    return (
      <div className="flex flex-col gap-3">
        <RecordTitle kind="Order" />
        <BackLink fallbackTo="/orders" text="Back" font="sans" className="self-start" />
        <div className="animate-data-in text-lg font-medium text-destructive">
          {shownMessageOf(orderError, ORDER_LOAD_FAILED)}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 min-h-full mx-auto max-w-352" aria-busy={isPending}>
      <RecordTitle kind="Order" title={order?.title} />
      <span role="status" className="sr-only">
        {isPending ? "Loading order details" : ""}
      </span>
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

      <OrderPendingContext value={pendingContextValue}>
        <OrderDetailItems
          orderId={id}
          order={order}
          isLoading={isPending}
          selectedOrderIdByCollectionId={selectedOrderIdByCollectionId}
          setSelectedOrderIdByCollectionId={setSelectedOrderIdByCollectionId}
          onEditItem={handleEditItem}
          onDeleteItem={deleteItem}
        />
      </OrderPendingContext>

      {order?.notes ? (
        <section className="animate-data-in flex flex-col gap-1.5 pb-2">
          <h2 className="text-base font-medium text-foreground">Notes</h2>
          <p className="max-w-prose text-sm leading-relaxed text-pretty wrap-break-word whitespace-pre-wrap text-muted-foreground">
            {order.notes}
          </p>
        </section>
      ) : null}

      <OrderItemsActionBar
        selectedItems={selectedItems}
        currency={currency}
        isMovingItems={isMovingItems}
        isSplitting={isSplitting}
        isDeletingItems={isDeletingItems}
        isDeletingOrders={isDeletingOrders}
        isFillingItems={isFillingItems}
        onClearSelection={() => setSelectedOrderIdByCollectionId(new Map())}
        onMoveItem={handleMoveItem}
        onMoveToNew={handleSplit}
        onDeleteItems={deleteItems}
        onFillItems={handleFillItems}
      />
    </div>
  );
}
