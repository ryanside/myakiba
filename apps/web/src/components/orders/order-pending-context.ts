import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import type { CellContext } from "@tanstack/react-table";
import type { Order, OrderItem } from "@myakiba/contracts/orders/types";

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

export function withOrderPending(
  render: (context: CellContext<Order, unknown>, isPending: boolean) => ReactNode,
) {
  return function PendingCell(context: CellContext<Order, unknown>) {
    const { isOrderPending } = useOrderPending();
    return render(context, isOrderPending(context.row.original.orderId));
  };
}

export function withOrderItemPending(
  render: (context: CellContext<OrderItem, unknown>, isPending: boolean) => ReactNode,
) {
  return function PendingCell(context: CellContext<OrderItem, unknown>) {
    const { isCollectionItemPending } = useOrderPending();
    return render(context, isCollectionItemPending(context.row.original.id));
  };
}
