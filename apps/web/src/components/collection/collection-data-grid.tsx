import { useSelection } from "@/hooks/use-selection";
import type { CollectionFilters, CollectionItem } from "@/lib/collection/types";
import type {
  Updater,
  ColumnDef,
  ExpandedState,
  PaginationState,
  SortingState,
} from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DataGridColumnHeader } from "@/components/ui/data-grid-column-header";
import {
  MoreHorizontal,
  Eye,
  Edit,
  Trash2,
  ListRestart,
  Package,
  Copy,
  Filter,
  Trash,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Link } from "@tanstack/react-router";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import { getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { DebouncedInput } from "../debounced-input";
import { DataGridPagination } from "../ui/data-grid-pagination";
import { DataGrid, DataGridContainer } from "../ui/data-grid";
import { ScrollArea, ScrollBar } from "../ui/scroll-area";
import { DataGridTable } from "../ui/data-grid-table";
import { toast } from "sonner";
import { Dialog, DialogTrigger } from "../ui/dialog";
import FiltersForm from "./filters-form";
import {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverTrigger,
} from "../ui/popover";
import CollectionItemForm from "./collection-item-form";

export const DEFAULT_PAGE_INDEX = 0;
export const DEFAULT_PAGE_SIZE = 10;

interface CollectionDataGridProps {
  collection: CollectionItem[];
  totalCount: number;
  pagination: {
    limit: number;
    offset: number;
  };
  sorting: {
    sort: string;
    order: string;
  };
  search: string;
  filters: CollectionFilters;
  onFilterChange: (filters: CollectionFilters) => void;
  onSearchChange: (search: string) => void;
  onResetFilters: () => void;
  onDeleteCollectionItems: (collectionIds: Set<string>) => void;
  onEditCollectionItem: (values: CollectionItem) => void;
}

export const CollectionDataGrid = ({
  collection,
  totalCount,
  pagination: serverPagination,
  sorting: serverSorting,
  search,
  filters,
  onFilterChange,
  onSearchChange,
  onResetFilters,
  onDeleteCollectionItems,
  onEditCollectionItem,
}: CollectionDataGridProps) => {
  const pagination = useMemo<PaginationState>(
    () => ({
      pageIndex: Math.floor(serverPagination.offset / serverPagination.limit),
      pageSize: serverPagination.limit,
    }),
    [serverPagination.offset, serverPagination.limit]
  );

  const sorting = useMemo<SortingState>(
    () => [
      {
        id: serverSorting.sort,
        desc: serverSorting.order === "desc",
      },
    ],
    [serverSorting.sort, serverSorting.order]
  );

  const {
    rowSelection: collectionSelection,
    setRowSelection: setCollectionSelection,
    getSelectedOrderIds: getSelectedCollectionIds,
    clearSelections,
  } = useSelection();

  const [expandedRows, setExpandedRows] = useState<ExpandedState>({});
  const [columnOrder, setColumnOrder] = useState<string[]>([
    "select",
    "itemTitle",
    "itemCategory",
    "itemScale",
    "status",
    "count",
    "score",
    "price",
    "shop",
    "releaseDate",
    "collectionDate",
    "actions",
  ]);

  const columns = useMemo<ColumnDef<CollectionItem>[]>(
    () => [
      {
        id: "select",
        header: ({ table }) => (
          <Checkbox
            checked={
              table.getIsAllPageRowsSelected() ||
              (table.getIsSomePageRowsSelected() && "indeterminate")
            }
            onCheckedChange={(value) =>
              table.toggleAllPageRowsSelected(!!value)
            }
            aria-label="Select all"
            size="sm"
            className="align-[inherit] mb-0.5 rounded-xs"
          />
        ),
        cell: ({ row }) => (
          <>
            <div
              className={cn(
                "hidden absolute top-0 bottom-0 start-0 w-[2px] bg-primary",
                row.getIsSelected() && "block"
              )}
            ></div>
            <Checkbox
              checked={row.getIsSelected()}
              onCheckedChange={(value) => row.toggleSelected(!!value)}
              aria-label="Select row"
              size="sm"
              className="align-[inherit] mb-0.5 rounded-xs"
            />
          </>
        ),
        size: 40,
        enableSorting: false,
        enableHiding: false,
        enableResizing: false,
      },
      {
        accessorKey: "itemTitle",
        id: "itemTitle",
        header: ({ column }) => (
          <DataGridColumnHeader
            title="Item"
            visibility={true}
            column={column}
          />
        ),
        cell: ({ row }) => {
          const item = row.original;
          return (
            <div className="flex items-center gap-3">
              {item.itemImage && (
                <Avatar className="size-8">
                  <AvatarImage
                    src={item.itemImage}
                    alt={item.itemTitle}
                    className="rounded-sm"
                  />
                  <AvatarFallback className="rounded-sm">
                    <Package className="size-4" />
                  </AvatarFallback>
                </Avatar>
              )}
              <div className="space-y-px">
                <div className="font-medium text-foreground">
                  {item.itemTitle}
                </div>
                <div className="flex items-center gap-1 font-light">
                  <a
                    href={`https://myfigurecollection.net/item/${item.itemId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors underline-offset-4 hover:underline"
                  >
                    https://myfigurecollection.net/item/{item.itemId}
                  </a>
                  <p className="text-xs text-primary">
                    <span className="text-muted-foreground">•</span>{" "}
                    {item.itemCategory}
                  </p>
                </div>
              </div>
            </div>
          );
        },
        enableSorting: true,
        enableHiding: true,
        enableResizing: true,
        size: 450,
      },
      {
        accessorKey: "itemScale",
        id: "itemScale",
        header: ({ column }) => (
          <DataGridColumnHeader
            title="Scale"
            visibility={true}
            column={column}
          />
        ),
        cell: (info) => (info.getValue() as string | null) || "n/a",
        enableSorting: true,
        enableHiding: true,
        enableResizing: true,
        size: 100,
      },
      {
        accessorKey: "count",
        id: "count",
        header: ({ column }) => (
          <DataGridColumnHeader
            title="Count"
            visibility={true}
            column={column}
          />
        ),
        cell: ({ row }) => {
          const count = row.original.count;
          return <div className="text-sm">{count ?? "n/a"}</div>;
        },
        enableSorting: true,
        enableHiding: true,
        enableResizing: true,
        size: 80,
      },
      {
        accessorKey: "score",
        id: "score",
        header: ({ column }) => (
          <DataGridColumnHeader
            title="Score"
            visibility={true}
            column={column}
          />
        ),
        cell: ({ row }) => {
          const score = row.original.score;
          return <div className="text-sm">{score || "n/a"}</div>;
        },
        enableSorting: true,
        enableHiding: true,
        enableResizing: true,
        size: 80,
      },
      {
        accessorKey: "shop",
        id: "shop",
        header: ({ column }) => (
          <DataGridColumnHeader
            title="Shop"
            visibility={true}
            column={column}
          />
        ),
        cell: ({ row }) => {
          const shop = row.original.shop;
          return <div className="text-sm">{shop || "n/a"}</div>;
        },
        enableSorting: true,
        enableHiding: true,
        enableResizing: true,
        size: 120,
      },
      {
        accessorKey: "price",
        id: "price",
        header: ({ column }) => (
          <DataGridColumnHeader
            title="Price"
            visibility={true}
            column={column}
          />
        ),
        cell: ({ row }) => {
          const price = row.original.price;
          return (
            <div className="font-medium text-foreground">
              {formatCurrency(price)}
            </div>
          );
        },
        enableSorting: true,
        enableHiding: true,
        enableResizing: true,
        size: 100,
      },
      {
        accessorKey: "releaseDate",
        id: "releaseDate",
        header: ({ column }) => (
          <DataGridColumnHeader
            title="Release"
            visibility={true}
            column={column}
          />
        ),
        cell: (info) => (info.getValue() as string | null) || "n/a",
        enableSorting: true,
        enableHiding: true,
        enableResizing: true,
        size: 120,
      },
      {
        accessorKey: "collectionDate",
        id: "collectionDate",
        header: ({ column }) => (
          <DataGridColumnHeader
            title="Collected"
            visibility={true}
            column={column}
          />
        ),
        cell: ({ row }) => {
          const collectionDate = row.original.collectionDate;
          return (
            <div className="text-sm">
              {collectionDate ? formatDate(collectionDate) : "n/a"}
            </div>
          );
        },
        enableSorting: true,
        enableHiding: true,
        enableResizing: true,
        size: 120,
      },
      {
        id: "actions",
        header: () => null,
        cell: ({ row }) => {
          const item = row.original;

          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-8 w-8 p-0">
                  <span className="sr-only">Open menu</span>
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                <DropdownMenuItem asChild>
                  <Link to="/items/$id" params={{ id: item.itemId.toString() }}>
                    <Eye className="mr-2 h-4 w-4" />
                    View details
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    navigator.clipboard.writeText(item.itemId.toString());
                    toast.success("Copied MFC item ID to clipboard");
                  }}
                >
                  <Copy className="mr-2 h-4 w-4" />
                  Copy MFC item ID
                </DropdownMenuItem>
                <Dialog>
                  <DialogTrigger asChild>
                    <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                      <Edit className="mr-2 h-4 w-4" />
                      Edit item
                    </DropdownMenuItem>
                  </DialogTrigger>
                  <CollectionItemForm
                    itemData={item}
                    callbackFn={onEditCollectionItem}
                  />
                </Dialog>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() =>
                    onDeleteCollectionItems(new Set([item.collectionId]))
                  }
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete item
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
        size: 50,
        enableSorting: false,
        enableHiding: false,
        enableResizing: false,
      },
    ],
    [collectionSelection, setCollectionSelection]
  );
  const handlePaginationChange = (updater: Updater<PaginationState>) => {
    const newPagination =
      typeof updater === "function" ? updater(pagination) : updater;

    const newOffset = newPagination.pageIndex * newPagination.pageSize;
    onFilterChange({
      limit: newPagination.pageSize,
      offset: newOffset,
    });
  };

  const handleSortingChange = (updater: Updater<SortingState>) => {
    const newSorting =
      typeof updater === "function" ? updater(sorting) : updater;

    if (newSorting.length > 0) {
      const sortConfig = newSorting[0];
      onFilterChange({
        sort: sortConfig.id as
          | "itemTitle"
          | "itemCategory"
          | "itemScale"
          | "status"
          | "count"
          | "score"
          | "price"
          | "shop"
          | "releaseDate"
          | "collectionDate"
          | "createdAt",
        order: sortConfig.desc ? "desc" : "asc",
        offset: 0,
      });
    }
  };

  const table = useReactTable({
    columns,
    data: collection,
    pageCount: Math.ceil(totalCount / serverPagination.limit),
    getRowId: (row: CollectionItem) => row.collectionId,
    getRowCanExpand: () => true,
    state: {
      pagination,
      sorting,
      expanded: expandedRows,
      rowSelection: collectionSelection,
      columnOrder,
    },
    columnResizeMode: "onChange",
    onPaginationChange: handlePaginationChange,
    onSortingChange: handleSortingChange,
    onExpandedChange: setExpandedRows,
    onRowSelectionChange: setCollectionSelection,
    onColumnOrderChange: setColumnOrder,
    manualFiltering: true,
    manualSorting: true,
    manualPagination: true,
    getCoreRowModel: getCoreRowModel(),
    enableRowSelection: true,
  });

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
          />
        </Dialog>

        <Button onClick={onResetFilters} variant="outline">
          <ListRestart className="" />
          <span className="hidden md:block">Reset Filters</span>
        </Button>
        <Popover>
          <PopoverTrigger
            asChild
            disabled={getSelectedCollectionIds.size === 0}
          >
            <Button
              variant="outline"
              size="icon"
              disabled={getSelectedCollectionIds.size === 0}
            >
              <Trash className="stroke-white" />
            </Button>
          </PopoverTrigger>
          <PopoverContent>
            <div className="flex flex-col items-center gap-2 text-sm text-pretty">
              <div className="flex flex-row items-center gap-2">
                <p>Delete the selected collection items?</p>
              </div>
              <div className="flex flex-row items-center gap-2 max-w-16 mr-auto">
                <PopoverClose asChild>
                  <Button
                    variant="outline"
                    disabled={getSelectedCollectionIds.size === 0}
                    className="block"
                  >
                    Cancel
                  </Button>
                </PopoverClose>
                <PopoverClose asChild>
                  <Button
                    variant="destructive"
                    disabled={getSelectedCollectionIds.size === 0}
                    className="block"
                    onClick={() =>
                      onDeleteCollectionItems(getSelectedCollectionIds)
                    }
                  >
                    Delete
                  </Button>
                </PopoverClose>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>
      <div className="space-y-4">
        <DataGrid
          table={table}
          recordCount={totalCount}
          tableLayout={{
            columnsPinnable: true,
            columnsResizable: true,
            columnsMovable: true,
            columnsVisibility: true,
          }}
        >
          <div className="w-full space-y-2.5">
            <DataGridContainer>
              <ScrollArea>
                <DataGridTable />
                <ScrollBar orientation="horizontal" />
              </ScrollArea>
            </DataGridContainer>
            <div className="flex items-center justify-between">
              <div className="flex-1 text-sm text-muted-foreground">
                {table.getFilteredSelectedRowModel().rows.length} of{" "}
                {table.getFilteredRowModel().rows.length} row(s) selected
              </div>
              <DataGridPagination />
            </div>
          </div>
        </DataGrid>
      </div>
    </>
  );
};
