import { HugeiconsIcon } from "@hugeicons/react";
import { Tick02Icon } from "@hugeicons/core-free-icons";
import * as React from "react";
import { Badge } from "@/components/reui/badge";
import { Button } from "@/components/ui/button";
import { Frame, FrameHeader, FramePanel, FrameTitle } from "@/components/reui/frame";
import {
  Kanban,
  KanbanBoard,
  KanbanColumn,
  KanbanColumnContent,
  KanbanItem,
  KanbanItemHandle,
  KanbanOverlay,
} from "@/components/reui/kanban";
import { PopoverDatePickerCell } from "@/components/cells/popover-date-picker-cell";
import { formatCurrencyFromMinorUnits } from "@myakiba/utils/currency";
import { formatDateOnlyForDisplay } from "@/lib/date-display";
import type { Currency, DateFormat } from "@myakiba/contracts/shared/types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateOrderStatus, updateOrderDate, type OrderDateField } from "@/queries/orders";
import type { DashboardKanbanOrder } from "@/queries/dashboard";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { cn } from "@/lib/utils";
import { ORDER_STATUS_COLORS } from "@/lib/orders";
import { getCurrencyLocale } from "@/lib/locale";
import { Skeleton } from "../ui/skeleton";
import Loader from "../loader";

interface OrdersKanbanProps {
  orders: readonly DashboardKanbanOrder[];
  isLoading: boolean;
  currency: Currency;
  dateFormat: DateFormat;
}

const COLUMNS: Record<string, { readonly title: string; readonly color: string }> = {
  Ordered: { title: "Ordered", color: ORDER_STATUS_COLORS.Ordered },
  Paid: { title: "Paid", color: ORDER_STATUS_COLORS.Paid },
  Shipped: { title: "Shipped", color: ORDER_STATUS_COLORS.Shipped },
  Owned: { title: "Owned", color: ORDER_STATUS_COLORS.Owned },
};

const DATE_FIELDS: ReadonlyArray<{ readonly field: OrderDateField; readonly label: string }> = [
  { field: "releaseDate", label: "Release" },
  { field: "orderDate", label: "Ordered" },
  { field: "paymentDate", label: "Paid" },
  { field: "shippingDate", label: "Shipped" },
  { field: "collectionDate", label: "Collected" },
];

function withDateUpdate(
  order: DashboardKanbanOrder,
  field: OrderDateField,
  date: string | null,
): DashboardKanbanOrder {
  switch (field) {
    case "releaseDate":
      return { ...order, releaseDate: date };
    case "orderDate":
      return { ...order, orderDate: date };
    case "paymentDate":
      return { ...order, paymentDate: date };
    case "shippingDate":
      return { ...order, shippingDate: date };
    case "collectionDate":
      return { ...order, collectionDate: date };
  }
}

interface OrderCardProps extends Omit<
  React.ComponentProps<typeof KanbanItem>,
  "value" | "children"
> {
  order: DashboardKanbanOrder;
  currency: Currency;
  dateFormat: DateFormat;
  columnId: string;
  asHandle?: boolean;
  onMarkOwned: (orderId: string) => void;
  onDateChange: (orderId: string, field: OrderDateField, date: string | null) => void;
}

