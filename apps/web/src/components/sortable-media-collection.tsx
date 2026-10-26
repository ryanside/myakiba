import { DndContext, DragOverlay } from "@dnd-kit/core";
import { snapCenterToCursor } from "@dnd-kit/modifiers";
import {
  SortableContext,
  rectSortingStrategy,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { DragDropVerticalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ComponentProps, ReactNode } from "react";
import { ItemControl } from "@/components/ui/item-controls";
import type { SortableItems } from "@/hooks/use-sortable-items";

export function SortableMediaCollection({
  sortable,
  vertical,
  children,
}: {
  readonly sortable: SortableItems;
  readonly vertical: boolean;
  readonly children: ReactNode;
}): React.JSX.Element {
  return (
    <DndContext key={sortable.dndEpoch} {...sortable.dndContextProps}>
      <SortableContext
        items={sortable.itemIds}
        strategy={vertical ? verticalListSortingStrategy : rectSortingStrategy}
      >
        {children}
      </SortableContext>
      <DragOverlay
        className="pointer-events-none flex items-center justify-center"
        dropAnimation={null}
        modifiers={[snapCenterToCursor]}
        zIndex={50}
      >
        {sortable.overlayLabel === null ? null : (
          <div
            aria-hidden="true"
            className="rounded-lg bg-popover px-2.5 py-1.5 text-sm font-medium text-popover-foreground shadow-md ring-1 ring-foreground/10"
          >
            {sortable.overlayLabel}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

export function DragHandle({
  label,
  ...props
}: ComponentProps<typeof ItemControl> & { readonly label: string }): React.JSX.Element {
  return (
    <ItemControl
      type="button"
      className="touch-none cursor-grab active:cursor-grabbing"
      {...props}
      aria-label={label}
      title="Drag to reorder"
    >
      <HugeiconsIcon icon={DragDropVerticalIcon} aria-hidden="true" />
    </ItemControl>
  );
}
