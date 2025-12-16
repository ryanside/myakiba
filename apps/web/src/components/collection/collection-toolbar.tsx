import { Button } from "@/components/ui/button";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import { DebouncedInput } from "@/components/debounced-input";
import { Filter, ListRestart, Trash, X } from "lucide-react";
import FiltersForm from "./filters-form";
import { SortCombobox, type SortableColumn } from "@/components/ui/sort-combobox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
  PopoverClose,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
  const currentSort = filters.sort && filters.order
    ? {
        columnId: filters.sort,
        direction: filters.order as "asc" | "desc",
      }
    : null;

  const handleSortChange = (
    columnId: string | null,
    direction: "asc" | "desc" | null
  ): void => {
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
        <Dialog key={JSON.stringify(filters)}>
          <DialogTrigger asChild>
            <Button variant="outline">
              <Filter className="" />
              <span className="hidden md:block">Filters</span>
            </Button>
          </DialogTrigger>
          <FiltersForm
            currentFilters={{
              ...filters,
            }}
            onApplyFilters={(newFilters) =>
              onFilterChange({ ...filters, ...newFilters, offset: 0 })
            }
            currency={currency}
          />
        </Dialog>
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
          <Popover>
            <PopoverTrigger asChild>
              <ActionBarItem
                disabled={selectedCollectionIds.size === 0}
                onSelect={(e) => e.preventDefault()}
                variant="destructive"
              >
                <Trash />
                <span>Delete</span>
              </ActionBarItem>
            </PopoverTrigger>
            <PopoverContent>
              <div className="flex flex-col items-center gap-2 text-sm text-pretty">
                <div className="flex flex-row items-center gap-2 mr-auto">
                  <p>Delete the selected collection items?</p>
                </div>
                <div className="flex flex-row items-center gap-2 max-w-16 mr-auto">
                  <PopoverClose asChild>
                    <Button
                      variant="outline"
                      disabled={selectedCollectionIds.size === 0}
                      className="block"
                    >
                      Cancel
                    </Button>
                  </PopoverClose>
                  <PopoverClose asChild>
                    <Button
                      variant="destructive"
                      disabled={selectedCollectionIds.size === 0}
                      className="block"
                      onClick={async () => {
                        await onDeleteCollectionItems(selectedCollectionIds);
                        clearSelections();
                      }}
                    >
                      Delete
                    </Button>
                  </PopoverClose>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </ActionBarGroup>
        <ActionBarSeparator />
        <ActionBarClose>
          <X />
        </ActionBarClose>
      </ActionBar>
    </>
  );
}

