import {
  Cancel01Icon,
  Delete01Icon,
  FolderAddIcon,
  MoveIcon,
  PaintBucketIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ItemFill } from "@myakiba/contracts/collection/fill";
import type { CascadeOptions, NewOrder } from "@myakiba/contracts/orders/schema";
import { SavedFillMenu } from "@/components/fill/saved-fill-menu";
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
import { WriteConfirmDialog } from "@/components/write-confirm-dialog";
import { useUserPreferences } from "@/hooks/use-user-preferences";
import type { Saving } from "@/data/client";

export function CollectionActionBar({
  selectedItems,
  onClearSelection,
  onDeleteCollectionItems,
  onAddCollectionItemsToOrder,
  onAddCollectionItemsToNewOrder,
  onFillCollectionItems,
  isDeletingCollectionItems,
  isAddingCollectionItemsToOrder,
  isCreatingCollectionOrder,
  isFillingCollectionItems,
}: {
  readonly selectedItems: {
    readonly collectionIds: ReadonlySet<string>;
    readonly orderIds: ReadonlySet<string>;
  };
  readonly onClearSelection: () => void;
  readonly onDeleteCollectionItems: (collectionIds: ReadonlySet<string>) => Saving;
  readonly onAddCollectionItemsToOrder: (
    targetOrderId: string,
    collectionIds: ReadonlySet<string>,
    orderIds?: ReadonlySet<string>,
  ) => Saving;
  readonly onAddCollectionItemsToNewOrder: (
    values: NewOrder,
    cascadeOptions: CascadeOptions,
    collectionIds: ReadonlySet<string>,
  ) => Saving;
  readonly onFillCollectionItems: (collectionIds: ReadonlySet<string>, fill: ItemFill) => Saving;
  readonly isDeletingCollectionItems: boolean;
  readonly isAddingCollectionItemsToOrder: boolean;
  readonly isCreatingCollectionOrder: boolean;
  readonly isFillingCollectionItems: boolean;
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
        <SavedFillMenu
          rows={[
            {
              target: "collection",
              ids: selectedItems.collectionIds,
              onFill: onFillCollectionItems,
            },
          ]}
          currency={currency}
          trigger={
            <ActionBarItem
              disabled={selectedCount === 0 || isFillingCollectionItems}
              onSelect={(event) => event.preventDefault()}
              variant="default"
            >
              <HugeiconsIcon icon={PaintBucketIcon} />
              <span>Fill</span>
            </ActionBarItem>
          }
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
        <WriteConfirmDialog
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
          onConfirm={() => onDeleteCollectionItems(selectedItems.collectionIds)}
        />
      </ActionBarGroup>
      <ActionBarSeparator />
      <ActionBarClose aria-label="Clear selection">
        <HugeiconsIcon icon={Cancel01Icon} />
      </ActionBarClose>
    </ActionBar>
  );
}
