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

/**
 * Where restored rows go back: each takes the position it held, ahead of a current row that has
 * since taken that position, and current rows after it move up only as far as they must. Current
 * rows come in their read order, position then id.
 */
export function planPositionOrderRestore<Restored extends { readonly position: number }>(
  currentRows: readonly PositionedRow[],
  restoredRows: readonly Restored[],
) {
  const entries = [
    ...restoredRows.map((restored) => ({ position: restored.position, restored })),
    ...currentRows.map((row) => ({ position: row.position, row })),
  ].toSorted(
    (left, right) =>
      left.position - right.position || Number("row" in left) - Number("row" in right),
  );

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
