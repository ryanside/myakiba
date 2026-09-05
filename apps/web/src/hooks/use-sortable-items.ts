import { KeyboardSensor, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import type {
  Announcements,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
  ScreenReaderInstructions,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import type { PositionOrderInput } from "@myakiba/contracts/shared/position-order";
import { useCallback, useMemo, useRef, useState } from "react";
import { toast } from "@/components/ui/toast";

interface SortableRecord {
  readonly id: string;
  readonly title: string;
}

export function useSortableItems<T extends SortableRecord>({
  items,
  totalCount,
  selectedIds,
  selectedLabel,
  fallbackLabel,
  screenReaderInstruction,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
  onMove,
  onClearSelection,
}: {
  readonly items: readonly T[];
  readonly totalCount: number;
  readonly selectedIds: ReadonlySet<string>;
  readonly selectedLabel: string;
  readonly fallbackLabel: string;
  readonly screenReaderInstruction: string;
  readonly hasNextPage: boolean;
  readonly isFetchingNextPage: boolean;
  readonly onLoadMore: () => Promise<{ readonly isFetchNextPageError: boolean }>;
  readonly onMove: (intent: PositionOrderInput) => Promise<void>;
  readonly onClearSelection: () => void;
}) {
  const [entranceAnimationActive, setEntranceAnimationActive] = useState(true);
  const [dndEpoch, setDndEpoch] = useState(0);
  const [activeId, setActiveId] = useState<string>();
  const [overId, setOverId] = useState<string>();
  const keyboardDrag = useRef(false);
  const loadingNextPage = useRef(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const itemIds = useMemo(() => items.map((item) => item.id), [items]);
  const titleById = useMemo(() => new Map(items.map((item) => [item.id, item.title])), [items]);
  const draggingSelection = activeId ? selectedIds.has(activeId) : false;
  const getDragLabel = useCallback(
    (id: string | number) => {
      const itemId = String(id);
      if (selectedIds.size > 1 && selectedIds.has(itemId)) {
        return `${selectedIds.size} ${selectedLabel}`;
      }
      return titleById.get(itemId) ?? fallbackLabel;
    },
    [fallbackLabel, selectedIds, selectedLabel, titleById],
  );

  const activeIndex = activeId ? itemIds.indexOf(activeId) : -1;
  const overIndex = overId ? itemIds.indexOf(overId) : -1;
  const dropIndicator = useMemo(
    () =>
      activeIndex >= 0 &&
      overIndex >= 0 &&
      activeId !== overId &&
      !(draggingSelection && overId && selectedIds.has(overId))
        ? {
            id: overId,
            placement: activeIndex < overIndex ? ("after" as const) : ("before" as const),
          }
        : null,
    [activeId, activeIndex, draggingSelection, overId, overIndex, selectedIds],
  );

  const announcements = useMemo<Announcements>(
    () => ({
      onDragStart: ({ active }) => `Picked up ${getDragLabel(active.id)}.`,
      onDragOver: ({ active, over }) =>
        over
          ? `${getDragLabel(active.id)} is over position ${items.findIndex((item) => item.id === String(over.id)) + 1} of ${totalCount}.`
          : `${getDragLabel(active.id)} is no longer over a drop target.`,
      onDragEnd: ({ active, over }) =>
        over
          ? `Dropped ${getDragLabel(active.id)} at position ${items.findIndex((item) => item.id === String(over.id)) + 1} of ${totalCount}.`
          : `Movement cancelled for ${getDragLabel(active.id)}.`,
      onDragCancel: ({ active }) => `Movement cancelled for ${getDragLabel(active.id)}.`,
    }),
    [getDragLabel, items, totalCount],
  );
  const screenReaderInstructions = useMemo<ScreenReaderInstructions>(
    () => ({ draggable: screenReaderInstruction }),
    [screenReaderInstruction],
  );

  const handleDragStart = useCallback(({ active, activatorEvent }: DragStartEvent): void => {
    setEntranceAnimationActive(false);
    keyboardDrag.current = activatorEvent instanceof KeyboardEvent;
    setActiveId(String(active.id));
  }, []);

  const handleDragOver = useCallback(
    async ({ active, over }: DragOverEvent): Promise<void> => {
      setActiveId(String(active.id));
      setOverId(over ? String(over.id) : undefined);
      if (
        !(keyboardDrag.current && over && hasNextPage) ||
        isFetchingNextPage ||
        loadingNextPage.current
      ) {
        return;
      }
      const hoveredIndex = itemIds.indexOf(String(over.id));
      if (hoveredIndex < itemIds.length - 2) return;

      loadingNextPage.current = true;
      const result = await onLoadMore();
      loadingNextPage.current = false;
      if (!(keyboardDrag.current && result.isFetchNextPageError)) return;

      setDndEpoch((epoch) => epoch + 1);
      keyboardDrag.current = false;
      setActiveId(undefined);
      setOverId(undefined);
      const toastId = toast.add({
        type: "error",
        title: "Could not load more. Your saved order has not changed.",
        actionProps: {
          children: "Retry",
          onClick() {
            toast.close(toastId);
            void onLoadMore();
          },
        },
      });
    },
    [hasNextPage, isFetchingNextPage, itemIds, onLoadMore],
  );

  const handleDragEnd = useCallback(
    async ({ active, over }: DragEndEvent): Promise<void> => {
      keyboardDrag.current = false;
      setActiveId(undefined);
      setOverId(undefined);
      if (!over) return;

      const draggedId = String(active.id);
      const targetId = String(over.id);
      if (draggedId === targetId) return;

      const draggedIndex = items.findIndex((item) => item.id === draggedId);
      const targetIndex = items.findIndex((item) => item.id === targetId);
      if (draggedIndex === -1 || targetIndex === -1) return;

      const movedIds = selectedIds.has(draggedId)
        ? items.filter((item) => selectedIds.has(item.id)).map((item) => item.id)
        : [draggedId];
      if (movedIds.includes(targetId)) return;

      onClearSelection();
      try {
        await onMove({
          movedIds,
          anchorId: targetId,
          placement: draggedIndex < targetIndex ? "after" : "before",
        });
      } catch {
        // The mutation restores the saved order and reports the error.
      }
    },
    [items, onClearSelection, onMove, selectedIds],
  );

  const handleDragCancel = useCallback((): void => {
    keyboardDrag.current = false;
    setActiveId(undefined);
    setOverId(undefined);
  }, []);
  const finishEntranceAnimation = useCallback(() => setEntranceAnimationActive(false), []);

  return {
    itemIds,
    entranceAnimationActive,
    finishEntranceAnimation,
    dndEpoch,
    activeId,
    dropIndicator,
    overlayLabel: activeId ? getDragLabel(activeId) : null,
    sensors,
    announcements,
    screenReaderInstructions,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
    handleDragCancel,
  } as const;
}
