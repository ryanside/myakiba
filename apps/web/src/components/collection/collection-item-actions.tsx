import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Copy01Icon,
  Delete02Icon,
  Edit03Icon,
  Loading03Icon,
  MoreHorizontalIcon,
  MoveIcon,
  ViewIcon,
} from "@hugeicons/core-free-icons";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import type { CollectionItem, CollectionItemFormValues } from "@myakiba/contracts/collection/types";
import type { CascadeOptions, NewOrder } from "@myakiba/contracts/orders/schema";
import type { Currency, DateFormat } from "@myakiba/contracts/shared/types";
import CollectionItemForm from "@/components/collection/collection-item-form";
import UnifiedItemMoveForm from "@/components/orders/unified-item-move-form";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MediaItemAction, MediaItemToolbar } from "@/components/ui/media-item-toolbar";
import { cn } from "@/lib/utils";

interface CollectionItemActionsProps {
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
}

export function CollectionItemActions({
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
}: CollectionItemActionsProps): React.JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const selectedItems = {
    collectionIds: new Set([item.id]),
    orderIds: item.orderId ? new Set([item.orderId]) : new Set<string>(),
  };

  return (
    <>
      <MediaItemToolbar
        checked={isSelected}
        itemLabel={item.itemTitle}
        itemSize={itemSize}
        onCheckedChange={onToggleSelection}
        active={menuOpen}
      >
        <CollectionItemForm
          renderTrigger={
            <MediaItemAction disabled={isPending} title="Edit item">
              <HugeiconsIcon icon={Edit03Icon} className="size-4" />
              <span className="sr-only">Edit item</span>
            </MediaItemAction>
          }
          itemData={item}
          callbackFn={onEditCollectionItem}
          currency={currency}
          dateFormat={dateFormat}
        />
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger
            render={
              <MediaItemAction disabled={isPending} title="More actions">
                <HugeiconsIcon
                  icon={isPending ? Loading03Icon : MoreHorizontalIcon}
                  className={cn("size-4", isPending && "animate-spin")}
                />
                <span className="sr-only">Open menu</span>
              </MediaItemAction>
            }
          />
          {menuOpen ? (
            <DropdownMenuContent align="end">
              <DropdownMenuItem>
                {item.itemExternalId !== null ? (
                  <Link
                    to="/item/$externalId"
                    params={{ externalId: item.itemExternalId }}
                    className="flex items-center gap-1.5"
                  >
                    <HugeiconsIcon icon={ViewIcon} />
                    View details
                  </Link>
                ) : (
                  <Link
                    to="/item/custom/$id"
                    params={{ id: item.itemId }}
                    className="flex items-center gap-1.5"
                  >
                    <HugeiconsIcon icon={ViewIcon} />
                    View details
                  </Link>
                )}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={async () => {
                  if (item.itemExternalId === null) {
                    toast.error("No MFC item ID for custom items");
                    return;
                  }

                  try {
                    await navigator.clipboard.writeText(String(item.itemExternalId));
                  } catch {
                    toast.error("Could not copy MFC item ID to clipboard");
                    return;
                  }

                  toast.success("Copied MFC item ID to clipboard");
                }}
              >
                <HugeiconsIcon icon={Copy01Icon} />
                Copy MFC ID
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
              <DropdownMenuSeparator />
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
            </DropdownMenuContent>
          ) : null}
        </DropdownMenu>
      </MediaItemToolbar>
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
