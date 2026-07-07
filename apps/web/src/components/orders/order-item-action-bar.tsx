import type { ReactNode } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon, Delete01Icon, MoveIcon } from "@hugeicons/core-free-icons";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  ActionBar,
  ActionBarSelection,
  ActionBarGroup,
  ActionBarItem,
  ActionBarClose,
  ActionBarSeparator,
} from "@/components/ui/action-bar";
import UnifiedItemMoveForm from "@/components/orders/unified-item-move-form";
import type { SelectedCollectionItems } from "@/hooks/use-selection";
import type { CascadeOptions, NewOrder } from "@myakiba/contracts/orders/schema";
import type { Currency } from "@myakiba/contracts/shared/types";

export function OrderItemActionBar({
  open,
  selectedItemCount,
  selectedItems,
  selectedCollectionIds,
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
  readonly open: boolean;
  readonly selectedItemCount: number;
  readonly selectedItems: SelectedCollectionItems;
  readonly selectedCollectionIds: ReadonlySet<string>;
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
}): ReactNode {
  return (
    <ActionBar
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onClearSelection();
        }
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
              <span>
                <span className="hidden md:inline">
                  {isDeletingItems ? "Deleting " : "Delete "}
                </span>
                Items
              </span>
            </ActionBarItem>
          }
          title={`Delete ${selectedItemCount} ${selectedItemCount === 1 ? "item" : "items"}?`}
          description='Items with "Owned" status will not be deleted. You can delete owned items in the collection tab.'
          onConfirm={async () => {
            await onDeleteItems(selectedCollectionIds);
            onClearSelection();
          }}
        />
      </ActionBarGroup>
      <ActionBarSeparator />
      <ActionBarClose>
        <HugeiconsIcon icon={Cancel01Icon} />
      </ActionBarClose>
    </ActionBar>
  );
}
