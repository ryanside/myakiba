import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import type { CellContext } from "@tanstack/react-table";
import type { CollectionItem } from "@myakiba/contracts/collection/types";

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

export function withCollectionPending(
  render: (context: CellContext<CollectionItem, unknown>, isPending: boolean) => ReactNode,
) {
  return function PendingCell(context: CellContext<CollectionItem, unknown>) {
    const { isItemPending } = useCollectionPending();
    return render(context, isItemPending(context.row.original.id));
  };
}
