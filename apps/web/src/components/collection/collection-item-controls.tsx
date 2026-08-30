import {
  Copy01Icon,
  Delete02Icon,
  Edit03Icon,
  FolderAddIcon,
  Loading03Icon,
  MoreHorizontalIcon,
  MoveIcon,
  ViewIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { CollectionItem, CollectionItemFormValues } from "@myakiba/contracts/collection/types";
import type { CascadeOptions, NewOrder } from "@myakiba/contracts/orders/schema";
import type { Currency, DateFormat } from "@myakiba/contracts/shared/types";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import CollectionItemForm from "@/components/collection/collection-item-form";
import { AddToListsDialog } from "@/components/lists/add-to-lists-dialog";
import UnifiedItemMoveForm from "@/components/orders/unified-item-move-form";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLinkItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ItemControl, ItemControls, ItemControlsSelection } from "@/components/ui/item-controls";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

export function CollectionItemControls({
  item,
  itemSize,
  isPending,
  isSelected,
  onEditCollectionItem,
  onDeleteCollectionItems,
  onAddCollectionItemsToOrder,
  onAddCollectionItemsToNewOrder,
  onToggleSelection,
  currency,
  dateFormat,
}: {
  readonly item: CollectionItem;
  readonly itemSize: number;
  readonly isPending: boolean;
  readonly isSelected: boolean;
  readonly onEditCollectionItem: (values: CollectionItemFormValues) => Promise<void>;
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
  readonly onToggleSelection: () => void;
  readonly currency: Currency;
  readonly dateFormat: DateFormat;
}): React.JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false);
  const [addToListsOpen, setAddToListsOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const selectedItems = {
    collectionIds: new Set([item.id]),
    orderIds: item.orderId ? new Set([item.orderId]) : new Set<string>(),
  };
  let controlsSize: "xs" | "sm" | "md" | "lg" = "lg";
  if (itemSize < 150) controlsSize = "xs";
  else if (itemSize < 180) controlsSize = "sm";
  else if (itemSize < 240) controlsSize = "md";

  return (
    <>
      <ItemControls variant="media" size={controlsSize} active={isSelected || menuOpen}>
        <ItemControlsSelection
          checked={isSelected}
          onCheckedChange={onToggleSelection}
          label={`${isSelected ? "Deselect" : "Select"} ${item.itemTitle}`}
        />
        <CollectionItemForm
          renderTrigger={
            <ItemControl disabled={isPending} title="Edit item">
              <HugeiconsIcon icon={Edit03Icon} />
              <span className="sr-only">Edit item</span>
            </ItemControl>
          }
          itemData={item}
          callbackFn={onEditCollectionItem}
          currency={currency}
          dateFormat={dateFormat}
        />
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger
            render={
              <ItemControl disabled={isPending} title="More actions">
                <HugeiconsIcon
                  icon={isPending ? Loading03Icon : MoreHorizontalIcon}
                  className={cn(isPending && "animate-spin")}
                />
                <span className="sr-only">Open menu</span>
              </ItemControl>
            }
          />
          {menuOpen ? (
            <DropdownMenuContent align="end">
              <DropdownMenuGroup>
                <DropdownMenuLinkItem
                  render={
                    <Link
                      {...(item.itemExternalId === null
                        ? ({ to: "/item/custom/$id", params: { id: item.itemId } } as const)
                        : ({
                            to: "/item/$externalId",
                            params: { externalId: item.itemExternalId },
                          } as const))}
                    />
                  }
                >
                  <HugeiconsIcon icon={ViewIcon} />
                  View details
                </DropdownMenuLinkItem>
                <DropdownMenuItem
                  onClick={async () => {
                    if (item.itemExternalId === null) {
                      toast.add({ type: "error", title: "No MFC item ID for custom items" });
                      return;
                    }

                    try {
                      await navigator.clipboard.writeText(String(item.itemExternalId));
                    } catch {
                      toast.add({
                        type: "error",
                        title: "Could not copy MFC item ID to clipboard",
                      });
                      return;
                    }

                    toast.add({ type: "success", title: "Copied MFC item ID to clipboard" });
                  }}
                >
                  <HugeiconsIcon icon={Copy01Icon} />
                  Copy MFC ID
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    setMenuOpen(false);
                    setAddToListsOpen(true);
                  }}
                >
                  <HugeiconsIcon icon={FolderAddIcon} />
                  Add to List
                </DropdownMenuItem>
                <UnifiedItemMoveForm
                  renderTrigger={
                    <DropdownMenuItem closeOnClick={false}>
                      <HugeiconsIcon icon={MoveIcon} />
                      Assign order
                    </DropdownMenuItem>
                  }
                  selectedItems={selectedItems}
                  onMoveToExisting={onAddCollectionItemsToOrder}
                  onMoveToNew={onAddCollectionItemsToNewOrder}
                  currency={currency}
                  intent="add"
                />
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => {
                    setMenuOpen(false);
                    setDeleteOpen(true);
                  }}
                >
                  <HugeiconsIcon icon={Delete02Icon} />
                  Delete item
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          ) : null}
        </DropdownMenu>
      </ItemControls>
      <AddToListsDialog
        open={addToListsOpen}
        onOpenChange={setAddToListsOpen}
        targets={[{ type: "collectionItem", id: item.id }]}
        targetTitle={item.itemTitle}
      />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete item?"
        description="This will permanently remove this item from your collection."
        onConfirm={() => onDeleteCollectionItems(new Set([item.id]))}
      />
    </>
  );
}
