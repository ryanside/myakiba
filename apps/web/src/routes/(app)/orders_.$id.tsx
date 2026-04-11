import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft01Icon, Edit03Icon, PackageIcon } from "@hugeicons/core-free-icons";
import { createFileRoute, useParams, Link } from "@tanstack/react-router";
import { getOrder, editOrder, deleteOrderItem } from "@/queries/orders";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ThemedBadge } from "@/components/reui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { formatCurrencyFromMinorUnits } from "@myakiba/utils/currency";
import { formatDateOnlyForDisplay, formatTimestampForDisplay } from "@/lib/date-display";
import { getStatusVariant } from "@/lib/orders";
import { OrderItemSubDataGrid } from "@/components/orders/order-item-sub-data-grid";
import { OrderItemSyncSheet } from "@/components/orders/order-item-sync-sheet";
import { useCallback, useMemo, useRef, useState } from "react";
import type { RowSelectionState } from "@tanstack/react-table";
import { OrderForm } from "@/components/orders/order-form";
import type { EditedOrder, CascadeOptions } from "@myakiba/contracts/orders/schema";
import type { CollectionItemFormValues } from "@myakiba/contracts/collection/types";
import { toast } from "sonner";
import { updateCollectionItem } from "@/queries/collection";
import Loader from "@/components/loader";
import {
  Timeline,
  TimelineItem,
  TimelineIndicator,
  TimelineSeparator,
  TimelineHeader,
  TimelineTitle,
  TimelineDate,
} from "@/components/reui/timeline";
import { useUserPreferences } from "@/hooks/use-user-preferences";

export const Route = createFileRoute("/(app)/orders_/$id")({
  component: RouteComponent,
  head: ({ params }) => ({
    meta: [
      { name: "description", content: `order ${params.id} details` },
      { title: `Order ${params.id} - myakiba` },
    ],
  }),
});

const STATUS_TO_STEP: Readonly<Record<string, number>> = {
  ordered: 1,
  paid: 2,
  shipped: 3,
  owned: 4,
};

function CostRow({
  label,
  amount,
  currency,
  locale,
}: {
  readonly label: string;
  readonly amount: number;
  readonly currency: string;
  readonly locale: string;
}): React.JSX.Element {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">{formatCurrencyFromMinorUnits(amount, currency, locale)}</span>
    </div>
  );
}

