import { useCallback, useMemo, useState } from "react";
import type { RowSelectionState } from "@tanstack/react-table";

export function useSelection() {
  const [selection, setSelection] = useState<RowSelectionState>({});

  const selectedIds = useMemo<ReadonlySet<string>>(
    () => new Set(Object.keys(selection).filter((id) => selection[id])),
    [selection],
  );

  const deselect = useCallback((ids: Iterable<string>) => {
    const removed = new Set(ids);
    setSelection((current) =>
      Object.fromEntries(Object.entries(current).filter(([id]) => !removed.has(id))),
    );
  }, []);

  return {
    selection,
    setSelection,
    selectedIds,
    deselect,
  } as const;
}

export function withoutOrderItems(
  selection: ReadonlyMap<string, string>,
  removed: (collectionId: string, orderId: string) => boolean,
): Map<string, string> {
  return new Map(
    [...selection].filter(([collectionId, orderId]) => !removed(collectionId, orderId)),
  );
}
