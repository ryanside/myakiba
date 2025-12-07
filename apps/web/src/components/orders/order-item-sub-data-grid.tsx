import { useMemo, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DataGrid, DataGridContainer } from "@/components/ui/data-grid";
import { DataGridPagination } from "@/components/ui/data-grid-pagination";
import { DataGridTable } from "@/components/ui/data-grid-table";
import { DataGridColumnHeader } from "@/components/ui/data-grid-column-header";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import {
  type ColumnDef,
  type RowSelectionState,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type PaginationState,
  type SortingState,
  useReactTable,
  type OnChangeFn,
} from "@tanstack/react-table";
import { Package, MoreHorizontal, Copy, Edit, Trash2 } from "lucide-react";
import { cn, formatDate, getCurrencyLocale } from "@/lib/utils";
import type { OrderItem } from "@/lib/orders/types";
import { toast } from "sonner";
import { Dialog, DialogTrigger } from "../ui/dialog";
import { Link } from "@tanstack/react-router";
import CollectionItemForm from "../collection/collection-item-form";
import type { CollectionItemFormValues } from "@/lib/collection/types";
import { PopoverDatePickerCell } from "../cells/popover-date-picker-cell";
import { InlineCountCell } from "../cells/inline-count-cell";
import { SelectCell } from "../cells/select-cell";
import { InlineCurrencyCell } from "../cells/inline-currency-cell";

export function OrderItemSubDataGrid({
  items,
  orderId,
  itemSelection,
  setItemSelection,
  onEditItem,
  onDeleteItem,
  currency = "USD",
}: {
  items: OrderItem[];
  orderId: string;
  itemSelection: RowSelectionState;
  setItemSelection: OnChangeFn<RowSelectionState>;
  onEditItem: (values: CollectionItemFormValues) => Promise<void>;
  onDeleteItem: (orderId: string, itemId: string) => Promise<void>;
  currency?: string;
}) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 5,
  });
  const [columnOrder, setColumnOrder] = useState<string[]>([
    "select",
    "title",
    "orderDate",
    "releaseDate",
    "count",
    "price",
    "status",
    "actions",
  ]);

  const columns = useMemo<ColumnDef<OrderItem>[]>(
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
            onClick={(e) => e.stopPropagation()}
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
              onClick={(e) => e.stopPropagation()}
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
        accessorKey: "title",
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
                    style={{ objectFit: "cover", objectPosition: "top" }}
                  />
                  <AvatarFallback className="rounded-sm">
                    <Package className="size-4" />
                  </AvatarFallback>
                </Avatar>
              )}
              <div className="space-y-px">
                <Link
                  className="font-medium text-foreground truncate"
                  to="/items/$id"
                  params={{ id: item.itemId.toString() }}
                >
                  {item.itemTitle}
                </Link>
                <div className="flex items-center gap-1 font-light">
                  <a
                    href={`https://myfigurecollection.net/item/${item.itemId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-muted-foreground font-light hover:text-foreground transition-colors underline-offset-4 hover:underline"
                  >
                    https://myfigurecollection.net/item/{item.itemId}
                  </a>
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
        accessorKey: "orderDate",
        header: ({ column }) => (
          <DataGridColumnHeader
            title="Order Date"
            visibility={true}
            column={column}
          />
        ),
        cell: ({ row }) => {
          const item = row.original;
          return (
            <PopoverDatePickerCell
              value={item.orderDate}
              onSubmit={async (newValue) => {
                await onEditItem({ ...item, orderDate: newValue });
              }}
            />
          );
        },
        enableSorting: true,
        enableHiding: true,
        enableResizing: true,
        size: 100,
      },
      {
        accessorKey: "releaseDate",
        header: ({ column }) => (
          <DataGridColumnHeader
            title="Release"
            visibility={true}
            column={column}
          />
        ),
        cell: (info) => formatDate(info.getValue() as string),
        enableSorting: true,
        enableHiding: true,
        enableResizing: true,
        size: 100,
      },
      {
        accessorKey: "count",
        header: ({ column }) => (
          <DataGridColumnHeader
            title="Count"
            visibility={true}
            column={column}
          />
        ),
        cell: ({ row }) => {
          const item = row.original;
          return (
            <InlineCountCell
              value={item.count}
              onSubmit={async (newValue) => {
                await onEditItem({ ...item, count: newValue });
              }}
            />
          );
        },
        enableSorting: true,
        enableHiding: true,
        enableResizing: true,
        size: 70,
      },
      {
        accessorKey: "status",
        header: ({ column }) => (
          <DataGridColumnHeader
            title="Status"
            visibility={true}
            column={column}
          />
        ),
        cell: ({ row }) => {
          const item = row.original;
          return (
            <SelectCell
              value={item.status}
              options={["Ordered", "Paid", "Shipped", "Owned"]}
              onSubmit={async (value) => {
                await onEditItem({
                  ...item,
                  status: value as "Ordered" | "Paid" | "Shipped" | "Owned",
                });
              }}
            />
          );
        },
        enableSorting: true,
        enableHiding: true,
        enableResizing: true,
        size: 95,
      },
      {
        accessorKey: "price",
        accessorFn: (row) => Number(row.price),
        header: ({ column }) => (
          <DataGridColumnHeader
            title="Price"
            visibility={true}
            column={column}
          />
        ),
        cell: ({ row }) => {
          const item = row.original;
          return (
            <InlineCurrencyCell
              value={item.price}
              currency={currency}
              onSubmit={async (newValue) => {
                await onEditItem({ ...item, price: newValue });
              }}
              locale={getCurrencyLocale(currency)}
              disabled={false}
            />
          );
        },
        enableSorting: true,
        enableHiding: true,
        enableResizing: true,
        size: 95,
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
                  <CollectionItemForm itemData={item} callbackFn={onEditItem} />
                </Dialog>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={(e) => e.preventDefault()}
                  onClick={() => onDeleteItem(orderId, item.id)}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete item
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
        size: 60,
        enableSorting: false,
        enableHiding: false,
        enableResizing: false,
      },
    ],
    [currency, onDeleteItem, onEditItem, orderId]
  );

  const subTable = useReactTable({
    data: items,
    columns,
    pageCount: Math.ceil(items.length / pagination.pageSize),
    state: {
      sorting,
      pagination,
      rowSelection: itemSelection,
      columnOrder,
    },
    columnResizeMode: "onChange",
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    onRowSelectionChange: setItemSelection,
    onColumnOrderChange: setColumnOrder,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getRowId: (row: OrderItem) => `${orderId}-${row.id}`,
    enableRowSelection: true,
  });

  return (
    <div className="bg-muted/30 p-4" onClick={(e) => e.stopPropagation()}>
      <DataGrid
        table={subTable}
        recordCount={items.length}
        tableLayout={{
          rowBorder: true,
          headerBackground: true,
          headerBorder: true,
          columnsPinnable: true,
          columnsResizable: true,
          columnsMovable: true,
          columnsVisibility: true,
        }}
      >
        <div className="w-full space-y-2.5 overflow-x-auto">
          <div className="bg-card rounded-lg">
            <DataGridContainer>
              <ScrollArea>
                <DataGridTable />
                <ScrollBar orientation="horizontal" />
              </ScrollArea>
            </DataGridContainer>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex-1 text-sm text-muted-foreground">
              {subTable.getFilteredSelectedRowModel().rows.length} of{" "}
              {subTable.getFilteredRowModel().rows.length} item(s) selected
            </div>
            <DataGridPagination className="pb-1.5" />
          </div>
        </div>
      </DataGrid>
    </div>
  );
}
