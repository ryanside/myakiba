import { useState, useMemo } from "react";
import type { RowSelectionState } from "@tanstack/react-table";

export type SelectedCollectionItems = {
  readonly collectionIds: ReadonlySet<string>;
  readonly orderIds: ReadonlySet<string>;
};

export function useSelection() {
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [itemSelection, setItemSelection] = useState<RowSelectionState>({});

  const selectedRowIds = useMemo<ReadonlySet<string>>(
    () => new Set(Object.keys(rowSelection)),
    [rowSelection],
  );

  const selectedNestedItemData = useMemo<SelectedCollectionItems>(() => {
    const collectionIds = new Set(Object.keys(itemSelection).map((id) => id.split("-")[1]));
    const orderIds = new Set(Object.keys(itemSelection).map((id) => id.split("-")[0]));
    return { collectionIds, orderIds };
  }, [itemSelection]);

  const clearSelections = (): void => {
    setRowSelection({});
    setItemSelection({});
  };

  return {
    rowSelection,
    setRowSelection,
    itemSelection,
    setItemSelection,
    selectedRowIds,
    selectedNestedItemData,
    clearSelections,
  } as const;
}
