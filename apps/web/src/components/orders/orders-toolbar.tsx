import { HugeiconsIcon } from "@hugeicons/react";
import {
  Cancel01Icon,
  Delete01Icon,
  FilterIcon,
  GitMergeIcon,
  FilterResetIcon,
  MoveIcon,
} from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { DebouncedInput } from "@/components/debounced-input";
import OrdersFiltersForm from "./orders-filters-form";
import { SortCombobox, type SortableColumn } from "@/components/ui/sort-combobox";
import { OrderForm } from "./order-form";
import UnifiedItemMoveForm from "./unified-item-move-form";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  ActionBar,
  ActionBarSelection,
  ActionBarGroup,
  ActionBarItem,
  ActionBarClose,
  ActionBarSeparator,
} from "@/components/ui/action-bar";
import type { OrderFilters, CascadeOptions, NewOrder } from "@myakiba/contracts/orders/schema";
import { useOrdersFilters } from "@/hooks/use-orders";
import { useUserPreferences } from "@/hooks/use-user-preferences";
import type { SelectedCollectionItems } from "@/hooks/use-selection";

const OWNED_ITEMS_DELETE_HINT =
  'Items with "Owned" status will not be deleted. You can delete owned items in the collection tab.';

const SORTABLE_COLUMNS: SortableColumn[] = [
  { id: "title", label: "Order" },
  { id: "shop", label: "Shop" },
  { id: "orderDate", label: "Order Date" },
  { id: "paymentDate", label: "Payment Date" },
  { id: "shippingDate", label: "Shipping Date" },
  { id: "collectionDate", label: "Collection Date" },
  { id: "releaseDate", label: "Release" },
  { id: "shippingMethod", label: "Shipping Method" },
  { id: "total", label: "Total" },
  { id: "shippingFee", label: "Shipping Fee" },
  { id: "taxes", label: "Taxes" },
  { id: "duties", label: "Duties" },
  { id: "tariffs", label: "Tariffs" },
  { id: "miscFees", label: "Misc Fees" },
  { id: "itemCount", label: "Items" },
  { id: "status", label: "Status" },
  { id: "createdAt", label: "Created At" },
];

export interface OrdersToolbarProps {
  readonly selectedOrderIds: ReadonlySet<string>;
  readonly selectedItems: SelectedCollectionItems;
  readonly clearSelections: () => void;
  readonly onMerge: (
    values: NewOrder,
    cascadeOptions: CascadeOptions,
    orderIds: ReadonlySet<string>,
  ) => Promise<void>;
  readonly onSplit: (
    values: NewOrder,
    cascadeOptions: CascadeOptions,
    collectionIds: ReadonlySet<string>,
  ) => Promise<void>;
  readonly onDeleteOrders: (orderIds: ReadonlySet<string>) => Promise<void>;
  readonly onMoveItem: (
    targetOrderId: string,
    collectionIds: ReadonlySet<string>,
    orderIds?: ReadonlySet<string>,
  ) => Promise<void>;
  readonly onDeleteItems: (collectionIds: ReadonlySet<string>) => Promise<void>;
  readonly isMerging: boolean;
  readonly isSplitting: boolean;
  readonly isDeletingOrders: boolean;
  readonly isDeletingItems: boolean;
  readonly isMovingItems: boolean;
}

export function OrdersToolbar({
  selectedOrderIds,
  selectedItems,
  clearSelections,
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
}: OrdersToolbarProps): React.ReactElement {
  const { filters, setFilters, resetFilters } = useOrdersFilters();
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
        sort: columnId as OrderFilters["sort"],
        order: direction,
        offset: 0,
      });
    }
  };

  const isActionBarOpen = selectedOrderIds.size > 0 || selectedItems.collectionIds.size > 0;

  const selectionText = (() => {
    const parts: string[] = [];
    if (selectedOrderIds.size > 0) {
      parts.push(`${selectedOrderIds.size} ${selectedOrderIds.size === 1 ? "order" : "orders"}`);
    }
    if (selectedItems.collectionIds.size > 0) {
      parts.push(
        `${selectedItems.collectionIds.size} ${selectedItems.collectionIds.size === 1 ? "item" : "items"}`,
      );
    }
    return parts.join(", ");
  })();

  return (
    <>
      <div className="flex items-center justify-start gap-2">
        <DebouncedInput
          value={filters.search ?? ""}
          onChange={(e) => setFilters({ ...filters, search: e.toString() })}
          placeholder="Search"
          className="max-w-xs"
        />
        <OrdersFiltersForm
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
          <OrderForm
            renderTrigger={
              <ActionBarItem
                disabled={selectedOrderIds.size < 2 || isMerging}
                onSelect={(e) => e.preventDefault()}
                variant="default"
              >
                <HugeiconsIcon icon={GitMergeIcon} />
                <span className="hidden md:block">{isMerging ? "Merging..." : "Merge"}</span>
              </ActionBarItem>
            }
            orderIds={selectedOrderIds}
            callbackFn={onMerge}
            type="merge"
            clearSelections={clearSelections}
            currency={currency}
          />
          <UnifiedItemMoveForm
            renderTrigger={
              <ActionBarItem
                disabled={selectedItems.collectionIds.size === 0 || isMovingItems || isSplitting}
                onSelect={(e) => e.preventDefault()}
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
            clearSelections={clearSelections}
            currency={currency}
          />
          <ConfirmDialog
            renderTrigger={
              <ActionBarItem
                disabled={selectedOrderIds.size === 0 || isDeletingOrders}
                onSelect={(e) => e.preventDefault()}
                variant="destructive"
              >
                <HugeiconsIcon icon={Delete01Icon} />
                <span>
                  <span className="hidden md:inline">
                    {isDeletingOrders ? "Deleting " : "Delete "}
                  </span>
                  Orders
                </span>
              </ActionBarItem>
            }
            title={`Delete ${selectedOrderIds.size} ${selectedOrderIds.size === 1 ? "order" : "orders"}?`}
            description={OWNED_ITEMS_DELETE_HINT}
            onConfirm={async () => {
              await onDeleteOrders(selectedOrderIds);
              clearSelections();
            }}
          />
          <ConfirmDialog
            renderTrigger={
              <ActionBarItem
                disabled={selectedItems.collectionIds.size === 0 || isDeletingItems}
                onSelect={(e) => e.preventDefault()}
                variant="destructive"
              >
                <HugeiconsIcon icon={Delete01Icon} />
                <span>
                  <span className="hidden md:inline">
                    {isDeletingItems ? "Deleting " : "Delete "}
                  </span>{" "}
                  Items
                </span>
              </ActionBarItem>
            }
            title={`Delete ${selectedItems.collectionIds.size} ${selectedItems.collectionIds.size === 1 ? "item" : "items"}?`}
            description={OWNED_ITEMS_DELETE_HINT}
            onConfirm={async () => {
              await onDeleteItems(selectedItems.collectionIds);
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
