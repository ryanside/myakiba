import type { ReactNode } from "react";
import type { RowSelectionState } from "@tanstack/react-table";
import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, PackageIcon } from "@hugeicons/core-free-icons";
import type { Order } from "@myakiba/contracts/orders/types";
import type { CollectionItemFormValues } from "@myakiba/contracts/collection/types";
import { OrderItemSubDataGrid } from "@/components/orders/order-item-sub-data-grid";
import { OrderItemSyncSheet } from "@/components/orders/order-item-sync-sheet";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export function OrderDetailItems({
  orderId,
  order,
  isLoading,
  itemSelection,
  setItemSelection,
  onEditItem,
  onDeleteItem,
  isCollectionItemPending,
}: {
  readonly orderId: string;
  readonly order: Order | undefined;
  readonly isLoading: boolean;
  readonly itemSelection: RowSelectionState;
  readonly setItemSelection: React.Dispatch<React.SetStateAction<RowSelectionState>>;
  readonly onEditItem: (values: CollectionItemFormValues) => Promise<void>;
  readonly onDeleteItem: (orderId: string, itemId: string) => Promise<void>;
  readonly isCollectionItemPending: (collectionId: string) => boolean;
}): ReactNode {
  if (isLoading) {
    return (
      <section className="flex flex-1 flex-col gap-3" aria-busy="true">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
            Items (<Skeleton className="size-2 rounded-[2px]" />)
          </h2>
          <Button size="sm" disabled>
            <HugeiconsIcon icon={Add01Icon} strokeWidth={2} />
            Add Item
          </Button>
        </div>
        <OrderItemSubDataGrid
          isLoading
          wrapped={false}
          orderId={orderId}
          itemSelection={itemSelection}
          setItemSelection={setItemSelection}
          onEditItem={onEditItem}
          onDeleteItem={onDeleteItem}
          isCollectionItemPending={isCollectionItemPending}
        />
      </section>
    );
  }

  if (!order) return null;

  return (
    <section className="flex flex-col gap-3 flex-1">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-medium text-muted-foreground">
          Items (<span className="animate-data-in">{order.itemCount}</span>)
        </h2>
        {order.itemCount > 0 ? <OrderItemSyncSheet orderId={orderId} label="Add Item" /> : null}
      </div>
      {order.itemCount > 0 ? (
        <OrderItemSubDataGrid
          wrapped={false}
          orderId={orderId}
          itemSelection={itemSelection}
          setItemSelection={setItemSelection}
          onEditItem={onEditItem}
          onDeleteItem={onDeleteItem}
          isCollectionItemPending={isCollectionItemPending}
        />
      ) : (
        <div className="flex flex-col items-center justify-center py-20 gap-4 rounded-xl border border-dashed">
          <div className="flex flex-col items-center gap-2">
            <HugeiconsIcon icon={PackageIcon} className="size-8 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">No items in this order yet</p>
          </div>
          <OrderItemSyncSheet orderId={orderId} label="Add First Item" />
        </div>
      )}
    </section>
  );
}
