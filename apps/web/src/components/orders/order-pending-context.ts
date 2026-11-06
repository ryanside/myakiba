import { createContext, useContext } from "react";
import type { Order, OrderItem } from "@myakiba/contracts/orders/types";
import { withRowPending } from "@/components/data-table/row-pending";

interface OrdersPendingState {
  isOrderPending: (id: string) => boolean;
  isCollectionItemPending: (id: string) => boolean;
}

export const OrderPendingContext = createContext<OrdersPendingState | null>(null);

export function useOrderPending() {
  const pending = useContext(OrderPendingContext);
  if (!pending) {
    throw new Error(
      "Order rows must render inside OrdersDataGrid or the order detail page, or provide OrderPendingContext",
    );
  }
  return pending;
}

const useIsOrderPending = () => useOrderPending().isOrderPending;
const useIsOrderItemPending = () => useOrderPending().isCollectionItemPending;

export const withOrderPending = withRowPending(useIsOrderPending, (order: Order) => order.orderId);
export const withOrderItemPending = withRowPending(
  useIsOrderItemPending,
  (item: OrderItem) => item.id,
);