function OrderCard({
  order,
  currency,
  dateFormat,
  columnId,
  asHandle,
  onMarkOwned,
  onDateChange,
  ...props
}: OrderCardProps) {
  const locale = getCurrencyLocale(currency);

  const content = (
    <Frame variant="ghost" spacing="sm" className="group/card relative p-0">
      <FramePanel className="p-3">
        {columnId !== "Owned" && (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute top-2 right-2 opacity-0 transition-opacity group-hover/card:opacity-100"
                  aria-label="Mark as Owned"
                  onClick={(e) => {
                    e.stopPropagation();
                    onMarkOwned(order.orderId);
                  }}
                >
                  <HugeiconsIcon icon={Tick02Icon} className="h-4 w-4" />
                </Button>
              }
            />
            <TooltipContent>
              <p>Mark as 'Owned'</p>
            </TooltipContent>
          </Tooltip>
        )}
        <div className="flex flex-col gap-2.5">
          {order.itemImages.length > 0 && (
            <div className="flex gap-1">
              {order.itemImages.slice(0, 3).map((image) => (
                <div
                  key={`${order.orderId}:${image}`}
                  className="relative size-12 shrink-0 overflow-hidden rounded-md bg-muted"
                >
                  <img src={image} alt="" className="size-full object-cover object-top" />
                </div>
              ))}
              {order.itemImages.length > 3 && (
                <div className="relative flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
                  <span className="text-xs font-medium text-muted-foreground">
                    +{order.itemImages.length - 3}
                  </span>
                </div>
              )}
            </div>
          )}

          <div className="flex flex-col gap-1">
            <Link
              to="/orders/$id"
              params={{ id: order.orderId }}
              className="line-clamp-1 text-sm font-medium leading-tight hover:underline"
              onPointerDown={(e) => e.stopPropagation()}
            >
              {order.title}
            </Link>
            <div className="flex flex-row items-center gap-1">
              {order.shop && (
                <Badge
                  variant="outline"
                  className="pointer-events-none w-fit px-1.5 py-0 text-[10px]"
                >
                  {order.shop}
                </Badge>
              )}
              <Badge
                variant="outline"
                className="pointer-events-none w-fit px-1.5 py-0 text-[10px]"
              >
                {formatCurrencyFromMinorUnits(order.total, currency, locale)}
              </Badge>
            </div>
          </div>

          <div className="-mx-1.5 flex flex-col">
            {DATE_FIELDS.map(({ field, label }) => {
              const dateValue = order[field] ?? null;
              return (
                <div key={field} onPointerDown={(e) => e.stopPropagation()}>
                  <PopoverDatePickerCell
                    value={dateValue}
                    dateFormat={dateFormat}
                    onSubmit={async (date) => onDateChange(order.orderId, field, date)}
                    trigger={
                      <button
                        type="button"
                        className={cn(
                          "flex w-full items-center justify-between gap-2 rounded px-1.5 py-0.5 text-left",
                          "transition-colors hover:bg-muted/80",
                          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                        )}
                      >
                        <span className="shrink-0 text-[10px] font-medium text-muted-foreground">
                          {label}
                        </span>
                        <span
                          className={cn(
                            "text-[10px] tabular-nums",
                            dateValue ? "text-foreground" : "text-muted-foreground/50",
                          )}
                        >
                          {dateValue ? formatDateOnlyForDisplay(dateValue, dateFormat) : "—"}
                        </span>
                      </button>
                    }
                  />
                </div>
              );
            })}
          </div>
        </div>
      </FramePanel>
    </Frame>
  );

  return (
    <KanbanItem value={order.orderId} {...props}>
      {asHandle ? <KanbanItemHandle>{content}</KanbanItemHandle> : content}
    </KanbanItem>
  );
}

function OrderColumn({
  columnId,
  orders,
  isLoading,
  currency,
  dateFormat,
  isOverlay,
  onMarkOwned,
  onDateChange,
}: {
  columnId: string;
  orders: readonly DashboardKanbanOrder[];
  isLoading: boolean;
  currency: Currency;
  dateFormat: DateFormat;
  isOverlay?: boolean;
  onMarkOwned: (orderId: string) => void;
  onDateChange: (orderId: string, field: OrderDateField, date: string | null) => void;
}) {
  const col = COLUMNS[columnId];

  return (
    <KanbanColumn value={columnId}>
      <Frame spacing="sm" className="h-full min-h-0">
        <FrameHeader className="flex flex-row items-center gap-2">
          <div className={cn("size-2 rounded-full", col.color)} />
          <FrameTitle>{col.title}</FrameTitle>
          <Badge variant="outline" size="sm" className="ml-auto">
            {isLoading ? <Skeleton className="size-2" /> : orders.length}
          </Badge>
        </FrameHeader>
        <KanbanColumnContent
          value={columnId}
          className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-0.5"
        >
          {isLoading ? (
            <Loader className="justify-start text-muted pt-4" />
          ) : (
            orders.map((order) => (
              <OrderCard
                key={order.orderId}
                order={order}
                currency={currency}
                dateFormat={dateFormat}
                columnId={columnId}
                asHandle={!isOverlay}
                onMarkOwned={onMarkOwned}
                onDateChange={onDateChange}
              />
            ))
          )}
        </KanbanColumnContent>
      </Frame>
    </KanbanColumn>
  );
}

