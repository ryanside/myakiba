import { Button } from "@/components/ui/button";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import { DebouncedInput } from "@/components/debounced-input";
import { Filter, ListRestart, Merge, Move, Trash, Info } from "lucide-react";
import OrdersFiltersForm from "./orders-filters-form";
import { OrdersSortCombobox, type SortableColumn } from "./orders-sort-combobox";
import { OrderForm } from "./order-form";
import UnifiedItemMoveForm from "./unified-item-move-form";
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
import type { OrderFilters, CascadeOptions, NewOrder } from "@/lib/orders/types";
import type { CollectionItemFormValues } from "@/lib/collection/types";

// Define sortable columns configuration
const SORTABLE_COLUMNS: SortableColumn[] = [
  { id: "title", label: "Order" },
  { id: "shop", label: "Shop" },
  { id: "orderDate", label: "Order Date" },
  { id: "paymentDate", label: "Payment Date" },
  { id: "shippingDate", label: "Shipping Date" },
  { id: "collectionDate", label: "Collection Date" },
  { id: "releaseMonthYear", label: "Release" },
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
    orderIds: Set<string>
  ) => Promise<void>;
  onSplit: (
    values: NewOrder,
    cascadeOptions: CascadeOptions,
    collectionIds: Set<string>,
    orderIds: Set<string>
  ) => Promise<void>;
  onDeleteOrders: (orderIds: Set<string>) => Promise<void>;
  onMoveItem: (
    targetOrderId: string,
    collectionIds: Set<string>,
    orderIds: Set<string>
  ) => Promise<void>;
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
}: OrdersToolbarProps): React.ReactElement {
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
          | "title"
          | "shop"
          | "orderDate"
          | "paymentDate"
          | "shippingDate"
          | "collectionDate"
          | "releaseMonthYear"
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

  return (
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
        <OrdersFiltersForm
          currentFilters={{
            ...filters,
          }}
          onApplyFilters={(newFilters) =>
            onFilterChange({ ...filters, ...newFilters, offset: 0 })
          }
          currency={currency}
        />
      </Dialog>
      <OrdersSortCombobox
        columns={SORTABLE_COLUMNS}
        currentSort={currentSort}
        onSortChange={handleSortChange}
      />
      <Button onClick={onResetFilters} variant="outline">
        <ListRestart />
        <span className="hidden md:block">Reset Filters</span>
      </Button>
      <Dialog>
        <DialogTrigger asChild>
          <Button variant="outline" disabled={selectedOrderIds.size < 2}>
            <Merge />
            <span className="hidden md:block">Merge</span>
          </Button>
        </DialogTrigger>
        <OrderForm
          orderIds={selectedOrderIds}
          callbackFn={onMerge}
          type="merge"
          clearSelections={clearSelections}
          currency={currency}
        />
      </Dialog>
      <Dialog>
        <DialogTrigger asChild>
          <Button
            variant="outline"
            disabled={selectedItemData.collectionIds.size === 0}
          >
            <Move />
            <span className="hidden md:block">Move Item</span>
          </Button>
        </DialogTrigger>
        <UnifiedItemMoveForm
          selectedItemData={selectedItemData}
          onMoveToExisting={onMoveItem}
          onMoveToNew={onSplit}
          clearSelections={clearSelections}
          currency={currency}
        />
      </Dialog>
      <Popover>
        <PopoverTrigger asChild disabled={selectedOrderIds.size === 0}>
          <Button
            variant="outline"
            disabled={selectedOrderIds.size === 0}
            size="icon"
          >
            <Trash className="" />
          </Button>
        </PopoverTrigger>
        <PopoverContent>
          <div className="flex flex-col items-center gap-2 text-sm text-pretty">
            <div className="flex flex-row items-center gap-2 mr-auto">
              <p>Delete the selected orders and their items?</p>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="w-4 h-4" />
                </TooltipTrigger>
                <TooltipContent className="max-h-40">
                  <p>
                    Items with "Owned" status will not be deleted. You can
                    delete owned items in the collection tab.
                  </p>
                </TooltipContent>
              </Tooltip>
            </div>
            <div className="flex flex-row items-center gap-2 max-w-16 mr-auto">
              <PopoverClose asChild>
                <Button
                  variant="outline"
                  disabled={selectedOrderIds.size === 0}
                  className="block"
                >
                  Cancel
                </Button>
              </PopoverClose>
              <PopoverClose asChild>
                <Button
                  variant="destructive"
                  disabled={selectedOrderIds.size === 0}
                  className="block"
                  onClick={() => onDeleteOrders(selectedOrderIds)}
                >
                  Delete
                </Button>
              </PopoverClose>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

