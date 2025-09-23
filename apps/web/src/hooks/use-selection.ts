import { useState, useMemo } from "react";
import type { RowSelectionState } from "@tanstack/react-table";

export function useSelection() {
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [itemSelection, setItemSelection] = useState<RowSelectionState>({});

  const getSelectedOrderIds = useMemo(
    () => new Set(Object.keys(rowSelection)),
    [rowSelection]
  );

  const getSelectedItemData = useMemo(() => {
    const collectionIds = new Set(
      Object.keys(itemSelection).map((id) => id.split("-")[1])
    );
    const orderIds = new Set(
      Object.keys(itemSelection).map((id) => id.split("-")[0])
    );
    return { collectionIds, orderIds };
  }, [itemSelection]);

  const clearSelections = () => {
    setRowSelection({});
    setItemSelection({});
  };

  return {
    rowSelection,
    setRowSelection,
    itemSelection,
    setItemSelection,
    getSelectedOrderIds,
    getSelectedItemData,
    clearSelections,
  };
}
