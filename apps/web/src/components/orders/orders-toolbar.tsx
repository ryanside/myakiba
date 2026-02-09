import { Button } from "@/components/ui/button";
import { DebouncedInput } from "@/components/debounced-input";
import { Filter, ListRestart, Merge, Move, Trash, X } from "lucide-react";
import OrdersFiltersForm from "./orders-filters-form";
import { SortCombobox, type SortableColumn } from "@/components/ui/sort-combobox";
import { OrderForm } from "./order-form";
import UnifiedItemMoveForm from "./unified-item-move-form";
import { ConfirmationPopover } from "@/components/ui/confirmation-popover";
import {
  ActionBar,
  ActionBarSelection,
  ActionBarGroup,
  ActionBarItem,
  ActionBarClose,
  ActionBarSeparator,
} from "@/components/ui/action-bar";
import type { OrderFilters, CascadeOptions, NewOrder } from "@myakiba/types";

// Define sortable columns configuration
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

interface OrdersToolbarProps {
  search: string;
  filters: OrderFilters;
  onSearchChange: (search: string) => void;
  onFilterChange: (filters: OrderFilters) => void;
  onResetFilters: () => void;
  currency?: string;
  // Selection state
  selectedOrderIds: Set<string>;
  selectedItemData: {
    collectionIds: Set<string>;
    orderIds: Set<string>;
  };
  clearSelections: () => void;
  // Action callbacks
  onMerge: (
    values: NewOrder,
    cascadeOptions: CascadeOptions,
    orderIds: Set<string>,
  ) => Promise<void>;
  onSplit: (
    values: NewOrder,
    cascadeOptions: CascadeOptions,
    collectionIds: Set<string>,
    orderIds: Set<string>,
  ) => Promise<void>;
  onDeleteOrders: (orderIds: Set<string>) => Promise<void>;
  onMoveItem: (
    targetOrderId: string,
    collectionIds: Set<string>,
    orderIds: Set<string>,
  ) => Promise<void>;
  onDeleteItems: (collectionIds: Set<string>, orderIds: Set<string>) => Promise<void>;
}

export function OrdersToolbar({
  search,
  filters,
  onSearchChange,
  onFilterChange,
  onResetFilters,
  currency = "USD",
  selectedOrderIds,
  selectedItemData,
  clearSelections,
  onMerge,
  onSplit,
  onDeleteOrders,
  onMoveItem,
  onDeleteItems,
}: OrdersToolbarProps): React.ReactElement {
  const currentSort =
    filters.sort && filters.order
      ? {
          columnId: filters.sort,
          direction: filters.order as "asc" | "desc",
        }
      : null;

  const handleSortChange = (columnId: string | null, direction: "asc" | "desc" | null): void => {
    if (columnId === null || direction === null) {
      // Clear sorting - use default sort
      onFilterChange({
        sort: "createdAt",
        order: "desc",
        offset: 0,
      });
    } else {
      onFilterChange({
        sort: columnId as
          | "title"
          | "shop"
          | "orderDate"
          | "paymentDate"
          | "shippingDate"
          | "collectionDate"
          | "releaseDate"
          | "shippingMethod"
          | "total"
          | "shippingFee"
          | "taxes"
          | "duties"
          | "tariffs"
          | "miscFees"
          | "itemCount"
          | "status"
          | "createdAt",
        order: direction,
        offset: 0,
      });
    }
  };

  const isActionBarOpen = selectedOrderIds.size > 0 || selectedItemData.collectionIds.size > 0;

  const selectionText = (() => {
    const parts: string[] = [];
    if (selectedOrderIds.size > 0) {
      parts.push(`${selectedOrderIds.size} ${selectedOrderIds.size === 1 ? "order" : "orders"}`);
    }
    if (selectedItemData.collectionIds.size > 0) {
      parts.push(
        `${selectedItemData.collectionIds.size} ${
          selectedItemData.collectionIds.size === 1 ? "item" : "items"
        }`,
      );
    }
    return parts.join(", ");
  })();

  return (
    <>
      <div className="flex items-center justify-start gap-2">
        <DebouncedInput
          value={search ?? ""}
          onChange={(e) => onSearchChange(e.toString())}
          placeholder="Search"
          className="max-w-xs"
        />
        <OrdersFiltersForm
          renderTrigger={
            <Button variant="outline">
              <Filter className="" />
              <span className="hidden md:block">Filters</span>
            </Button>
          }
          currentFilters={{
            ...filters,
          }}
          onApplyFilters={(newFilters) => onFilterChange({ ...filters, ...newFilters, offset: 0 })}
          currency={currency}
        />
        <SortCombobox
          columns={SORTABLE_COLUMNS}
          currentSort={currentSort}
          onSortChange={handleSortChange}
        />
        <Button onClick={onResetFilters} variant="outline">
          <ListRestart />
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
                disabled={selectedOrderIds.size < 2}
                onSelect={(e) => e.preventDefault()}
                variant="primary"
              >
                <Merge />
                <span className="hidden md:block">Merge</span>
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
                disabled={selectedItemData.collectionIds.size === 0}
                onSelect={(e) => e.preventDefault()}
                variant="primary"
              >
                <Move />
                <span className="hidden md:block">Move Item</span>
              </ActionBarItem>
            }
            selectedItemData={selectedItemData}
            onMoveToExisting={onMoveItem}
            onMoveToNew={onSplit}
            clearSelections={clearSelections}
            currency={currency}
          />
          <ConfirmationPopover
            trigger={
              <ActionBarItem
                disabled={selectedOrderIds.size === 0}
                onSelect={(e) => e.preventDefault()}
                variant="destructive"
              >
                <Trash />
                <span>
                  <span className="hidden md:inline">Delete </span>
                  Orders
                </span>
              </ActionBarItem>
            }
            title="Delete the selected orders and their items?"
            tooltipContent='Items with "Owned" status will not be deleted. You can delete owned items in the collection tab.'
            disabled={selectedOrderIds.size === 0}
            onConfirm={async () => {
              await onDeleteOrders(selectedOrderIds);
              clearSelections();
            }}
          />
          <ConfirmationPopover
            trigger={
              <ActionBarItem
                disabled={selectedItemData.collectionIds.size === 0}
                onSelect={(e) => e.preventDefault()}
                variant="destructive"
              >
                <Trash />
                <span>
                  <span className="hidden md:inline">Delete </span> Items
                </span>
              </ActionBarItem>
            }
            title="Delete the selected items?"
            tooltipContent='Items with "Owned" status will not be deleted. You can delete owned items in the collection tab.'
            disabled={selectedItemData.collectionIds.size === 0}
            onConfirm={async () => {
              await onDeleteItems(selectedItemData.collectionIds, selectedItemData.orderIds);
              clearSelections();
            }}
          />
        </ActionBarGroup>
        <ActionBarSeparator />
        <ActionBarClose>
          <X />
        </ActionBarClose>
      </ActionBar>
    </>
  );
}
