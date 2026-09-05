import type { Dispatch, ReactNode, SetStateAction } from "react";
import type { Order } from "@myakiba/contracts/orders/types";
import type { CollectionItemFormValues } from "@myakiba/contracts/collection/types";
import { OrderItemSubDataGrid } from "@/components/orders/order-item-sub-data-grid";
import { Skeleton } from "@/components/ui/skeleton";

export function OrderDetailItems({
  orderId,
  order,
  isLoading,
  selectedOrderIdByCollectionId,
  setSelectedOrderIdByCollectionId,
  onEditItem,
  onDeleteItem,
  isCollectionItemPending,
}: {
  readonly orderId: string;
  readonly order: Order | undefined;
  readonly isLoading: boolean;
  readonly selectedOrderIdByCollectionId: ReadonlyMap<string, string>;
  readonly setSelectedOrderIdByCollectionId: Dispatch<SetStateAction<Map<string, string>>>;
  readonly onEditItem: (values: CollectionItemFormValues) => Promise<void>;
  readonly onDeleteItem: (orderId: string, itemId: string) => Promise<void>;
  readonly isCollectionItemPending: (collectionId: string) => boolean;
}): ReactNode {
  if (isLoading) {
    return (
      <section className="flex flex-1 flex-col gap-3" aria-busy="true">
        <OrderItemSubDataGrid
          isLoading
          wrapped={false}
          heading={
            <h2 className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
              Items (<Skeleton className="size-2 rounded-[2px]" />)
            </h2>
          }
          orderId={orderId}
          selectedOrderIdByCollectionId={selectedOrderIdByCollectionId}
          setSelectedOrderIdByCollectionId={setSelectedOrderIdByCollectionId}
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
      <OrderItemSubDataGrid
        wrapped={false}
        heading={
          <h2 className="text-xs font-medium text-muted-foreground">
            Items (<span className="animate-data-in">{order.itemCount}</span>)
          </h2>
        }
        orderId={orderId}
        selectedOrderIdByCollectionId={selectedOrderIdByCollectionId}
        setSelectedOrderIdByCollectionId={setSelectedOrderIdByCollectionId}
        onEditItem={onEditItem}
        onDeleteItem={onDeleteItem}
        isCollectionItemPending={isCollectionItemPending}
      />
    </section>
  );
}
