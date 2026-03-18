import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowLeft01Icon,
  Calendar01Icon,
  CreditCardIcon,
  Edit01Icon,
  FileAttachmentIcon,
  PackageIcon,
  UserGroupIcon,
} from "@hugeicons/core-free-icons";
import { createFileRoute, useParams, Link } from "@tanstack/react-router";
import { getOrder, editOrder, deleteOrderItem } from "@/queries/orders";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/reui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrencyFromMinorUnits, formatDate, formatTimestamp } from "@myakiba/utils";
import { getStatusVariant } from "@/lib/orders";
import { OrderItemSubDataGrid } from "@/components/orders/order-item-sub-data-grid";
import { useCallback, useMemo, useRef, useState } from "react";
import type { RowSelectionState } from "@tanstack/react-table";
import { OrderForm } from "@/components/orders/order-form";
import type { EditedOrder, CascadeOptions } from "@myakiba/types";
import { toast } from "sonner";
import type { CollectionItemFormValues } from "@myakiba/types";
import { updateCollectionItem } from "@/queries/collection";
import Loader from "@/components/loader";
import type { DateFormat } from "@myakiba/types";

export const Route = createFileRoute("/(app)/orders_/$id")({
  component: RouteComponent,
  head: ({ params }) => ({
    meta: [
      {
        name: "description",
        content: `order ${params.id} details`,
      },
      {
        title: `Order ${params.id} - myakiba`,
      },
    ],
  }),
});

