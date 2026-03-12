import { HugeiconsIcon } from "@hugeicons/react";
import {
  Cancel01Icon,
  Delete01Icon,
  FilterIcon,
  FilterResetIcon,
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
import { useCollectionFilters, useUserPreferences } from "@/hooks/use-collection";

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
  readonly selectedCollectionIds: Set<string>;
  readonly clearSelections: () => void;
  readonly onDeleteCollectionItems: (collectionIds: Set<string>) => Promise<void>;
  readonly isDeletingCollectionItems: boolean;
}

export function CollectionToolbar({
  selectedCollectionIds,
  clearSelections,
  onDeleteCollectionItems,
  isDeletingCollectionItems,
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

  const isActionBarOpen = selectedCollectionIds.size > 0;

  const selectionText = `${selectedCollectionIds.size} ${selectedCollectionIds.size === 1 ? "item" : "items"}`;

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
          <ConfirmationPopover
            trigger={
              <ActionBarItem
                disabled={selectedCollectionIds.size === 0 || isDeletingCollectionItems}
                onSelect={(e) => e.preventDefault()}
                variant="destructive"
              >
                <HugeiconsIcon icon={Delete01Icon} />
                <span>{isDeletingCollectionItems ? "Deleting..." : "Delete"}</span>
              </ActionBarItem>
            }
            title="Delete the selected collection items?"
            disabled={selectedCollectionIds.size === 0 || isDeletingCollectionItems}
            onConfirm={async () => {
              await onDeleteCollectionItems(selectedCollectionIds);
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