export default function OrderKanban({
  orders,
  isLoading,
  currency,
  dateFormat,
}: OrdersKanbanProps) {
  const queryClient = useQueryClient();

  const initialColumns = React.useMemo(() => {
    const grouped: Record<string, DashboardKanbanOrder[]> = {
      Ordered: [],
      Paid: [],
      Shipped: [],
      Owned: [],
    };

    for (const order of orders) {
      grouped[order.status]?.push(order);
    }

    return grouped;
  }, [orders]);

  const [columns, setColumns] =
    React.useState<Record<string, DashboardKanbanOrder[]>>(initialColumns);

  React.useEffect(() => {
    setColumns(initialColumns);
  }, [initialColumns]);

  const statusMutation = useMutation({
    mutationFn: ({
      orderId,
      status,
    }: {
      orderId: string;
      status: "Ordered" | "Paid" | "Shipped" | "Owned";
    }) => updateOrderStatus(orderId, status),
    onSuccess: async (_data, variables) => {
      if (variables.status === "Owned") {
        toast.success("Order marked as collected");
      }
      await queryClient.invalidateQueries();
    },
    onError: (error: Error, variables) => {
      toast.error(`Failed to update order ${variables.orderId} to status ${variables.status}:`, {
        description: `Error: ${error.message}`,
      });
      setColumns(initialColumns);
    },
  });

  const dateMutation = useMutation({
    mutationFn: ({
      orderId,
      field,
      date,
    }: {
      orderId: string;
      field: OrderDateField;
      date: string | null;
    }) => updateOrderDate(orderId, field, date),
    onSuccess: async () => {
      await queryClient.invalidateQueries();
    },
    onError: (error: Error) => {
      toast.error("Failed to update date", {
        description: error.message,
      });
      setColumns(initialColumns);
    },
  });

  const handleDateChange = React.useCallback(
    (orderId: string, field: OrderDateField, date: string | null) => {
      setColumns((prev) => {
        const next = { ...prev };
        for (const colId of Object.keys(next)) {
          const colOrders = next[colId];
          const idx = colOrders.findIndex((o) => o.orderId === orderId);
          if (idx !== -1) {
            const updated = [...colOrders];
            updated[idx] = withDateUpdate(colOrders[idx], field, date);
            next[colId] = updated;
            break;
          }
        }
        return next;
      });

      dateMutation.mutate({ orderId, field, date });
    },
    [dateMutation],
  );

  const handleMarkOwned = React.useCallback(
    (orderId: string) => {
      let foundColumn: string | null = null;
      let foundIndex = -1;
      let foundOrder: DashboardKanbanOrder | null = null;

      for (const [columnValue, columnOrders] of Object.entries(columns)) {
        const index = columnOrders.findIndex((o) => o.orderId === orderId);
        if (index !== -1) {
          foundColumn = columnValue;
          foundIndex = index;
          foundOrder = columnOrders[index];
          break;
        }
      }

      if (foundColumn === null || foundOrder === null) return;

      const updatedSource = [...columns[foundColumn]];
      updatedSource.splice(foundIndex, 1);

      setColumns({
        ...columns,
        [foundColumn]: updatedSource,
        Owned: [...columns.Owned, foundOrder],
      });

      statusMutation.mutate({ orderId, status: "Owned" });
    },
    [columns, statusMutation],
  );

  const handleMove = React.useCallback(
    (moveEvent: {
      activeContainer: string;
      activeIndex: number;
      overContainer: string;
      overIndex: number;
    }) => {
      const { activeContainer, activeIndex, overContainer, overIndex } = moveEvent;
      const movedOrder = columns[activeContainer][activeIndex];

      if (activeContainer !== overContainer) {
        const newStatus = overContainer as "Ordered" | "Paid" | "Shipped" | "Owned";
        const activeItems = [...columns[activeContainer]];
        const overItems = [...columns[overContainer]];

        activeItems.splice(activeIndex, 1);
        overItems.splice(overIndex, 0, movedOrder);

        setColumns({
          ...columns,
          [activeContainer]: activeItems,
          [overContainer]: overItems,
        });

        statusMutation.mutate({
          orderId: movedOrder.orderId,
          status: newStatus,
        });
      }
    },
    [columns, statusMutation],
  );

  return (
    <Kanban
      value={columns}
      onValueChange={setColumns}
      onMove={handleMove}
      getItemValue={(item) => item.orderId}
      className="h-full overflow-x-auto"
    >
      <KanbanBoard className="h-full min-w-[1300px] sm:grid-cols-4 gap-2.5">
        {Object.entries(columns).map(([columnId, columnOrders]) => (
          <OrderColumn
            key={columnId}
            columnId={columnId}
            orders={columnOrders}
            isLoading={isLoading}
            currency={currency}
            dateFormat={dateFormat}
            onMarkOwned={handleMarkOwned}
            onDateChange={handleDateChange}
          />
        ))}
      </KanbanBoard>
      <KanbanOverlay className="rounded-md border-2 border-dashed bg-muted/10" />
    </Kanban>
  );
}
