import { useMemo, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge, badgeVariants } from "@/components/ui/badge";
import { type VariantProps } from "class-variance-authority";
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
import { formatCurrency } from "@/lib/utils";
import type { OrderItem } from "@/lib/orders/types";
import { toast } from "sonner";
import { Dialog, DialogTrigger } from "../ui/dialog";
import ItemForm from "./item-form";

function getItemStatusVariant(
  status: string
): VariantProps<typeof badgeVariants>["variant"] {
  switch (status.toLowerCase()) {
    case "owned":
      return "success";
    case "shipped":
      return "primary";
    case "paid":
      return "warning";
    case "ordered":
      return "info";
    case "sold":
      return "destructive";
    default:
      return "outline";
  }
}

export function OrderItemsSubTable({
  items,
  orderId,
  itemSelection,
  setItemSelection,
  onEditItem,
  onDeleteItem,
}: {
  items: OrderItem[];
  orderId: string;
  itemSelection: RowSelectionState;
  setItemSelection: OnChangeFn<RowSelectionState>;
  onEditItem: (
    orderId: string,
    itemId: string,
    values: OrderItem
  ) => Promise<void>;
  onDeleteItem: (orderId: string, itemId: string) => Promise<void>;
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
                <a
                  href={`https://myfigurecollection.net/item/${item.itemId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors underline-offset-4 hover:underline"
                >
                  https://myfigurecollection.net/item/{item.itemId}
                </a>
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
        accessorKey: "status",
        header: ({ column }) => (
          <DataGridColumnHeader title="Status" column={column} />
        ),
        cell: ({ row }) => {
          const status = row.original.status;
          return (
            <Badge variant={getItemStatusVariant(status)} appearance="outline">
              {status}
            </Badge>
          );
        },
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
                  <ItemForm
                    orderId={orderId}
                    itemData={item}
                    callbackFn={onEditItem}
                  />
                </Dialog>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={(e) => e.preventDefault()}
                  onClick={() => onDeleteItem(orderId, item.collectionId)}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete item
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
