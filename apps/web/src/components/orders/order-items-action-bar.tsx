import { Cancel01Icon, Delete01Icon, MoveIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { CascadeOptions, NewOrder } from "@myakiba/contracts/orders/schema";
import type { Currency } from "@myakiba/contracts/shared/types";
import UnifiedItemMoveForm from "@/components/orders/unified-item-move-form";
import {
  ActionBar,
  ActionBarClose,
  ActionBarGroup,
  ActionBarItem,
  ActionBarSelection,
  ActionBarSeparator,
} from "@/components/ui/action-bar";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

export function OrderItemsActionBar({
  selectedItems,
  currency,
  isMovingItems,
  isSplitting,
  isDeletingItems,
  isDeletingOrders,
  onClearSelection,
  onMoveItem,
  onMoveToNew,
  onDeleteItems,
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
  readonly onClearSelection: () => void;
  readonly onMoveItem: (
    targetOrderId: string,
    collectionIds: ReadonlySet<string>,
    orderIds?: ReadonlySet<string>,
  ) => Promise<void>;
  readonly onMoveToNew: (
    values: NewOrder,
    cascadeOptions: CascadeOptions,
    collectionIds: ReadonlySet<string>,
  ) => Promise<void>;
  readonly onDeleteItems: (collectionIds: ReadonlySet<string>) => Promise<void>;
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
        <ConfirmDialog
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
            await onDeleteItems(selectedItems.collectionIds);
            onClearSelection();
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
