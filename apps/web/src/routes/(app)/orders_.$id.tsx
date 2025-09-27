import { createFileRoute, useParams, Link } from "@tanstack/react-router";
import {
  getOrder,
  editOrder,
  editOrderItem,
  deleteOrderItem,
} from "@/queries/orders";
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
import { getOrderStatusVariant } from "@/lib/orders/utils";
import { OrderItemsSubTable } from "@/components/orders/order-item-subtable";
import { useState } from "react";
import type { RowSelectionState } from "@tanstack/react-table";
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
import type { OrderItem, EditedOrder, CascadeOptions } from "@/lib/orders/types";
import { toast } from "sonner";
import Loader from "@/components/loader";

export const Route = createFileRoute("/(app)/orders_/$id")({
  component: RouteComponent,
});

function RouteComponent() {
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["order", id] });
      toast.success("Order updated successfully");
    },
    onError: (error) => {
      toast.error(error.message || "Failed to update order");
    },
  });

  const editItemMutation = useMutation({
    mutationFn: async ({
      orderId,
      collectionId,
      values,
    }: {
      orderId: string;
      collectionId: string;
      values: OrderItem;
    }) => {
      return await editOrderItem(orderId, collectionId, values);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["order", id] });
      toast.success("Item updated successfully");
    },
    onError: (error) => {
      toast.error(error.message || "Failed to update item");
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["order", id] });
      toast.success("Item deleted successfully");
    },
    onError: (error) => {
      toast.error(error.message || "Failed to delete item");
    },
  });

  const handleEditOrder = async (
    values: EditedOrder,
    cascadeOptions: CascadeOptions
  ) => {
    await editOrderMutation.mutateAsync({ values, cascadeOptions });
  };

  const handleEditItem = async (
    orderId: string,
    collectionId: string,
    values: OrderItem
  ) => {
    await editItemMutation.mutateAsync({ orderId, collectionId, values });
  };

  const handleDeleteItem = async (orderId: string, collectionId: string) => {
    await deleteItemMutation.mutateAsync({ orderId, collectionId });
  };

  if (isPending) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
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
        <div className="flex items-center space-x-4">
          <Button asChild variant="ghost">
            <Link to="/orders">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Orders
            </Link>
          </Button>
          <div className="flex flex-row items-center space-x-2">
            <h1 className="text-2xl font-bold text-foreground">
              {order.title}
            </h1>
            <Badge
              variant={getOrderStatusVariant(order.status)}
              appearance="outline"
              className="text-sm"
              size="lg"
            >
              {order.status}
            </Badge>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Edit className="mr-2 h-4 w-4" />
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
          <CardHeader className="flex flex-row items-center space-y-0 pb-2">
            <div className="flex items-center space-x-2">
              <Package className="h-4 w-4 text-muted-foreground" />
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
          <CardHeader className="flex flex-row items-center space-y-0 pb-2">
            <div className="flex items-center space-x-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
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
          <CardHeader className="flex flex-row items-center space-y-0 pb-2">
            <div className="flex items-center space-x-2">
              <CreditCard className="h-4 w-4 text-muted-foreground" />
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
                {formatCurrency(itemsTotal.toString())}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Shipping:</span>
              <span className="text-sm font-medium">
                {formatCurrency(shippingFee.toString())}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Taxes:</span>
              <span className="text-sm font-medium">
                {formatCurrency(taxes.toString())}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Duties:</span>
              <span className="text-sm font-medium">
                {formatCurrency(duties.toString())}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Tariffs:</span>
              <span className="text-sm font-medium">
                {formatCurrency(tariffs.toString())}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Misc Fees:</span>
              <span className="text-sm font-medium">
                {formatCurrency(miscFees.toString())}
              </span>
            </div>
            <div className="flex items-center justify-between font-semibold">
              <span className="text-sm">Total Amount:</span>
              <span className="text-sm">
                {formatCurrency(totalAmount.toString())}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Notes Section */}
      {order.notes && (
        <Card>
          <CardHeader className="flex flex-row items-center space-y-0 pb-2">
            <div className="flex items-center space-x-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
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
        <CardHeader className="flex flex-row items-center space-y-0 pb-2">
          <div className="flex items-center space-x-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm font-medium">
              Order Items ({order.itemCount})
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {order.items.length > 0 ? (
            <OrderItemsSubTable
              items={order.items}
              orderId={order.orderId}
              itemSelection={itemSelection}
              setItemSelection={setItemSelection}
              onEditItem={handleEditItem}
              onDeleteItem={handleDeleteItem}
            />
          ) : (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Package className="mr-2 h-5 w-5" />
              No items in this order
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
