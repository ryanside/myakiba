import type { PositionOrderInput } from "@myakiba/contracts/shared/position-order";

export type PositionedRow = { readonly id: string; readonly position: number };

export const POSITION_UPDATE_CHUNK_SIZE = 2000;

export function planPositionOrderMove(
  currentRows: readonly PositionedRow[],
  movedIds: readonly string[],
  anchorId: string | null,
  placement: PositionOrderInput["placement"],
) {
  const movedIdSet = new Set(movedIds);
  const movedRows = currentRows.filter((row) => movedIdSet.has(row.id));
  if (movedRows.length !== movedIds.length) return { kind: "not_found" } as const;

  if (anchorId !== null && movedIdSet.has(anchorId)) {
    return { kind: "moved", updates: [] } as const;
  }

  const remainingRows = currentRows.filter((row) => !movedIdSet.has(row.id));
  let insertionIndex: number;
  if (anchorId === null) {
    insertionIndex = placement === "before" ? 0 : remainingRows.length;
  } else {
    const anchorIndex = remainingRows.findIndex((row) => row.id === anchorId);
    if (anchorIndex === -1) return { kind: "not_found" } as const;
    insertionIndex = anchorIndex + (placement === "after" ? 1 : 0);
  }

  const reorderedRows = [
    ...remainingRows.slice(0, insertionIndex),
    ...movedRows,
    ...remainingRows.slice(insertionIndex),
  ];
  const updates = reorderedRows.flatMap((row, index) => {
    const slot = currentRows[index];
    return slot && slot.id !== row.id ? [{ id: row.id, position: slot.position }] : [];
  });

  return { kind: "moved", updates } as const;
}

type RestoreEntry<Restored> =
  | { readonly position: number; readonly restored: Restored }
  | { readonly position: number; readonly row: PositionedRow };

const restoredFirstAtEachPosition = <Restored>(
  left: RestoreEntry<Restored>,
  right: RestoreEntry<Restored>,
) => left.position - right.position || Number("row" in left) - Number("row" in right);

export function planPositionOrderRestore<Restored extends { readonly position: number }>(
  rowsInReadOrder: readonly PositionedRow[],
  restoredRows: readonly Restored[],
) {
  const entries: RestoreEntry<Restored>[] = [
    ...restoredRows.map((restored) => ({ position: restored.position, restored })),
    ...rowsInReadOrder.map((row) => ({ position: row.position, row })),
  ].toSorted(restoredFirstAtEachPosition);

  const placed: { readonly restored: Restored; readonly position: number }[] = [];
  const updates: PositionedRow[] = [];
  let floor = Number.NEGATIVE_INFINITY;
  for (const entry of entries) {
    if ("row" in entry) {
      if (entry.position >= floor) continue;
      updates.push({ id: entry.row.id, position: floor });
      floor += 1;
      continue;
    }
    const position = Math.max(entry.position, floor);
    placed.push({ restored: entry.restored, position });
    floor = position + 1;
  }

  return { placed, updates };
}
