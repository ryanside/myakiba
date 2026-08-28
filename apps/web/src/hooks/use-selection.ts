import { useMemo, useState } from "react";
import type { RowSelectionState } from "@tanstack/react-table";

export function useSelection() {
  const [selection, setSelection] = useState<RowSelectionState>({});

  const selectedIds = useMemo<ReadonlySet<string>>(
    () => new Set(Object.keys(selection).filter((id) => selection[id])),
    [selection],
  );

  return {
    selection,
    setSelection,
    selectedIds,
  } as const;
}
