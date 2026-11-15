import { Cancel01Icon, Delete01Icon, MoveIcon, PaintBucketIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ItemFill } from "@myakiba/contracts/collection/fill";
import type { CascadeOptions, NewOrder } from "@myakiba/contracts/orders/schema";
import type { Currency } from "@myakiba/contracts/shared/types";
import { SavedFillMenu } from "@/components/fill/saved-fill-menu";
import UnifiedItemMoveForm from "@/components/orders/unified-item-move-form";
import {
  ActionBar,
  ActionBarClose,
  ActionBarGroup,
  ActionBarItem,
  ActionBarSelection,
  ActionBarSeparator,
} from "@/components/ui/action-bar";
import { WriteConfirmDialog } from "@/components/write-confirm-dialog";
import type { Saving } from "@/data/client";

export function OrderItemsActionBar({
  selectedItems,
  currency,
  isMovingItems,
  isSplitting,
  isDeletingItems,
  isDeletingOrders,
  isFillingItems,
  onClearSelection,
  onMoveItem,
  onMoveToNew,
  onDeleteItems,
  onFillItems,
}: {
  readonly selectedItems: {
    readonly collectionIds: ReadonlySet<string>;
    readonly orderIds: ReadonlySet<string>;
  };
  readonly currency: Currency;
  readonly isMovingItems: boolean;
  readonly isSplitting: boolean;
  readonly isDeletingItems: boolean;
  readonly isDeletingOrders: boolean;
  readonly isFillingItems: boolean;
  readonly onClearSelection: () => void;
  readonly onMoveItem: (
    targetOrderId: string,
    collectionIds: ReadonlySet<string>,
    orderIds?: ReadonlySet<string>,
  ) => Saving;
  readonly onMoveToNew: (
    values: NewOrder,
    cascadeOptions: CascadeOptions,
    collectionIds: ReadonlySet<string>,
  ) => Saving;
  readonly onDeleteItems: (collectionIds: ReadonlySet<string>) => Saving;
  readonly onFillItems: (collectionIds: ReadonlySet<string>, fill: ItemFill) => Saving;
}): React.JSX.Element {
  const selectedItemCount = selectedItems.collectionIds.size;

  return (
    <ActionBar
      open={selectedItemCount > 0}
      onOpenChange={(open) => {
        if (!open) onClearSelection();
      }}
    >
      <ActionBarSelection className="border-none">
        {selectedItemCount} {selectedItemCount === 1 ? "item" : "items"} selected
      </ActionBarSelection>
      <ActionBarSeparator />
      <ActionBarGroup>
        <UnifiedItemMoveForm
          renderTrigger={
            <ActionBarItem
              disabled={selectedItemCount === 0 || isMovingItems || isSplitting}
              onSelect={(event) => event.preventDefault()}
              variant="default"
            >
              <HugeiconsIcon icon={MoveIcon} />
              <span className="hidden md:block">
                {isMovingItems || isSplitting ? "Moving..." : "Move Item"}
              </span>
            </ActionBarItem>
          }
          selectedItems={selectedItems}
          onMoveToExisting={onMoveItem}
          onMoveToNew={onMoveToNew}
          clearSelections={onClearSelection}
          currency={currency}
        />
        <SavedFillMenu
          rows={[{ target: "orderItems", ids: selectedItems.collectionIds, onFill: onFillItems }]}
          currency={currency}
          trigger={
            <ActionBarItem
              disabled={selectedItemCount === 0 || isFillingItems}
              onSelect={(event) => event.preventDefault()}
              variant="default"
            >
              <HugeiconsIcon icon={PaintBucketIcon} />
              <span>Fill</span>
            </ActionBarItem>
          }
        />
        <WriteConfirmDialog
          renderTrigger={
            <ActionBarItem
              disabled={selectedItemCount === 0 || isDeletingItems || isDeletingOrders}
              onSelect={(event) => event.preventDefault()}
              variant="destructive"
            >
              <HugeiconsIcon icon={Delete01Icon} />
              <span>{isDeletingItems ? "Deleting Items" : "Delete Items"}</span>
            </ActionBarItem>
          }
          title={`Delete ${selectedItemCount} ${selectedItemCount === 1 ? "item" : "items"}?`}
          description='Items with "Owned" status will not be deleted. You can delete owned items in the collection tab.'
          onConfirm={async () => {
            const saved = await onDeleteItems(selectedItems.collectionIds);
            if (saved.isOk()) onClearSelection();
            return saved;
          }}
        />
      </ActionBarGroup>
      <ActionBarSeparator />
      <ActionBarClose aria-label="Clear selection">
        <HugeiconsIcon icon={Cancel01Icon} />
      </ActionBarClose>
    </ActionBar>
  );
}
