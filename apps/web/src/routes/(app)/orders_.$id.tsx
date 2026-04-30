import { HugeiconsIcon } from "@hugeicons/react";
import {
  Cancel01Icon,
  Delete01Icon,
  Delete02Icon,
  Edit03Icon,
  MoveIcon,
  PackageIcon,
} from "@hugeicons/core-free-icons";
import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { getOrder } from "@/queries/orders";
import { useQuery } from "@tanstack/react-query";
import { ThemedBadge } from "@/components/reui/badge";
import { BackLink } from "@/components/ui/back-link";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  ActionBar,
  ActionBarSelection,
  ActionBarGroup,
  ActionBarItem,
  ActionBarClose,
  ActionBarSeparator,
} from "@/components/ui/action-bar";
import { formatCurrencyFromMinorUnits } from "@myakiba/utils/currency";
import { formatDateOnlyForDisplay, formatTimestampForDisplay } from "@/lib/date-display";
import { getStatusVariant } from "@/lib/orders";
import { OrderItemSubDataGrid } from "@/components/orders/order-item-sub-data-grid";
import { OrderItemSyncSheet } from "@/components/orders/order-item-sync-sheet";
import { useCallback, useState } from "react";
import type { RowSelectionState } from "@tanstack/react-table";
import { OrderForm } from "@/components/orders/order-form";
import UnifiedItemMoveForm from "@/components/orders/unified-item-move-form";
import type { SelectedCollectionItems } from "@/hooks/use-selection";
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
import { useOrdersMutations } from "@/hooks/use-orders";

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
  const navigate = useNavigate();
  const [itemSelection, setItemSelection] = useState<RowSelectionState>({});

  const {
    handleEditOrder,
    handleDeleteOrders,
    handleEditItem,
    handleDeleteItem,
    handleDeleteItems,
    handleMoveItem,
    handleSplit,
    isCollectionItemPending,
    isDeletingOrders,
    isDeletingItems,
    isMovingItems,
    isSplitting,
  } = useOrdersMutations();

  const {
    data,
    isPending,
    isError,
    error: orderError,
  } = useQuery({
    queryKey: ["order", id],
    queryFn: () => getOrder(id),
    staleTime: 1000 * 60 * 5,
    retry: false,
  });

  const handleDeleteOrder = useCallback(
    async (orderId: string): Promise<void> => {
      await handleDeleteOrders(new Set([orderId]));
      await navigate({ to: "/orders" });
    },
    [handleDeleteOrders, navigate],
  );

  const clearItemSelection = useCallback((): void => {
    setItemSelection({});
  }, []);

  if (isPending) {
    return <Loader />;
  }

  if (isError) {
    return (
      <div className="flex flex-col gap-3">
        <BackLink to="/orders" text="Back" font="sans" className="self-start" />
        <div className="text-lg font-medium text-destructive">Error: {orderError.message}</div>
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

  const selectedCollectionIds = new Set(
    Object.keys(itemSelection).map((rowKey) => rowKey.slice(order.orderId.length + 1)),
  );
  const selectedItems: SelectedCollectionItems = {
    collectionIds: selectedCollectionIds,
    orderIds: new Set([order.orderId]),
  };
  const selectedItemCount = selectedCollectionIds.size;
  const isItemActionBarOpen = selectedItemCount > 0;

  return (
    <div className="flex flex-col gap-8 min-h-full mx-auto max-w-352">
      {/* Header */}
      <div className="flex flex-col gap-3 animate-appear">
        <BackLink to="/orders" text="Back" font="sans" className="self-start" />

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

          <div className="flex items-center gap-2">
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
            <ConfirmDialog
              renderTrigger={
                <Button variant="destructive" size="sm">
                  <HugeiconsIcon icon={Delete02Icon} className="size-4" />
                  Delete
                </Button>
              }
              title="Delete order?"
              description='This will permanently delete this order and all its items. Items with "Owned" status will not be deleted. You can delete owned items in the collection tab.'
              onConfirm={() => handleDeleteOrder(order.orderId)}
            />
          </div>
        </div>
      </div>

      {/* Progress + Cost Breakdown */}
      <div className="grid gap-8 lg:grid-cols-[3fr_2fr] animate-appear">
        <section className="flex flex-col gap-3">
          <h2 className="text-xs font-medium text-muted-foreground">Progress</h2>
          <Timeline orientation="horizontal" value={activeStep}>
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
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Total</span>
            <span className="text-lg font-medium tracking-tight tabular-nums">
              {formatCurrencyFromMinorUnits(totalAmount, userCurrency, userLocale)}
            </span>
          </div>
        </section>
      </div>

      {/* Notes */}
      {order.notes && (
        <section className="flex flex-col gap-3 animate-appear">
          <h2 className="text-xs font-medium text-muted-foreground">Notes</h2>
          <div className="rounded-xl bg-card ring-1 ring-foreground/10 px-5 py-4">
            <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed max-w-prose">
              {order.notes}
            </p>
          </div>
        </section>
      )}

      {/* Order Items */}
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
            onEditItem={handleEditItem}
            onDeleteItem={handleDeleteItem}
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

      {/* Footer metadata */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground/60 pb-2 animate-appear">
        <span>Created {formatTimestampForDisplay(order.createdAt, dateFormat)}</span>
        <span aria-hidden="true">&middot;</span>
        <span>Updated {formatTimestampForDisplay(order.updatedAt, dateFormat)}</span>
      </div>

      <ActionBar
        open={isItemActionBarOpen}
        onOpenChange={(open) => {
          if (!open) clearItemSelection();
        }}
      >
        <ActionBarSelection className="border-none">
          {selectedItemCount} {selectedItemCount === 1 ? "item" : "items"} selected
        </ActionBarSelection>
        <ActionBarSeparator />
        <ActionBarGroup>
          <UnifiedItemMoveForm
            renderTrigger={
              <ActionBarItem
                disabled={selectedItemCount === 0 || isMovingItems || isSplitting}
                onSelect={(e) => e.preventDefault()}
                variant="default"
              >
                <HugeiconsIcon icon={MoveIcon} />
                <span className="hidden md:block">
                  {isMovingItems || isSplitting ? "Moving..." : "Move Item"}
                </span>
              </ActionBarItem>
            }
            selectedItems={selectedItems}
            onMoveToExisting={handleMoveItem}
            onMoveToNew={handleSplit}
            clearSelections={clearItemSelection}
            currency={userCurrency}
          />
          <ConfirmDialog
            renderTrigger={
              <ActionBarItem
                disabled={selectedItemCount === 0 || isDeletingItems || isDeletingOrders}
                onSelect={(e) => e.preventDefault()}
                variant="destructive"
              >
                <HugeiconsIcon icon={Delete01Icon} />
                <span>
                  <span className="hidden md:inline">
                    {isDeletingItems ? "Deleting " : "Delete "}
                  </span>
                  Items
                </span>
              </ActionBarItem>
            }
            title={`Delete ${selectedItemCount} ${selectedItemCount === 1 ? "item" : "items"}?`}
            description='Items with "Owned" status will not be deleted. You can delete owned items in the collection tab.'
            onConfirm={async () => {
              await handleDeleteItems(selectedCollectionIds);
              clearItemSelection();
            }}
          />
        </ActionBarGroup>
        <ActionBarSeparator />
        <ActionBarClose>
          <HugeiconsIcon icon={Cancel01Icon} />
        </ActionBarClose>
      </ActionBar>
    </div>
  );
}
