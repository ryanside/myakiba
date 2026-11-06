import { createContext, useContext } from "react";
import type { CollectionItem } from "@myakiba/contracts/collection/types";
import { withRowPending } from "@/components/data-table/row-pending";

interface CollectionPendingState {
  isItemPending: (id: string) => boolean;
}

export const CollectionPendingContext = createContext<CollectionPendingState | null>(null);

export function useCollectionPending() {
  const pending = useContext(CollectionPendingContext);
  if (!pending) {
    throw new Error(
      "Collection rows must render inside CollectionDataGrid, or provide CollectionPendingContext",
    );
  }
  return pending;
}

const useIsItemPending = () => useCollectionPending().isItemPending;

export const withCollectionPending = withRowPending(
  useIsItemPending,
  (item: CollectionItem) => item.id,
);
