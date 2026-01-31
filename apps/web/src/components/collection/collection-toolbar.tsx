import { Button } from "@/components/ui/button";
import { DebouncedInput } from "@/components/debounced-input";
import { Filter, ListRestart, Trash, X } from "lucide-react";
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
import type { CollectionFilters } from "@/lib/collection/types";

// Define sortable columns configuration
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

interface CollectionToolbarProps {
  search: string;
  filters: CollectionFilters;
  onSearchChange: (search: string) => void;
  onFilterChange: (filters: CollectionFilters) => void;
  onResetFilters: () => void;
  currency?: string;
  // Selection state
  selectedCollectionIds: Set<string>;
  clearSelections: () => void;
  // Action callbacks
  onDeleteCollectionItems: (collectionIds: Set<string>) => Promise<void>;
}

export function CollectionToolbar({
  search,
  filters,
  onSearchChange,
  onFilterChange,
  onResetFilters,
  currency = "USD",
  selectedCollectionIds,
  clearSelections,
  onDeleteCollectionItems,
}: CollectionToolbarProps): React.ReactElement {
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

  const isActionBarOpen = selectedCollectionIds.size > 0;

  const selectionText = `${selectedCollectionIds.size} ${selectedCollectionIds.size === 1 ? "item" : "items"}`;

  return (
    <>
      <div className="flex items-center justify-start gap-2">
        <DebouncedInput
          value={search ?? ""}
          onChange={(e) => onSearchChange(e.toString())}
          placeholder="Search"
          className="max-w-xs"
        />
        <FiltersForm
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
          <ConfirmationPopover
            trigger={
              <ActionBarItem
                disabled={selectedCollectionIds.size === 0}
                onSelect={(e) => e.preventDefault()}
                variant="destructive"
              >
                <Trash />
                <span>Delete</span>
              </ActionBarItem>
            }
            title="Delete the selected collection items?"
            disabled={selectedCollectionIds.size === 0}
            onConfirm={async () => {
              await onDeleteCollectionItems(selectedCollectionIds);
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