function RouteComponent() {
  const { currency: userCurrency, locale: userLocale, dateFormat } = useUserPreferences();
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
      <div className="flex flex-col gap-3">
        <Button
          variant="link"
          size="sm"
          render={<Link to="/orders" />}
          nativeButton={false}
          className="self-start"
        >
          <HugeiconsIcon
            icon={ArrowLeft01Icon}
            strokeWidth={2}
            data-icon="inline-start"
            aria-hidden="true"
          />
          Back to Orders
        </Button>
        <div className="text-lg font-medium text-destructive">Error: {error.message}</div>
      </div>
    );
  }

  const order = data;
  const activeStep = STATUS_TO_STEP[order.status.toLowerCase()] ?? 0;

  const shippingFee = order.shippingFee ?? 0;
  const taxes = order.taxes ?? 0;
  const duties = order.duties ?? 0;
  const tariffs = order.tariffs ?? 0;
  const miscFees = order.miscFees ?? 0;
  const totalAmount = order.total ?? 0;
  const itemsTotal = totalAmount - shippingFee - taxes - duties - tariffs - miscFees;

  const timelineSteps = [
    { step: 1, title: "Ordered", date: order.orderDate },
    { step: 2, title: "Paid", date: order.paymentDate },
    { step: 3, title: "Shipped", date: order.shippingDate },
    { step: 4, title: "Collected", date: order.collectionDate },
  ] as const;

  const optionalFees = [
    { label: "Taxes", amount: taxes },
    { label: "Duties", amount: duties },
    { label: "Tariffs", amount: tariffs },
    { label: "Other fees", amount: miscFees },
  ].filter(({ amount }) => amount > 0);

  return (
    <div className="flex flex-col gap-8 min-h-full">
      {/* Header */}
      <div className="flex flex-col gap-3">
        <Button
          variant="link"
          size="sm"
          render={<Link to="/orders" />}
          nativeButton={false}
          className="self-start"
        >
          <HugeiconsIcon
            icon={ArrowLeft01Icon}
            strokeWidth={2}
            data-icon="inline-start"
            aria-hidden="true"
          />
          Back to Orders
        </Button>

        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-medium tracking-tight">{order.title}</h1>
              <ThemedBadge variant={getStatusVariant(order.status)} size="lg">
                {order.status}
              </ThemedBadge>
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
              {order.shop && (
                <>
                  <span>{order.shop}</span>
                  <span className="text-border select-none" aria-hidden="true">
                    &middot;
                  </span>
                </>
              )}
              <span>{order.shippingMethod}</span>
              <span className="text-border select-none" aria-hidden="true">
                &middot;
              </span>
              <span>
                {order.itemCount} {order.itemCount === 1 ? "item" : "items"}
              </span>
              {order.releaseDate && (
                <>
                  <span className="text-border select-none" aria-hidden="true">
                    &middot;
                  </span>
                  <span>Release {formatDateOnlyForDisplay(order.releaseDate, dateFormat)}</span>
                </>
              )}
            </div>
          </div>

          <OrderForm
            renderTrigger={
              <Button variant="outline" size="sm">
                <HugeiconsIcon icon={Edit03Icon} className="size-4" />
                Edit
              </Button>
            }
            type="edit-order"
            orderData={order}
            callbackFn={handleEditOrder}
            currency={userCurrency}
          />
        </div>
      </div>

      {/* Timeline + Cost Breakdown */}
      <div className="grid gap-8 lg:grid-cols-[3fr_2fr]">
        <section className="flex flex-col gap-3">
          <h2 className="text-xs font-medium text-muted-foreground">Timeline</h2>
          <Timeline value={activeStep}>
            {timelineSteps.map(({ step, title, date }) => (
              <TimelineItem key={step} step={step}>
                <TimelineIndicator />
                <TimelineSeparator />
                <TimelineHeader>
                  <TimelineTitle>{title}</TimelineTitle>
                </TimelineHeader>
                <TimelineDate>
                  {date ? formatDateOnlyForDisplay(date, dateFormat) : "—"}
                </TimelineDate>
              </TimelineItem>
            ))}
          </Timeline>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-xs font-medium text-muted-foreground">Cost Breakdown</h2>
          <div className="rounded-xl bg-card ring-1 ring-foreground/10 p-5 flex flex-col gap-3">
            <div className="flex flex-col gap-2.5">
              <CostRow
                label="Items"
                amount={itemsTotal}
                currency={userCurrency}
                locale={userLocale}
              />
              <CostRow
                label="Shipping"
                amount={shippingFee}
                currency={userCurrency}
                locale={userLocale}
              />
              {optionalFees.map(({ label, amount }) => (
                <CostRow
                  key={label}
                  label={label}
                  amount={amount}
                  currency={userCurrency}
                  locale={userLocale}
                />
              ))}
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Total</span>
              <span className="text-lg font-medium tracking-tight tabular-nums">
                {formatCurrencyFromMinorUnits(totalAmount, userCurrency, userLocale)}
              </span>
            </div>
          </div>
        </section>
      </div>

      {/* Notes */}
      {order.notes && (
        <section className="flex flex-col gap-3">
          <h2 className="text-xs font-medium text-muted-foreground">Notes</h2>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed max-w-prose">
            {order.notes}
          </p>
        </section>
      )}

      {/* Order Items */}
      <section className="flex flex-col gap-3 flex-1">
        <h2 className="text-xs font-medium text-muted-foreground">Items ({order.itemCount})</h2>
        {order.itemCount > 0 ? (
          <div className="rounded-xl ring-1 ring-foreground/10 bg-card overflow-hidden">
            <OrderItemSubDataGrid
              orderId={order.orderId}
              itemSelection={itemSelection}
              setItemSelection={setItemSelection}
              onEditItem={handleEditItem}
              onDeleteItem={handleDeleteItem}
              isCollectionItemPending={isCollectionItemPending}
            />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 gap-3 rounded-xl ring-1 ring-foreground/10 bg-card">
            <HugeiconsIcon icon={PackageIcon} className="size-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No items in this order yet</p>
            <OrderItemSyncSheet orderId={order.orderId} label="Add First Item" />
          </div>
        )}
      </section>

      {/* Footer metadata */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground/60 pb-2">
        <span>Created {formatTimestampForDisplay(order.createdAt, dateFormat)}</span>
        <span aria-hidden="true">&middot;</span>
        <span>Updated {formatTimestampForDisplay(order.updatedAt, dateFormat)}</span>
      </div>
    </div>
  );
}
