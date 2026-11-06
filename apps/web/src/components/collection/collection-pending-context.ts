import { createContext, useContext } from "react";

interface CollectionPendingState {
  isCollectionPending: (id: string) => boolean;
  isCollectionOrderPending: (id: string) => boolean;
}

export const CollectionPendingContext = createContext<CollectionPendingState | null>(null);

export function useCollectionPending() {
  const pending = useContext(CollectionPendingContext);
  if (!pending) {
    throw new Error("Collection cells must be rendered within CollectionPendingContext");
  }
  return pending;
}
