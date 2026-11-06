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
}: {
  readonly orderId: string;
  readonly order: Order | undefined;
  readonly isLoading: boolean;
  readonly selectedOrderIdByCollectionId: ReadonlyMap<string, string>;
  readonly setSelectedOrderIdByCollectionId: Dispatch<SetStateAction<Map<string, string>>>;
  readonly onEditItem: (values: CollectionItemFormValues) => Promise<void>;
  readonly onDeleteItem: (orderId: string, itemId: string) => Promise<void>;
}): ReactNode {
  if (isLoading) {
    return (
      <section className="flex flex-col gap-3" aria-busy="true">
        <OrderItemSubDataGrid
          isLoading
          wrapped={false}
          heading={
            <h2 className="flex items-center gap-1 text-base font-medium text-foreground">
              Items (<Skeleton className="size-2 rounded-[2px]" />)
            </h2>
          }
          orderId={orderId}
          selectedOrderIdByCollectionId={selectedOrderIdByCollectionId}
          setSelectedOrderIdByCollectionId={setSelectedOrderIdByCollectionId}
          onEditItem={onEditItem}
          onDeleteItem={onDeleteItem}
        />
      </section>
    );
  }

  if (!order) return null;

  return (
    <section className="flex flex-col gap-3">
      <OrderItemSubDataGrid
        wrapped={false}
        heading={
          <h2 className="text-base font-medium text-foreground">
            Items (<span className="animate-data-in">{order.itemCount}</span>)
          </h2>
        }
        orderId={orderId}
        selectedOrderIdByCollectionId={selectedOrderIdByCollectionId}
        setSelectedOrderIdByCollectionId={setSelectedOrderIdByCollectionId}
        onEditItem={onEditItem}
        onDeleteItem={onDeleteItem}
      />
    </section>
  );
}
