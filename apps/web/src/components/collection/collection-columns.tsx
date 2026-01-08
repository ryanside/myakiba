import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { InlineTextCell } from "@/components/cells/inline-text-cell";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DataGridColumnHeader } from "@/components/ui/data-grid-column-header";
import { MoreHorizontal, Eye, Edit, Trash2, Package, Copy } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { getCurrencyLocale, getCategoryColor } from "@myakiba/utils";
import { type ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";
import CollectionItemForm from "./collection-item-form";
import { InlineCurrencyCell } from "../cells/inline-currency-cell";
import { PopoverRatingCell } from "../cells/popover-rating-cell";
import { PopoverDatePickerCell } from "../cells/popover-date-picker-cell";
import { InlineCountCell } from "../cells/inline-count-cell";
import type {
  CollectionItem,
  CollectionItemFormValues,
} from "@/lib/collection/types";

interface CollectionColumnsParams {
  onEditCollectionItem: (values: CollectionItemFormValues) => void;
  onDeleteCollectionItems: (collectionIds: Set<string>) => Promise<void>;
  currency: string;
}

export function createCollectionColumns({
  onEditCollectionItem,
  onDeleteCollectionItems,
  currency,
}: CollectionColumnsParams): ColumnDef<CollectionItem>[] {
  return [
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
              <Avatar className="size-8 ">
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
                to="/items/$id"
                params={{ id: item.itemId.toString() }}
                className="font-medium text-foreground truncate"
              >
                {item.itemTitle}
              </Link>
              <div className="flex items-center gap-1 font-light">
                <a
                  href={`https://myfigurecollection.net/item/${item.itemId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors underline-offset-4 hover:underline"
                >
                  https://myfigurecollection.net/item/{item.itemId}
                </a>
                <p
                  className="text-xs"
                  style={{ color: getCategoryColor(item.itemCategory) }}
                >
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
        const item = row.original;
        return (
          <InlineCountCell
            value={item.count}
            onSubmit={async (newValue) => {
              await onEditCollectionItem({
                ...item,
                count: newValue,
              });
            }}
          />
        );
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
        const item = row.original;
        return (
          <PopoverRatingCell
            value={item.score}
            onSubmit={async (newValue) => {
              await onEditCollectionItem({
                ...item,
                score: newValue,
              });
            }}
          />
        );
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
        const item = row.original;
        return (
          <InlineTextCell
            value={item.shop}
            onSubmit={async (newValue) => {
              await onEditCollectionItem({
                ...item,
                shop: newValue,
              });
            }}
            validate={(value) => {
              if (!value || value.trim().length === 0) {
                return "Shop cannot be empty";
              }
              return true;
            }}
            previewClassName="text-sm"
          />
        );
      },
      enableSorting: true,
      enableHiding: true,
      enableResizing: true,
      size: 120,
    },
    {
      accessorKey: "price",
      accessorFn: (row) => Number(row.price),
      id: "price",
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
              await onEditCollectionItem({
                ...item,
                price: newValue,
              });
            }}
            locale={getCurrencyLocale(currency)}
            disabled={false}
          />
        );
      },
      enableSorting: true,
      enableHiding: true,
      enableResizing: true,
      size: 100,
    },
    {
      accessorKey: "orderDate",
      id: "orderDate",
      header: ({ column }) => (
        <DataGridColumnHeader
          title="Order Date"
          visibility={true}
          column={column}
        />
      ),
      cell: ({ row }) => {
        const orderDate = row.original.orderDate;
        return (
          <PopoverDatePickerCell
            value={orderDate}
            onSubmit={async (newValue) => {
              await onEditCollectionItem({
                ...row.original,
                orderDate: newValue,
              });
            }}
          />
        );
      },
      enableSorting: true,
      enableHiding: true,
      enableResizing: true,
      size: 120,
      meta: {
        headerTitle: "Order Date",
      },
    },
    {
      accessorKey: "paymentDate",
      id: "paymentDate",
      header: ({ column }) => (
        <DataGridColumnHeader
          title="Payment Date"
          visibility={true}
          column={column}
        />
      ),
      cell: ({ row }) => {
        const paymentDate = row.original.paymentDate;
        return (
          <PopoverDatePickerCell
            value={paymentDate}
            onSubmit={async (newValue) => {
              await onEditCollectionItem({
                ...row.original,
                paymentDate: newValue,
              });
            }}
          />
        );
      },
      enableSorting: true,
      enableHiding: true,
      enableResizing: true,
      size: 120,
      meta: {
        headerTitle: "Payment Date",
      },
    },
    {
      accessorKey: "shippingDate",
      id: "shippingDate",
      header: ({ column }) => (
        <DataGridColumnHeader
          title="Shipping Date"
          visibility={true}
          column={column}
        />
      ),
      cell: ({ row }) => {
        const shippingDate = row.original.shippingDate;
        return (
          <PopoverDatePickerCell
            value={shippingDate}
            onSubmit={async (newValue) => {
              await onEditCollectionItem({
                ...row.original,
                shippingDate: newValue,
              });
            }}
          />
        );
      },
      enableSorting: true,
      enableHiding: true,
      enableResizing: true,
      size: 120,
      meta: {
        headerTitle: "Shipping Date",
      },
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
          <PopoverDatePickerCell
            value={collectionDate}
            onSubmit={async (newValue) => {
              await onEditCollectionItem({
                ...row.original,
                collectionDate: newValue,
              });
            }}
          />
        );
      },
      enableSorting: true,
      enableHiding: true,
      enableResizing: true,
      size: 120,
      meta: {
        headerTitle: "Collection Date",
      },
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
              <CollectionItemForm
                renderTrigger={
                  <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                    <Edit className="mr-2 h-4 w-4" />
                    Edit item
                  </DropdownMenuItem>
                }
                itemData={item}
                callbackFn={onEditCollectionItem}
                currency={currency}
              />
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={() => onDeleteCollectionItems(new Set([item.id]))}
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
  ];
}

