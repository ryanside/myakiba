import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import type { CellContext } from "@tanstack/react-table";
import type { CollectionItem } from "@myakiba/contracts/collection/types";

interface CollectionPendingState {
  isPending: (id: string) => boolean;
}

export const CollectionPendingContext = createContext<CollectionPendingState | null>(null);

export function useCollectionPending() {
  const pending = useContext(CollectionPendingContext);
  if (!pending) {
    throw new Error("Collection cells must be rendered within CollectionPendingContext");
  }
  return pending;
}

export function withCollectionPending(
  render: (context: CellContext<CollectionItem, unknown>, isPending: boolean) => ReactNode,
) {
  return function PendingCell(context: CellContext<CollectionItem, unknown>) {
    const { isPending } = useCollectionPending();
    return render(context, isPending(context.row.original.id));
  };
}
