import { createFileRoute, useParams, Link } from "@tanstack/react-router";
import { getOrder, editOrder, deleteOrderItem } from "@/queries/orders";
import {
  keepPreviousData,
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate } from "@/lib/utils";
import { getStatusVariant } from "@/lib/orders/utils";
import { OrderItemSubDataGrid } from "@/components/orders/order-item-sub-data-grid";
import { useState, useEffect } from "react";
import type { RowSelectionState } from "@tanstack/react-table";
import { addRecentItem } from "@/lib/recent-items";
import {
  Calendar,
  Package,
  CreditCard,
  ArrowLeft,
  Edit,
  FileText,
  Users,
} from "lucide-react";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import { OrderForm } from "@/components/orders/order-form";
import type { EditedOrder, CascadeOptions } from "@/lib/orders/types";
import { toast } from "sonner";
import type { CollectionItemFormValues } from "@/lib/collection/types";
import { updateCollectionItem } from "@/queries/collection";
import { authClient } from "@/lib/auth-client";
import { OrderDetailSkeleton } from "@/components/skeletons/order-detail-skeleton";

export const Route = createFileRoute("/(app)/orders_/$id")({
  component: RouteComponent,
  head: ({ params }) => ({
    meta: [
      {
        name: "description",
        content: `order ${params.id} details`,
      },
      {
        title: `Order ${params.id} — myakiba`,
      },
    ],
    links: [
      {
        rel: "icon",
        href: "/favicon.ico",
      },
    ],
    scripts: [],
  }),
});

