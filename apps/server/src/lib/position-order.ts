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
  const positionedRows = reorderedRows.map((row, index) => ({
    id: row.id,
    position: currentRows[index].position,
  }));

  return {
    kind: "moved",
    updates: positionedRows.filter((row, index) => row.id !== currentRows[index].id),
  } as const;
}
