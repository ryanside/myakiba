import { HugeiconsIcon } from "@hugeicons/react";
import {
  Cancel01Icon,
  Delete01Icon,
  FilterIcon,
  FilterResetIcon,
  MoveIcon,
} from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { DebouncedInput } from "@/components/debounced-input";
import FiltersForm from "./filters-form";
import { SortCombobox, type SortableColumn } from "@/components/ui/sort-combobox";
import { ConfirmationPopover } from "@/components/ui/confirmation-popover";
import {
  ActionBar,
  ActionBarSelection,
  ActionBarGroup,
  ActionBarItem,
  ActionBarClose,
  ActionBarSeparator,
} from "@/components/ui/action-bar";
import UnifiedItemMoveForm from "@/components/orders/unified-item-move-form";
import { useCollectionFilters } from "@/hooks/use-collection";
import { useUserPreferences } from "@/hooks/use-user-preferences";
import type { CascadeOptions, NewOrder } from "@myakiba/contracts/orders/schema";
import type { SelectedCollectionItems } from "@/hooks/use-selection";

const SORTABLE_COLUMNS: SortableColumn[] = [
  { id: "itemTitle", label: "Item" },
  { id: "itemScale", label: "Scale" },
  { id: "count", label: "Count" },
  { id: "score", label: "Score" },
  { id: "shop", label: "Shop" },
  { id: "price", label: "Price" },
  { id: "orderDate", label: "Order Date" },
  { id: "paymentDate", label: "Payment Date" },
  { id: "shippingDate", label: "Shipping Date" },
  { id: "collectionDate", label: "Collection Date" },
  { id: "createdAt", label: "Created At" },
];

export interface CollectionToolbarProps {
  readonly selectedItems: SelectedCollectionItems;
  readonly clearSelections: () => void;
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
}

export function CollectionToolbar({
  selectedItems,
  clearSelections,
  onDeleteCollectionItems,
  onAddCollectionItemsToOrder,
  onAddCollectionItemsToNewOrder,
  isDeletingCollectionItems,
  isAddingCollectionItemsToOrder,
  isCreatingCollectionOrder,
}: CollectionToolbarProps): React.ReactElement {
  const { filters, setFilters, resetFilters } = useCollectionFilters();
  const { currency } = useUserPreferences();

  const currentSort =
    filters.sort && filters.order
      ? {
          columnId: filters.sort,
          direction: filters.order as "asc" | "desc",
        }
      : null;

  const handleSortChange = (columnId: string | null, direction: "asc" | "desc" | null): void => {
    if (columnId === null || direction === null) {
      setFilters({
        sort: "createdAt",
        order: "desc",
        offset: 0,
      });
    } else {
      setFilters({
        sort: columnId as
          | "itemTitle"
          | "itemScale"
          | "count"
          | "score"
          | "price"
          | "shop"
          | "orderDate"
          | "paymentDate"
          | "shippingDate"
          | "collectionDate"
          | "createdAt",
        order: direction,
        offset: 0,
      });
    }
  };

  const isActionBarOpen = selectedItems.collectionIds.size > 0;

  const selectionText = `${selectedItems.collectionIds.size} ${selectedItems.collectionIds.size === 1 ? "item" : "items"}`;

  return (
    <>
      <div className="flex items-center justify-start gap-2">
        <DebouncedInput
          value={filters.search ?? ""}
          onChange={(e) => setFilters({ ...filters, search: e.toString() })}
          placeholder="Search"
          className="max-w-xs"
        />
        <FiltersForm
          renderTrigger={
            <Button variant="outline">
              <HugeiconsIcon icon={FilterIcon} className="" />
              <span className="hidden md:block">Filters</span>
            </Button>
          }
          currentFilters={{
            ...filters,
          }}
          onApplyFilters={(newFilters) => setFilters({ ...filters, ...newFilters, offset: 0 })}
          currency={currency}
        />
        <SortCombobox
          columns={SORTABLE_COLUMNS}
          currentSort={currentSort}
          onSortChange={handleSortChange}
        />
        <Button onClick={resetFilters} variant="outline">
          <HugeiconsIcon icon={FilterResetIcon} />
          <span className="hidden md:block">Reset Filters</span>
        </Button>
      </div>
      <ActionBar
        open={isActionBarOpen}
        onOpenChange={(open) => {
          if (!open) {
            clearSelections();
          }
        }}
      >
        <ActionBarSelection className="border-none">{selectionText} selected</ActionBarSelection>
        <ActionBarSeparator />
        <ActionBarGroup>
          <UnifiedItemMoveForm
            renderTrigger={
              <ActionBarItem
                disabled={
                  selectedItems.collectionIds.size === 0 ||
                  isAddingCollectionItemsToOrder ||
                  isCreatingCollectionOrder
                }
                onSelect={(e) => e.preventDefault()}
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
            clearSelections={clearSelections}
            currency={currency}
            intent="add"
          />
          <ConfirmationPopover
            trigger={
              <ActionBarItem
                disabled={selectedItems.collectionIds.size === 0 || isDeletingCollectionItems}
                onSelect={(e) => e.preventDefault()}
                variant="destructive"
              >
                <HugeiconsIcon icon={Delete01Icon} />
                <span>{isDeletingCollectionItems ? "Deleting..." : "Delete"}</span>
              </ActionBarItem>
            }
            title="Delete the selected collection items?"
            disabled={selectedItems.collectionIds.size === 0 || isDeletingCollectionItems}
            onConfirm={async () => {
              await onDeleteCollectionItems(selectedItems.collectionIds);
              clearSelections();
            }}
          />
        </ActionBarGroup>
        <ActionBarSeparator />
        <ActionBarClose>
          <HugeiconsIcon icon={Cancel01Icon} />
        </ActionBarClose>
      </ActionBar>
    </>
  );
}