function RouteComponent() {
  const { data: session } = authClient.useSession();
  const userCurrency = session?.user.currency || "USD";
  const { id } = useParams({ from: "/(app)/orders_/$id" });
  const queryClient = useQueryClient();
  const [itemSelection, setItemSelection] = useState<RowSelectionState>({});

  const { data, isPending, isError, error } = useQuery({
    queryKey: ["order", id],
    queryFn: () => getOrder(id),
    placeholderData: keepPreviousData,
    staleTime: 1000 * 60 * 5,
    retry: false,
  });

  // Track recently viewed order
  useEffect(() => {
    if (data?.order) {
      const images = data.order.items
        ?.map((item) => item.itemImage)
        .filter((img): img is string => Boolean(img))
        .slice(0, 4) || [];
      addRecentItem({
        id: data.order.orderId,
        type: "order",
        title: data.order.title,
        images,
      });
    }
  }, [data?.order]);

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
    onSuccess: () => {
    },
    onError: (error) => {
      toast.error("Failed to update order. Please try again.", {
        description: `Error: ${error.message}`,
      });
    },
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["order", id] }),
        queryClient.invalidateQueries({ queryKey: ["item"] }),
        queryClient.invalidateQueries({ queryKey: ["orders"] }),
        queryClient.invalidateQueries({ queryKey: ["order"] }),
        queryClient.invalidateQueries({ queryKey: ["collection"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["analytics"] }),
      ]);
    },
  });

  const editItemMutation = useMutation({
    mutationFn: async ({ values }: { values: CollectionItemFormValues }) => {
      return await updateCollectionItem(values);
    },
    // TODO: add optimistic update
    onSuccess: () => {
    },
    onError: (error) => {
      toast.error("Failed to update item. Please try again.", {
        description: `Error: ${error.message}`,
      });
    },
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["order", id] }),
        queryClient.invalidateQueries({ queryKey: ["item"] }),
        queryClient.invalidateQueries({ queryKey: ["orders"] }),
        queryClient.invalidateQueries({ queryKey: ["order"] }),
        queryClient.invalidateQueries({ queryKey: ["collection"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["analytics"] }),
      ]);
    },
  });

  const deleteItemMutation = useMutation({
    mutationFn: async ({
      orderId,
      collectionId,
    }: {
      orderId: string;
      collectionId: string;
    }) => {
      return await deleteOrderItem(orderId, collectionId);
    },
    // TODO: add optimistic update
    onSuccess: () => {
    },
    onError: (error) => {
      toast.error("Failed to delete item. Please try again.", {
        description: `Error: ${error.message}`,
      });
    },
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["order", id] }),
        queryClient.invalidateQueries({ queryKey: ["item"] }),
        queryClient.invalidateQueries({ queryKey: ["orders"] }),
        queryClient.invalidateQueries({ queryKey: ["order"] }),
        queryClient.invalidateQueries({ queryKey: ["collection"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["analytics"] }),
      ]);
    },
  });

  const handleEditOrder = async (
    values: EditedOrder,
    cascadeOptions: CascadeOptions
  ) => {
    await editOrderMutation.mutateAsync({ values, cascadeOptions });
  };

  const handleEditItem = async (values: CollectionItemFormValues) => {
    await editItemMutation.mutateAsync({ values });
  };

  const handleDeleteItem = async (orderId: string, collectionId: string) => {
    await deleteItemMutation.mutateAsync({ orderId, collectionId });
  };

  if (isPending) {
    return <OrderDetailSkeleton />;
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-y-4">
        <div className="text-lg font-medium text-destructive">
          Error: {error.message}
        </div>
        <Button asChild variant="outline">
          <Link to="/orders">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Orders
          </Link>
        </Button>
      </div>
    );
  }

  const { order } = data;

  // Calculate financial details
  const itemsTotal = order.items.reduce(
    (sum, item) => sum + parseFloat(item.price) * item.count,
    0
  );
  const shippingFee = parseFloat(order.shippingFee || "0");
  const taxes = parseFloat(order.taxes || "0");
  const duties = parseFloat(order.duties || "0");
  const tariffs = parseFloat(order.tariffs || "0");
  const miscFees = parseFloat(order.miscFees || "0");
  const totalAmount = parseFloat(order.total);



  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-x-4">
          <Button asChild variant="ghost">
            <Link to="/orders">
              <ArrowLeft className="size-4" />
              Back to Orders
            </Link>
          </Button>
          <div className="flex flex-row items-center gap-x-2">
            <h1 className="text-2xl font-semibold text-foreground">
              {order.title}
            </h1>
            <Badge
              variant={getStatusVariant(order.status)}
              appearance="outline"
              className="text-sm"
              size="lg"
            >
              {order.status}
            </Badge>
          </div>
        </div>
        <div className="flex items-center gap-x-2">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Edit className="size-4" />
                Edit Order
              </Button>
            </DialogTrigger>
            <OrderForm
              type="edit-order"
              orderData={{ ...order, totalCount: 0 }}
              callbackFn={handleEditOrder}
            />
          </Dialog>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* Order Information */}
        <Card>
          <CardHeader className="flex flex-row items-center gap-2 pb-2">
            <div className="flex items-center gap-x-2">
              <Package className="size-4 text-muted-foreground" />
              <CardTitle className="text-sm font-medium">
                Order Details
              </CardTitle>
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
              <span className="text-sm text-muted-foreground">
                Shipping Method:
              </span>
              <span className="text-sm font-medium">
                {order.shippingMethod}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                Release Period:
              </span>
              <span className="text-sm font-medium">
                {order.releaseMonthYear
                  ? formatDate(order.releaseMonthYear)
                  : "N/A"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Created:</span>
              <span className="text-sm font-medium">
                {formatDate(order.createdAt)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                Last Updated:
              </span>
              <span className="text-sm font-medium">
                {formatDate(order.updatedAt)}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Timeline */}
        <Card>
          <CardHeader className="flex flex-row items-center gap-2 pb-2">
            <div className="flex items-center gap-x-2">
              <Calendar className="size-4 text-muted-foreground" />
              <CardTitle className="text-sm font-medium">Timeline</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Ordered:</span>
              <span className="text-sm font-medium">
                {order.orderDate ? formatDate(order.orderDate) : "N/A"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Paid:</span>
              <span className="text-sm font-medium">
                {order.paymentDate ? formatDate(order.paymentDate) : "N/A"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Shipped:</span>
              <span className="text-sm font-medium">
                {order.shippingDate ? formatDate(order.shippingDate) : "N/A"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Collected:</span>
              <span className="text-sm font-medium">
                {order.collectionDate
                  ? formatDate(order.collectionDate)
                  : "N/A"}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Financial Summary */}
        <Card>
          <CardHeader className="flex flex-row items-center gap-2 pb-2">
            <div className="flex items-center gap-x-2">
              <CreditCard className="size-4 text-muted-foreground" />
              <CardTitle className="text-sm font-medium">
                Financial Summary
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                Items Total:
              </span>
              <span className="text-sm font-medium">
                {formatCurrency(itemsTotal.toString(), userCurrency)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Shipping:</span>
              <span className="text-sm font-medium">
                {formatCurrency(shippingFee.toString(), userCurrency)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Taxes:</span>
              <span className="text-sm font-medium">
                {formatCurrency(taxes.toString(), userCurrency)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Duties:</span>
              <span className="text-sm font-medium">
                {formatCurrency(duties.toString(), userCurrency)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Tariffs:</span>
              <span className="text-sm font-medium">
                {formatCurrency(tariffs.toString(), userCurrency)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Misc Fees:</span>
              <span className="text-sm font-medium">
                {formatCurrency(miscFees.toString(), userCurrency)}
              </span>
            </div>
            <div className="flex items-center justify-between font-semibold">
              <span className="text-sm">Total Amount:</span>
              <span className="text-sm">
                {formatCurrency(totalAmount.toString(), userCurrency)}
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
              <FileText className="size-4 text-muted-foreground" />
              <CardTitle className="text-sm font-medium">Notes</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">
              {order.notes}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Order Items */}
      <Card>
        <CardHeader className="flex flex-row items-center gap-2 pb-2">
          <div className="flex items-center gap-x-2">
            <Users className="size-4 text-muted-foreground" />
            <CardTitle className="text-sm font-medium">
              Order Items ({order.itemCount})
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {order.items.length > 0 ? (
            <OrderItemSubDataGrid
              items={order.items}
              orderId={order.orderId}
              itemSelection={itemSelection}
              setItemSelection={setItemSelection}
              onEditItem={handleEditItem}
              onDeleteItem={handleDeleteItem}
              currency={userCurrency}
            />
          ) : (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Package className="size-5" />
              No items in this order
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
