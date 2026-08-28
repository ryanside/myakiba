import type { ListOrderInput } from "@myakiba/contracts/lists/schema";

export function moveSortableSelection<T extends { readonly id: string }>(
  items: readonly T[],
  activeId: string,
  overId: string,
  selectedIds: ReadonlySet<string>,
): { readonly items: T[]; readonly intent: ListOrderInput } | null {
  if (activeId === overId) return null;

  const activeIndex = items.findIndex((item) => item.id === activeId);
  const overIndex = items.findIndex((item) => item.id === overId);
  if (activeIndex === -1 || overIndex === -1) return null;

  const movedIds = selectedIds.has(activeId)
    ? items.filter((item) => selectedIds.has(item.id)).map((item) => item.id)
    : [activeId];
  const movedIdSet = new Set(movedIds);
  if (movedIdSet.has(overId)) return null;

  const movedItems = items.filter((item) => movedIdSet.has(item.id));
  const remainingItems = items.filter((item) => !movedIdSet.has(item.id));
  const anchorIndex = remainingItems.findIndex((item) => item.id === overId);
  const placement = activeIndex < overIndex ? "after" : "before";
  const insertionIndex = anchorIndex + (placement === "after" ? 1 : 0);

  return {
    items: [
      ...remainingItems.slice(0, insertionIndex),
      ...movedItems,
      ...remainingItems.slice(insertionIndex),
    ],
    intent: { movedIds, anchorId: overId, placement },
  };
}
