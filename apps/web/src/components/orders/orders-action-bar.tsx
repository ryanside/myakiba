import {
  Cancel01Icon,
  Delete01Icon,
  FolderAddIcon,
  GitMergeIcon,
  MoveIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { CascadeOptions, NewOrder } from "@myakiba/contracts/orders/schema";
import { AddToListsDialog } from "@/components/lists/add-to-lists-dialog";
import { OrderForm } from "@/components/orders/order-form";
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
import { useUserPreferences } from "@/hooks/use-user-preferences";
import type { Saving } from "@/data/client";

const OWNED_ITEMS_DELETE_HINT =
  'Items with "Owned" status will not be deleted. You can delete owned items in the collection tab.';

export function OrdersActionBar({
  selectedOrderIds,
  selectedItems,
  onClearOrderSelection,
  onClearSelection,
  onMerge,
  onSplit,
  onDeleteOrders,
  onMoveItem,
  onDeleteItems,
  isMerging,
  isSplitting,
  isDeletingOrders,
  isDeletingItems,
  isMovingItems,
}: {
  readonly selectedOrderIds: ReadonlySet<string>;
  readonly selectedItems: {
    readonly collectionIds: ReadonlySet<string>;
    readonly orderIds: ReadonlySet<string>;
  };
  readonly onClearOrderSelection: () => void;
  readonly onClearSelection: () => void;
  readonly onMerge: (
    values: NewOrder,
    cascadeOptions: CascadeOptions,
    orderIds: ReadonlySet<string>,
  ) => Saving;
  readonly onSplit: (
    values: NewOrder,
    cascadeOptions: CascadeOptions,
    collectionIds: ReadonlySet<string>,
  ) => Saving;
  readonly onDeleteOrders: (orderIds: ReadonlySet<string>) => Saving;
  readonly onMoveItem: (
    targetOrderId: string,
    collectionIds: ReadonlySet<string>,
    orderIds?: ReadonlySet<string>,
  ) => Saving;
  readonly onDeleteItems: (collectionIds: ReadonlySet<string>) => Saving;
  readonly isMerging: boolean;
  readonly isSplitting: boolean;
  readonly isDeletingOrders: boolean;
  readonly isDeletingItems: boolean;
  readonly isMovingItems: boolean;
}): React.JSX.Element {
  const { currency } = useUserPreferences();
  const selectedItemCount = selectedItems.collectionIds.size;
  const selectionParts: string[] = [];
  if (selectedOrderIds.size > 0) {
    selectionParts.push(
      `${selectedOrderIds.size} ${selectedOrderIds.size === 1 ? "order" : "orders"}`,
    );
  }
  if (selectedItemCount > 0) {
    selectionParts.push(`${selectedItemCount} ${selectedItemCount === 1 ? "item" : "items"}`);
  }
  const listTargets = Array.from(selectedOrderIds, (id) => ({ type: "order" as const, id }));

  return (
    <ActionBar
      open={selectedOrderIds.size > 0 || selectedItemCount > 0}
      onOpenChange={(open) => {
        if (!open) onClearSelection();
      }}
    >
      <ActionBarSelection className="border-none">
        {selectionParts.join(", ")} selected
      </ActionBarSelection>
      <ActionBarSeparator />
      <ActionBarGroup>
        <OrderForm
          renderTrigger={
            <ActionBarItem
              disabled={selectedOrderIds.size < 2 || isMerging}
              onSelect={(event) => event.preventDefault()}
              variant="default"
            >
              <HugeiconsIcon icon={GitMergeIcon} />
              <span className="hidden md:block">{isMerging ? "Merging..." : "Merge"}</span>
            </ActionBarItem>
          }
          orderIds={selectedOrderIds}
          callbackFn={onMerge}
          type="merge"
          clearSelections={onClearSelection}
          currency={currency}
        />
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
          onMoveToNew={onSplit}
          clearSelections={onClearSelection}
          currency={currency}
        />
        <AddToListsDialog
          targets={listTargets}
          targetTitle={
            selectedOrderIds.size === 1
              ? "the selected order"
              : `the ${selectedOrderIds.size} selected orders`
          }
          onSuccess={onClearOrderSelection}
          renderTrigger={
            <ActionBarItem
              aria-label="Add selected orders to List"
              disabled={selectedOrderIds.size === 0}
              onSelect={(event) => event.preventDefault()}
              variant="default"
            >
              <HugeiconsIcon icon={FolderAddIcon} />
              <span className="hidden md:block">Add Orders to List</span>
            </ActionBarItem>
          }
        />
        <WriteConfirmDialog
          renderTrigger={
            <ActionBarItem
              disabled={selectedOrderIds.size === 0 || isDeletingOrders}
              onSelect={(event) => event.preventDefault()}
              variant="destructive"
            >
              <HugeiconsIcon icon={Delete01Icon} />
              <span>{isDeletingOrders ? "Deleting Orders" : "Delete Orders"}</span>
            </ActionBarItem>
          }
          title={`Delete ${selectedOrderIds.size} ${selectedOrderIds.size === 1 ? "order" : "orders"}?`}
          description={OWNED_ITEMS_DELETE_HINT}
          onConfirm={async () => {
            const saved = await onDeleteOrders(selectedOrderIds);
            if (saved.isOk()) onClearSelection();
            return saved;
          }}
        />
        <WriteConfirmDialog
          renderTrigger={
            <ActionBarItem
              disabled={selectedItemCount === 0 || isDeletingItems}
              onSelect={(event) => event.preventDefault()}
              variant="destructive"
            >
              <HugeiconsIcon icon={Delete01Icon} />
              <span>{isDeletingItems ? "Deleting Items" : "Delete Items"}</span>
            </ActionBarItem>
          }
          title={`Delete ${selectedItemCount} ${selectedItemCount === 1 ? "item" : "items"}?`}
          description={OWNED_ITEMS_DELETE_HINT}
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
