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
import { Package, MoreHorizontal, Copy, Eye, Edit, Trash2 } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import type { OrderItem } from "@/lib/types";

export function OrderItemsSubTable({
  items,
  orderId,
  itemSelection,
  setItemSelection,
}: {
  items: OrderItem[];
  orderId: string;
  itemSelection: RowSelectionState;
  setItemSelection: OnChangeFn<RowSelectionState>;
}) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 5,
  });

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
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            onClick={(e) => e.stopPropagation()}
            aria-label="Select row"
            size="sm"
            className="align-[inherit] mb-0.5 rounded-xs"
          />
        ),
        size: 10,
      },
      {
        accessorKey: "title",
        header: ({ column }) => (
          <DataGridColumnHeader title="Item" column={column} />
        ),
        cell: ({ row }) => {
          const item = row.original;
          return (
            <div className="flex items-center gap-3">
              {item.image && (
                <Avatar className="size-8">
                  <AvatarImage
                    src={item.image}
                    alt={item.title}
                    className="rounded-sm"
                  />
                  <AvatarFallback className="rounded-sm">
                    <Package className="size-4" />
                  </AvatarFallback>
                </Avatar>
              )}
              <div className="space-y-px">
                <div className="font-medium text-foreground">{item.title}</div>
                <Button
                  className="text-xs text-muted-foreground"
                  mode="link"
                  size="sm"
                  variant="ghost"
                >
                  <a
                    href={`https://myfigurecollection.net/item/${item.itemId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    https://myfigurecollection.net/item/{item.itemId}
                  </a>
                </Button>
              </div>
            </div>
          );
        },
        enableSorting: true,
        size: 190,
      },
      {
        accessorKey: "orderDate",
        header: ({ column }) => (
          <DataGridColumnHeader title="Order Date" column={column} />
        ),
        cell: (info) => info.getValue() as string,
        enableSorting: true,
        size: 30,
      },
      {
        accessorKey: "releaseDate",
        header: ({ column }) => (
          <DataGridColumnHeader title="Release" column={column} />
        ),
        cell: (info) => info.getValue() as string,
        enableSorting: true,
        size: 30,
      },
      {
        accessorKey: "count",
        header: ({ column }) => (
          <DataGridColumnHeader title="Count" column={column} />
        ),
        cell: (info) => info.getValue() as string,
        enableSorting: true,
        size: 30,
      },
      {
        accessorKey: "price",
        header: ({ column }) => (
          <DataGridColumnHeader title="Price" column={column} />
        ),
        cell: (info) => formatCurrency(info.getValue() as string),
        enableSorting: true,
        size: 30,
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
                  onClick={() =>
                    navigator.clipboard.writeText(item.itemId.toString())
                  }
                >
                  <Copy className="mr-2 h-4 w-4" />
                  Copy MFC item ID
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem>
                  <Eye className="mr-2 h-4 w-4" />
                  View details
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Edit className="mr-2 h-4 w-4" />
                  Edit item
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive">
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete order
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
        size: 20,
        enableSorting: false,
        enableHiding: false,
        enableResizing: false,
      },
    ],
    []
  );

  const subTable = useReactTable({
    data: items,
    columns,
    pageCount: Math.ceil(items.length / pagination.pageSize),
    state: {
      sorting,
      pagination,
      rowSelection: itemSelection,
    },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    onRowSelectionChange: setItemSelection,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getRowId: (row: OrderItem) => `${orderId}-${row.collectionId}`,
    enableRowSelection: true,
  });

  return (
    <div className="bg-muted/30 p-4" onClick={(e) => e.stopPropagation()}>
      <DataGrid
        table={subTable}
        recordCount={items.length}
        tableLayout={{
          cellBorder: true,
          rowBorder: true,
          headerBackground: true,
          headerBorder: true,
        }}
      >
        <div className="w-full space-y-2.5">
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
