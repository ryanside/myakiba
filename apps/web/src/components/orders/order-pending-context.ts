import { createContext, useContext } from "react";

interface OrdersPendingState {
  isOrderPending: (id: string) => boolean;
  isCollectionItemPending: (id: string) => boolean;
}

export const OrderPendingContext = createContext<OrdersPendingState | null>(null);

export function useOrderPending() {
  const pending = useContext(OrderPendingContext);
  if (!pending) {
    throw new Error("Order cells must be rendered within OrderPendingContext");
  }
  return pending;
}
