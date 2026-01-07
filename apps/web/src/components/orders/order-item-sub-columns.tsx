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
import { DataGridColumnHeader } from "@/components/ui/data-grid-column-header";
import { Package, MoreHorizontal, Copy, Edit, Trash2 } from "lucide-react";
import { cn, formatDate, getCurrencyLocale } from "@/lib/utils";
import type { OrderItem } from "@/lib/orders/types";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import CollectionItemForm from "../collection/collection-item-form";
import type { CollectionItemFormValues } from "@/lib/collection/types";
import { PopoverDatePickerCell } from "../cells/popover-date-picker-cell";
import { InlineCountCell } from "../cells/inline-count-cell";
import { SelectCell } from "../cells/select-cell";
import { InlineCurrencyCell } from "../cells/inline-currency-cell";
import { type ColumnDef } from "@tanstack/react-table";

interface OrderItemSubColumnsParams {
  orderId: string;
  onEditItem: (values: CollectionItemFormValues) => Promise<void>;
  onDeleteItem: (orderId: string, itemId: string) => Promise<void>;
  currency: string;
}

export function createOrderItemSubColumns({
  orderId,
  onEditItem,
  onDeleteItem,
  currency,
}: OrderItemSubColumnsParams): ColumnDef<OrderItem>[] {
  return [
    {
      id: "select",
      header: ({ table }) => (
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && "indeterminate")
          }
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
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
        <DataGridColumnHeader title="Item" visibility={true} column={column} />
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
        <DataGridColumnHeader title="Count" visibility={true} column={column} />
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
        <DataGridColumnHeader title="Price" visibility={true} column={column} />
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
              <CollectionItemForm
                renderTrigger={
                  <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                    <Edit className="mr-2 h-4 w-4" />
                    Edit item
                  </DropdownMenuItem>
                }
                itemData={item}
                callbackFn={onEditItem}
              />
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
  ];
}
