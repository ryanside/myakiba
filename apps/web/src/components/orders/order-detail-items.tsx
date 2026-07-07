import type { ReactNode } from "react";
import type { RowSelectionState } from "@tanstack/react-table";
import { HugeiconsIcon } from "@hugeicons/react";
import { PackageIcon } from "@hugeicons/core-free-icons";
import type { Order } from "@myakiba/contracts/orders/types";
import type { CollectionItemFormValues } from "@myakiba/contracts/collection/types";
import { OrderItemSubDataGrid } from "@/components/orders/order-item-sub-data-grid";
import { OrderItemSyncSheet } from "@/components/orders/order-item-sync-sheet";

export function OrderDetailItems({
  order,
  itemSelection,
  setItemSelection,
  onEditItem,
  onDeleteItem,
  isCollectionItemPending,
}: {
  readonly order: Order;
  readonly itemSelection: RowSelectionState;
  readonly setItemSelection: React.Dispatch<React.SetStateAction<RowSelectionState>>;
  readonly onEditItem: (values: CollectionItemFormValues) => Promise<void>;
  readonly onDeleteItem: (orderId: string, itemId: string) => Promise<void>;
  readonly isCollectionItemPending: (collectionId: string) => boolean;
}): ReactNode {
  return (
    <section className="flex flex-col gap-3 flex-1 animate-appear">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-medium text-muted-foreground">Items ({order.itemCount})</h2>
        {order.itemCount > 0 ? (
          <OrderItemSyncSheet orderId={order.orderId} label="Add Item" />
        ) : null}
      </div>
      {order.itemCount > 0 ? (
        <OrderItemSubDataGrid
          wrapped={false}
          orderId={order.orderId}
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
          <OrderItemSyncSheet orderId={order.orderId} label="Add First Item" />
        </div>
      )}
    </section>
  );
}
