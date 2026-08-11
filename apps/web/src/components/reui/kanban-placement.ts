interface CrossColumnPlacement {
  dragY: number | null;
  overTop: number;
  overHeight: number;
  overIndex: number;
  isOverColumn: boolean;
}

interface CrossColumnInsertion extends CrossColumnPlacement {
  overItemCount: number;
}

interface DragPosition {
  activationY: number | null;
  deltaY: number;
  activeTop: number | null;
  activeHeight: number;
}

export function getDragPositionY({
  activationY,
  deltaY,
  activeTop,
  activeHeight,
}: DragPosition): number | null {
  if (activationY !== null) return activationY + deltaY;
  return activeTop === null ? null : activeTop + activeHeight / 2;
}

export function getCrossColumnInsertionIndex({
  overIndex,
  overItemCount,
  isOverColumn,
  dragY,
  overTop,
  overHeight,
}: CrossColumnInsertion): number {
  if (isOverColumn || overIndex < 0) return overItemCount;
  if (dragY === null) return overIndex;

  const overCenter = overTop + overHeight / 2;
  return dragY > overCenter ? overIndex + 1 : overIndex;
}
