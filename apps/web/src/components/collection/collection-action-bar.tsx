import { Cancel01Icon, Delete01Icon, FolderAddIcon, MoveIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { CascadeOptions, NewOrder } from "@myakiba/contracts/orders/schema";
import { AddToListsDialog } from "@/components/lists/add-to-lists-dialog";
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
import { useUserPreferences } from "@/hooks/use-user-preferences";

export function CollectionActionBar({
  selectedItems,
  onClearSelection,
  onDeleteCollectionItems,
  onAddCollectionItemsToOrder,
  onAddCollectionItemsToNewOrder,
  isDeletingCollectionItems,
  isAddingCollectionItemsToOrder,
  isCreatingCollectionOrder,
}: {
  readonly selectedItems: {
    readonly collectionIds: ReadonlySet<string>;
    readonly orderIds: ReadonlySet<string>;
  };
  readonly onClearSelection: () => void;
  readonly onDeleteCollectionItems: (collectionIds: ReadonlySet<string>) => Promise<void>;
  readonly onAddCollectionItemsToOrder: (
    targetOrderId: string,
    collectionIds: ReadonlySet<string>,
    orderIds?: ReadonlySet<string>,
  ) => Promise<void>;
  readonly onAddCollectionItemsToNewOrder: (
    values: NewOrder,
    cascadeOptions: CascadeOptions,
    collectionIds: ReadonlySet<string>,
  ) => Promise<void>;
  readonly isDeletingCollectionItems: boolean;
  readonly isAddingCollectionItemsToOrder: boolean;
  readonly isCreatingCollectionOrder: boolean;
}): React.JSX.Element {
  const { currency } = useUserPreferences();
  const selectedCount = selectedItems.collectionIds.size;
  const listTargets = Array.from(selectedItems.collectionIds, (id) => ({
    type: "collectionItem" as const,
    id,
  }));

  return (
    <ActionBar
      open={selectedCount > 0}
      onOpenChange={(open) => {
        if (!open) onClearSelection();
      }}
    >
      <ActionBarSelection className="border-none">
        {selectedCount} {selectedCount === 1 ? "item" : "items"} selected
      </ActionBarSelection>
      <ActionBarSeparator />
      <ActionBarGroup>
        <UnifiedItemMoveForm
          renderTrigger={
            <ActionBarItem
              disabled={
                selectedCount === 0 || isAddingCollectionItemsToOrder || isCreatingCollectionOrder
              }
              onSelect={(event) => event.preventDefault()}
              variant="default"
            >
              <HugeiconsIcon icon={MoveIcon} />
              <span>
                {isAddingCollectionItemsToOrder || isCreatingCollectionOrder
                  ? "Assigning..."
                  : "Assign Order"}
              </span>
            </ActionBarItem>
          }
          selectedItems={selectedItems}
          onMoveToExisting={onAddCollectionItemsToOrder}
          onMoveToNew={onAddCollectionItemsToNewOrder}
          clearSelections={onClearSelection}
          currency={currency}
          intent="add"
        />
        <AddToListsDialog
          targets={listTargets}
          targetTitle={
            selectedCount === 1 ? "the selected item" : `the ${selectedCount} selected items`
          }
          onSuccess={onClearSelection}
          renderTrigger={
            <ActionBarItem
              aria-label="Add selected items to List"
              disabled={selectedCount === 0}
              onSelect={(event) => event.preventDefault()}
              variant="default"
            >
              <HugeiconsIcon icon={FolderAddIcon} />
              <span className="hidden md:block">Add Items to List</span>
            </ActionBarItem>
          }
        />
        <ConfirmDialog
          renderTrigger={
            <ActionBarItem
              disabled={selectedCount === 0 || isDeletingCollectionItems}
              onSelect={(event) => event.preventDefault()}
              variant="destructive"
            >
              <HugeiconsIcon icon={Delete01Icon} />
              <span>{isDeletingCollectionItems ? "Deleting..." : "Delete"}</span>
            </ActionBarItem>
          }
          title={`Delete ${selectedCount} ${selectedCount === 1 ? "item" : "items"}?`}
          description={`This will permanently remove ${selectedCount === 1 ? "this item" : `${selectedCount} items`} from your collection.`}
          onConfirm={async () => {
            await onDeleteCollectionItems(selectedItems.collectionIds);
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
