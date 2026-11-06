import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import type { CellContext } from "@tanstack/react-table";

interface OrdersPendingState {
  isOrderPending: (id: string) => boolean;
  isCollectionItemPending: (id: string) => boolean;
}

export const OrderPendingContext = createContext<OrdersPendingState | null>(null);

export function useOrderPending() {
  const pending = useContext(OrderPendingContext);
  if (!pending) {
    throw new Error("Order rows must be rendered within a grid that provides OrderPendingContext");
  }
  return pending;
}

export function orderPendingCell<TData>(
  isRowPending: (pending: OrdersPendingState, row: TData) => boolean,
) {
  return (render: (context: CellContext<TData, unknown>, isPending: boolean) => ReactNode) =>
    function PendingCell(context: CellContext<TData, unknown>) {
      const pending = useOrderPending();
      return render(context, isRowPending(pending, context.row.original));
    };
}