function RouteComponent() {
  const { session } = Route.useRouteContext();
  const userCurrency = session?.user.currency;
  const dateFormat = session?.user.dateFormat as DateFormat;
  const { id } = useParams({ from: "/(app)/orders_/$id" });
  const queryClient = useQueryClient();
  const [itemSelection, setItemSelection] = useState<RowSelectionState>({});
  const [pendingCollectionItemIdList, setPendingCollectionItemIdList] = useState<readonly string[]>(
    [],
  );
  const pendingCollectionItemIds = useMemo(
    () => new Set(pendingCollectionItemIdList),
    [pendingCollectionItemIdList],
  );
  const pendingCollectionItemIdsRef = useRef<ReadonlySet<string>>(pendingCollectionItemIds);
  pendingCollectionItemIdsRef.current = pendingCollectionItemIds;
  const isCollectionItemPending = useCallback((collectionId: string): boolean => {
    return pendingCollectionItemIdsRef.current.has(collectionId);
  }, []);

  const { data, isPending, isError, error } = useQuery({
    queryKey: ["order", id],
    queryFn: () => getOrder(id),
    staleTime: 1000 * 60 * 5,
    retry: false,
  });

  // TODO: add delete order mutation

  const editOrderMutation = useMutation({
    mutationFn: async ({
      values,
      cascadeOptions,
    }: {
      values: EditedOrder;
      cascadeOptions: CascadeOptions;
    }) => {
      return await editOrder(values, cascadeOptions);
    },
    // TODO: add optimistic update
    onSuccess: () => {},
    onError: (error) => {
      toast.error("Failed to update order. Please try again.", {
        description: `Error: ${error.message}`,
      });
    },
    onSettled: async () => {
      await queryClient.invalidateQueries();
    },
  });

  const editItemMutation = useMutation({
    mutationFn: async ({ values }: { values: CollectionItemFormValues }) => {
      return await updateCollectionItem(values);
    },
    // TODO: add optimistic update
    onSuccess: () => {},
    onError: (error) => {
      toast.error("Failed to update item. Please try again.", {
        description: `Error: ${error.message}`,
      });
    },
    onSettled: async () => {
      await queryClient.invalidateQueries();
    },
  });

  const deleteItemMutation = useMutation({
    mutationFn: async ({ orderId, collectionId }: { orderId: string; collectionId: string }) => {
      return await deleteOrderItem(orderId, collectionId);
    },
    // TODO: add optimistic update
    onSuccess: () => {},
    onError: (error) => {
      toast.error("Failed to delete item. Please try again.", {
        description: `Error: ${error.message}`,
      });
    },
    onSettled: async () => {
      await queryClient.invalidateQueries();
    },
  });

  const handleEditOrder = async (values: EditedOrder, cascadeOptions: CascadeOptions) => {
    await editOrderMutation.mutateAsync({ values, cascadeOptions });
  };

  const handleEditItem = async (values: CollectionItemFormValues) => {
    setPendingCollectionItemIdList((previous) => Array.from(new Set([...previous, values.id])));

    try {
      await editItemMutation.mutateAsync({ values });
    } finally {
      setPendingCollectionItemIdList((previous) =>
        previous.filter((collectionId) => collectionId !== values.id),
      );
    }
  };

  const handleDeleteItem = async (orderId: string, collectionId: string) => {
    setPendingCollectionItemIdList((previous) => Array.from(new Set([...previous, collectionId])));

    try {
      await deleteItemMutation.mutateAsync({ orderId, collectionId });
    } finally {
      setPendingCollectionItemIdList((previous) =>
        previous.filter((pendingId) => pendingId !== collectionId),
      );
    }
  };

  if (isPending) {
    return <Loader />;
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-y-4">
        <div className="text-lg font-medium text-destructive">Error: {error.message}</div>
        <Button variant="outline">
          <Link to="/orders" className="flex items-center gap-1.5">
            <HugeiconsIcon icon={ArrowLeft01Icon} />
            Back to Orders
          </Link>
        </Button>
      </div>
    );
  }

  const { order } = data;

  // Calculate financial details
  const itemsTotal = order.items.reduce((sum, item) => sum + item.price * item.count, 0);
  const shippingFee = order.shippingFee ?? 0;
  const taxes = order.taxes ?? 0;
  const duties = order.duties ?? 0;
  const tariffs = order.tariffs ?? 0;
  const miscFees = order.miscFees ?? 0;
  const totalAmount = order.total ?? 0;

  return (
    <div className="flex flex-col gap-6 min-h-full">
      {/* Header Section */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost">
            <Link to="/orders" className="flex items-center gap-1.5">
              <HugeiconsIcon icon={ArrowLeft01Icon} />
              Back to Orders
            </Link>
          </Button>
          <div className="flex flex-row items-center gap-x-2">
            <h1 className="text-2xl font-medium text-foreground">{order.title}</h1>
            <Badge variant={getStatusVariant(order.status)} className="text-sm" size="lg">
              {order.status}
            </Badge>
          </div>
        </div>
        <div className="flex items-center gap-x-2">
          <OrderForm
            renderTrigger={
              <Button variant="outline">
                <HugeiconsIcon icon={Edit01Icon} className="size-4" />
                Edit Order
              </Button>
            }
            type="edit-order"
            orderData={order}
            callbackFn={handleEditOrder}
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* Order Information */}
        <Card className="shadow-none">
          <CardHeader className="flex flex-row items-center gap-2 pb-2">
            <div className="flex items-center gap-x-2">
              <HugeiconsIcon icon={PackageIcon} className="size-4 text-muted-foreground" />
              <CardTitle className="text-sm font-medium">Order Details</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Order ID:</span>
              <span className="text-sm font-medium">{order.orderId}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Shop:</span>
              <span className="text-sm font-medium">{order.shop || "N/A"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Items:</span>
              <span className="text-sm font-medium">{order.itemCount}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Shipping Method:</span>
              <span className="text-sm font-medium">{order.shippingMethod}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Release Period:</span>
              <span className="text-sm font-medium">
                {order.releaseDate ? formatDate(order.releaseDate, dateFormat) : "N/A"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Created:</span>
              <span className="text-sm font-medium">
                {formatTimestamp(order.createdAt, dateFormat)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Last Updated:</span>
              <span className="text-sm font-medium">
                {formatTimestamp(order.updatedAt, dateFormat)}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Timeline */}
        <Card className="shadow-none">
          <CardHeader className="flex flex-row items-center gap-2 pb-2">
            <div className="flex items-center gap-x-2">
              <HugeiconsIcon icon={Calendar01Icon} className="size-4 text-muted-foreground" />
              <CardTitle className="text-sm font-medium">Timeline</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Ordered:</span>
              <span className="text-sm font-medium">
                {order.orderDate ? formatDate(order.orderDate, dateFormat) : "N/A"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Paid:</span>
              <span className="text-sm font-medium">
                {order.paymentDate ? formatDate(order.paymentDate, dateFormat) : "N/A"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Shipped:</span>
              <span className="text-sm font-medium">
                {order.shippingDate ? formatDate(order.shippingDate, dateFormat) : "N/A"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Collected:</span>
              <span className="text-sm font-medium">
                {order.collectionDate ? formatDate(order.collectionDate, dateFormat) : "N/A"}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Financial Summary */}
        <Card className="shadow-none">
          <CardHeader className="flex flex-row items-center gap-2 pb-2">
            <div className="flex items-center gap-x-2">
              <HugeiconsIcon icon={CreditCardIcon} className="size-4 text-muted-foreground" />
              <CardTitle className="text-sm font-medium">Financial Summary</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Items Total:</span>
              <span className="text-sm font-medium">
                {formatCurrencyFromMinorUnits(itemsTotal, userCurrency)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Shipping:</span>
              <span className="text-sm font-medium">
                {formatCurrencyFromMinorUnits(shippingFee, userCurrency)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Taxes:</span>
              <span className="text-sm font-medium">
                {formatCurrencyFromMinorUnits(taxes, userCurrency)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Duties:</span>
              <span className="text-sm font-medium">
                {formatCurrencyFromMinorUnits(duties, userCurrency)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Tariffs:</span>
              <span className="text-sm font-medium">
                {formatCurrencyFromMinorUnits(tariffs, userCurrency)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Misc Fees:</span>
              <span className="text-sm font-medium">
                {formatCurrencyFromMinorUnits(miscFees, userCurrency)}
              </span>
            </div>
            <div className="flex items-center justify-between font-medium">
              <span className="text-sm">Total Amount:</span>
              <span className="text-sm">
                {formatCurrencyFromMinorUnits(totalAmount, userCurrency)}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Notes Section */}
      {order.notes && (
        <Card>
          <CardHeader className="flex flex-row items-center gap-2 pb-2">
            <div className="flex items-center gap-x-2">
              <HugeiconsIcon icon={FileAttachmentIcon} className="size-4 text-muted-foreground" />
              <CardTitle className="text-sm font-medium">Notes</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{order.notes}</p>
          </CardContent>
        </Card>
      )}

      {/* Order Items */}
      <Card className="shadow-none flex-1">
        <CardHeader className="flex flex-row items-center gap-2 pb-2">
          <div className="flex items-center gap-x-2">
            <HugeiconsIcon icon={UserGroupIcon} className="size-4 text-muted-foreground" />
            <CardTitle className="text-sm font-medium">Order Items ({order.itemCount})</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {order.items.length > 0 ? (
            <OrderItemSubDataGrid
              orderId={order.orderId}
              itemSelection={itemSelection}
              setItemSelection={setItemSelection}
              onEditItem={handleEditItem}
              onDeleteItem={handleDeleteItem}
              isCollectionItemPending={isCollectionItemPending}
            />
          ) : (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <HugeiconsIcon icon={PackageIcon} className="size-5" />
              No items in this order
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
