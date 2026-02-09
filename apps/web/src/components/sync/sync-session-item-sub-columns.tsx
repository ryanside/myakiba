import type { ColumnDef } from "@tanstack/react-table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@tanstack/react-router";
import { Package } from "lucide-react";
import type { EnrichedSyncSessionItemRow, SyncSessionItemStatus } from "@myakiba/types";
import { ITEM_STATUS_CONFIG } from "@/lib/sync";

export function createSyncSessionItemSubColumns(): ColumnDef<EnrichedSyncSessionItemRow>[] {
  return [
    {
      accessorKey: "itemTitle",
      id: "item",
      header: () => <span className="text-foreground font-normal text-[0.8125rem]">Item</span>,
      cell: ({ row }) => {
        const item = row.original;

        if (item.itemId) {
          return (
            <div className="flex items-center gap-3">
              <Avatar className="size-8">
                {item.itemImage ? (
                  <AvatarImage
                    src={item.itemImage}
                    alt={item.itemTitle ?? ""}
                    className="rounded-sm"
                    style={{ objectFit: "cover", objectPosition: "top" }}
                  />
                ) : null}
                <AvatarFallback className="rounded-sm">
                  <Package className="size-4" />
                </AvatarFallback>
              </Avatar>
              <div className="space-y-px min-w-0">
                <Link
                  className="font-medium text-foreground truncate block"
                  to="/items/$id"
                  params={{ id: item.itemId }}
                >
                  {item.itemTitle ?? `Item ${item.itemExternalId}`}
                </Link>
                <a
                  href={`https://myfigurecollection.net/item/${item.itemExternalId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-muted-foreground font-light hover:text-foreground transition-colors underline-offset-4 hover:underline"
                >
                  MFC #{item.itemExternalId}
                </a>
              </div>
            </div>
          );
        }

        return (
          <div className="flex items-center gap-3">
            <div className="size-8 rounded-sm bg-muted flex items-center justify-center shrink-0">
              <Package className="size-4 text-muted-foreground" />
            </div>
            <a
              href={`https://myfigurecollection.net/item/${item.itemExternalId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono tabular-nums text-sm hover:text-foreground transition-colors underline-offset-4 hover:underline"
            >
              MFC #{item.itemExternalId}
            </a>
          </div>
        );
      },
      size: 350,
      enableSorting: false,
      enableHiding: false,
      enableResizing: false,
      meta: {
        skeleton: (
          <div className="flex items-center gap-3">
            <Skeleton className="size-8 rounded-sm" />
            <div className="space-y-1">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
        ),
      },
    },
    {
      accessorKey: "status",
      id: "status",
      header: () => <span className="text-foreground font-normal text-[0.8125rem]">Status</span>,
      cell: ({ row }) => {
        const config = ITEM_STATUS_CONFIG[row.original.status as SyncSessionItemStatus];
        return (
          <Badge variant={config.variant} appearance="light" size="sm">
            {config.label}
          </Badge>
        );
      },
      size: 100,
      enableSorting: false,
      enableHiding: false,
      enableResizing: false,
      meta: {
        skeleton: <Skeleton className="h-5 w-16 rounded-full" />,
      },
    },
    {
      accessorKey: "errorReason",
      id: "errorReason",
      header: () => <span className="text-foreground font-normal text-[0.8125rem]">Error</span>,
      cell: ({ row }) => {
        const errorReason = row.original.errorReason;
        if (!errorReason) return <span className="text-muted-foreground">-</span>;
        return (
          <span
            className="text-xs text-destructive truncate block max-w-[200px]"
            title={errorReason}
          >
            {errorReason}
          </span>
        );
      },
      size: 200,
      enableSorting: false,
      enableHiding: false,
      enableResizing: false,
      meta: {
        skeleton: <Skeleton className="h-4 w-28" />,
      },
    },
    {
      accessorKey: "retryCount",
      id: "retryCount",
      header: () => (
        <span className="text-foreground font-normal text-[0.8125rem] block">Retries</span>
      ),
      cell: ({ row }) => (
        <span className="block tabular-nums text-muted-foreground">{row.original.retryCount}</span>
      ),
      size: 80,
      enableSorting: false,
      enableHiding: false,
      enableResizing: false,
      meta: {
        skeleton: <Skeleton className="h-5 w-6" />,
      },
    },
  ];
}
