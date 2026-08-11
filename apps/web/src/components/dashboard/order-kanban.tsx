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
import type { KanbanMoveEvent } from "@/components/reui/kanban";
import { PopoverDatePickerCell } from "@/components/cells/popover-date-picker-cell";
import { PopoverReleaseDateCell } from "@/components/cells/popover-release-date-cell";
import { formatCurrencyFromMinorUnits } from "@myakiba/utils/currency";
import { formatDateOnlyForDisplay } from "@/lib/date-display";
import { ORDER_STATUSES } from "@myakiba/contracts/shared/constants";
import type { Currency, DateFormat, OrderStatus } from "@myakiba/contracts/shared/types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateOrderStatus, updateOrderDate } from "@/queries/orders";
import type { OrderDateField } from "@/queries/orders";
import type { DashboardKanbanOrder } from "@/queries/dashboard";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { cn } from "@/lib/utils";
import { ORDER_STATUS_COLORS } from "@/lib/orders";
import { getCurrencyLocale } from "@/lib/locale";
import { invalidateCollectionAndOrderQueries } from "@/lib/mutation-query-invalidation";
import { Skeleton } from "../ui/skeleton";
import Loader from "../loader";

interface OrdersKanbanProps {
  orders: readonly DashboardKanbanOrder[];
  isLoading: boolean;
  currency: Currency;
  dateFormat: DateFormat;
}

type OrderColumns = Record<string, DashboardKanbanOrder[]>;
type OrderColumnsUpdate = React.SetStateAction<OrderColumns>;
interface StatusMutationVariables {
  readonly orderId: string;
  readonly status: OrderStatus;
  readonly previousStatus: OrderStatus;
  readonly previousIndex: number;
  readonly targetIndex: number;
}

interface DateMutationVariables {
  readonly orderId: string;
  readonly field: OrderDateField;
  readonly date: string | null;
  readonly previousDate: string | null;
}

interface PendingStatusMutations {
  readonly mutations: StatusMutationVariables[];
  persistedStatus: OrderStatus;
  persistedIndex: number;
  lastMutationSucceeded: boolean;
}

interface PendingDateMutations {
  readonly mutations: DateMutationVariables[];
  readonly persistedDates: Map<OrderDateField, string | null>;
}

const COLUMNS: Record<string, { readonly title: string; readonly color: string }> = {
  Ordered: { title: "Ordered", color: ORDER_STATUS_COLORS.Ordered },
  Paid: { title: "Paid", color: ORDER_STATUS_COLORS.Paid },
  Shipped: { title: "Shipped", color: ORDER_STATUS_COLORS.Shipped },
  Owned: { title: "Owned", color: ORDER_STATUS_COLORS.Owned },
};

const DATE_FIELDS: readonly { readonly field: OrderDateField; readonly label: string }[] = [
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

function columnsReducer(columns: OrderColumns, update: OrderColumnsUpdate): OrderColumns {
  return typeof update === "function" ? update(columns) : update;
}

function reconcileOrderColumns(current: OrderColumns, incoming: OrderColumns): OrderColumns {
  const next: OrderColumns = {};

  for (const [columnId, incomingOrders] of Object.entries(incoming)) {
    const currentOrders = current[columnId] ?? [];
    const incomingById = new Map(incomingOrders.map((order) => [order.orderId, order]));
    const refreshedOrders = currentOrders.flatMap((order) => {
      const incomingOrder = incomingById.get(order.orderId);
      return incomingOrder ? [incomingOrder] : [];
    });

    next[columnId] =
      refreshedOrders.length === incomingOrders.length ? refreshedOrders : incomingOrders;
  }

  return next;
}

function moveOrderToStatus(
  columns: OrderColumns,
  orderId: string,
  status: OrderStatus,
  targetIndex: number,
  restorePosition: boolean,
): OrderColumns {
  let currentStatus: string | null = null;
  let currentIndex = -1;

  for (const [columnId, orders] of Object.entries(columns)) {
    const index = orders.findIndex((order) => order.orderId === orderId);
    if (index === -1) continue;

    currentStatus = columnId;
    currentIndex = index;
    break;
  }

  if (currentStatus === null) return columns;
  if (currentStatus === status && !restorePosition) return columns;

  const nextCurrentOrders = [...columns[currentStatus]];
  const [order] = nextCurrentOrders.splice(currentIndex, 1);
  const targetOrders = currentStatus === status ? nextCurrentOrders : [...columns[status]];
  const insertionIndex = Math.max(0, Math.min(targetIndex, targetOrders.length));
  targetOrders.splice(insertionIndex, 0, order);

  return {
    ...columns,
    [currentStatus]: currentStatus === status ? targetOrders : nextCurrentOrders,
    [status]: targetOrders,
  };
}

function updateOrderDateInColumns(
  columns: OrderColumns,
  orderId: string,
  field: OrderDateField,
  date: string | null,
): OrderColumns {
  for (const [columnId, orders] of Object.entries(columns)) {
    const index = orders.findIndex((order) => order.orderId === orderId);
    if (index === -1) continue;

    const nextOrders = [...orders];
    nextOrders[index] = withDateUpdate(orders[index], field, date);
    return { ...columns, [columnId]: nextOrders };
  }

  return columns;
}

async function drainMutationQueue<T>(
  mutations: T[],
  mutate: (variables: T) => Promise<unknown>,
  recordResult: (variables: T, succeeded: boolean) => void,
  finalize: () => Promise<void>,
): Promise<void> {
  let variables = mutations.shift();
  while (variables) {
    try {
      await mutate(variables);
      recordResult(variables, true);
    } catch {
      recordResult(variables, false);
    }

    variables = mutations.shift();
  }

  await finalize();
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
    <Frame
      variant="ghost"
      spacing="sm"
      className="bg-background animate-data-in group/card relative p-0"
    >
      <FramePanel className="p-3 border-none hover:ring-1 hover:ring-foreground/10">
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
                  <HugeiconsIcon icon={Tick02Icon} className="size-4" />
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
              className="line-clamp-1 text-sm font-medium leading-tight hover:underline w-fit"
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
              const triggerButton = (
                <Button
                  type="button"
                  variant="ghost"
                  className={cn(
                    "h-auto w-full justify-between gap-2 rounded px-1.5 py-0.5 text-left font-normal",
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
                </Button>
              );

              const DateCell =
                field === "releaseDate" ? (
                  <PopoverReleaseDateCell
                    value={dateValue}
                    dateFormat={dateFormat}
                    orderId={order.orderId}
                    onSubmit={async (date) => onDateChange(order.orderId, field, date)}
                    trigger={triggerButton}
                  />
                ) : (
                  <PopoverDatePickerCell
                    value={dateValue}
                    dateFormat={dateFormat}
                    onSubmit={async (date) => onDateChange(order.orderId, field, date)}
                    trigger={triggerButton}
                  />
                );

              return (
                <div key={field} onPointerDown={(e) => e.stopPropagation()}>
                  {DateCell}
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
            {isLoading ? (
              <Skeleton className="size-2" />
            ) : (
              <span className="animate-data-in">{orders.length}</span>
            )}
          </Badge>
        </FrameHeader>
        <KanbanColumnContent
          value={columnId}
          className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-0.5"
        >
          {isLoading ? (
            <Loader className="justify-start pt-4" />
          ) : (
            orders.map((order, index) => (
              <OrderCard
                key={order.orderId}
                order={order}
                currency={currency}
                dateFormat={dateFormat}
                columnId={columnId}
                asHandle={!isOverlay}
                onMarkOwned={onMarkOwned}
                onDateChange={onDateChange}
                style={{ "--data-in-delay": `${index * 30}ms` } as React.CSSProperties}
              />
            ))
          )}
        </KanbanColumnContent>
      </Frame>
    </KanbanColumn>
  );
}

function OrderKanbanBoard({
  initialColumns,
  isLoading,
  currency,
  dateFormat,
}: Omit<OrdersKanbanProps, "orders"> & {
  initialColumns: OrderColumns;
}) {
  const queryClient = useQueryClient();

  const [columns, setColumns] = React.useReducer(columnsReducer, initialColumns);
  const pendingStatusMutationsRef = React.useRef(new Map<string, PendingStatusMutations>());
  const pendingDateMutationsRef = React.useRef(new Map<string, PendingDateMutations>());

  React.useEffect((): void => {
    setColumns((current) => reconcileOrderColumns(current, initialColumns));
  }, [initialColumns]);

  const statusMutation = useMutation({
    mutationFn: ({ orderId, status }: StatusMutationVariables) =>
      updateOrderStatus(orderId, status),
    onSuccess: (_data, variables) => {
      if (variables.status === "Owned") {
        toast.success("Order marked as collected");
      }
    },
    onError: (error: Error, variables) => {
      toast.error(`Failed to update order ${variables.orderId} to status ${variables.status}:`, {
        description: `Error: ${error.message}`,
      });
    },
  });

  const dateMutation = useMutation({
    mutationFn: ({ orderId, field, date }: DateMutationVariables) =>
      updateOrderDate(orderId, field, date),
    onError: (error: Error) => {
      toast.error("Failed to update date", {
        description: error.message,
      });
    },
  });

  const enqueueStatusMutation = React.useCallback(
    (variables: StatusMutationVariables) => {
      const existingQueue = pendingStatusMutationsRef.current.get(variables.orderId);
      if (existingQueue) {
        existingQueue.mutations.push(variables);
        return;
      }

      const queue: PendingStatusMutations = {
        mutations: [variables],
        persistedStatus: variables.previousStatus,
        persistedIndex: variables.previousIndex,
        lastMutationSucceeded: false,
      };
      pendingStatusMutationsRef.current.set(variables.orderId, queue);

      void drainMutationQueue(
        queue.mutations,
        (pendingVariables) => {
          if (queue.persistedStatus === pendingVariables.previousStatus) {
            queue.persistedIndex = pendingVariables.previousIndex;
          }

          return statusMutation.mutateAsync(pendingVariables);
        },
        (persistedVariables, succeeded) => {
          queue.lastMutationSucceeded = succeeded;
          if (!succeeded) return;

          queue.persistedStatus = persistedVariables.status;
          queue.persistedIndex = persistedVariables.targetIndex;
        },
        async () => {
          setColumns((current) =>
            moveOrderToStatus(
              current,
              variables.orderId,
              queue.persistedStatus,
              queue.persistedIndex,
              !queue.lastMutationSucceeded,
            ),
          );
          pendingStatusMutationsRef.current.delete(variables.orderId);
          await invalidateCollectionAndOrderQueries(queryClient);
        },
      );
    },
    [queryClient, statusMutation],
  );

  const enqueueDateMutation = React.useCallback(
    (variables: DateMutationVariables) => {
      const existingQueue = pendingDateMutationsRef.current.get(variables.orderId);
      if (existingQueue) {
        if (!existingQueue.persistedDates.has(variables.field)) {
          existingQueue.persistedDates.set(variables.field, variables.previousDate);
        }
        existingQueue.mutations.push(variables);
        return;
      }

      const queue: PendingDateMutations = {
        mutations: [variables],
        persistedDates: new Map([[variables.field, variables.previousDate]]),
      };
      pendingDateMutationsRef.current.set(variables.orderId, queue);

      void drainMutationQueue(
        queue.mutations,
        (pendingVariables) => dateMutation.mutateAsync(pendingVariables),
        (persistedVariables, succeeded) => {
          if (!succeeded) return;

          queue.persistedDates.set(persistedVariables.field, persistedVariables.date);
        },
        async () => {
          setColumns((current) => {
            let next = current;
            for (const [field, date] of queue.persistedDates) {
              next = updateOrderDateInColumns(next, variables.orderId, field, date);
            }
            return next;
          });
          pendingDateMutationsRef.current.delete(variables.orderId);
          await invalidateCollectionAndOrderQueries(queryClient);
        },
      );
    },
    [dateMutation, queryClient],
  );

  const handleDateChange = React.useCallback(
    (orderId: string, field: OrderDateField, date: string | null) => {
      const order = Object.values(columns)
        .flat()
        .find((candidate) => candidate.orderId === orderId);
      if (!order) return;

      setColumns((current) => updateOrderDateInColumns(current, orderId, field, date));

      enqueueDateMutation({
        orderId,
        field,
        date,
        previousDate: order[field] ?? null,
      });
    },
    [columns, enqueueDateMutation],
  );

  const handleMarkOwned = React.useCallback(
    (orderId: string) => {
      let previousStatus: OrderStatus | null = null;
      let foundIndex = -1;
      let foundOrder: DashboardKanbanOrder | null = null;

      for (const status of ORDER_STATUSES) {
        const columnOrders = columns[status];
        const index = columnOrders.findIndex((o) => o.orderId === orderId);
        if (index !== -1) {
          previousStatus = status;
          foundIndex = index;
          foundOrder = columnOrders[index];
          break;
        }
      }

      if (previousStatus === null || foundOrder === null) return;

      const updatedSource = [...columns[previousStatus]];
      updatedSource.splice(foundIndex, 1);

      setColumns({
        ...columns,
        [previousStatus]: updatedSource,
        Owned: [...columns.Owned, foundOrder],
      });

      enqueueStatusMutation({
        orderId,
        status: "Owned",
        previousStatus,
        previousIndex: foundIndex,
        targetIndex: columns.Owned.length,
      });
    },
    [columns, enqueueStatusMutation],
  );

  const handleMove = React.useCallback(
    ({ activeContainer, activeIndex, overContainer, overIndex, event }: KanbanMoveEvent) => {
      const previousStatus = ORDER_STATUSES.find((status) => status === activeContainer);
      const status = ORDER_STATUSES.find((candidate) => candidate === overContainer);
      if (!previousStatus || !status || previousStatus === status) return;

      enqueueStatusMutation({
        orderId: String(event.active.id),
        status,
        previousStatus,
        previousIndex: activeIndex,
        targetIndex: overIndex,
      });
    },
    [enqueueStatusMutation],
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

export default function OrderKanban({
  orders,
  isLoading,
  currency,
  dateFormat,
}: OrdersKanbanProps) {
  const initialColumns = React.useMemo(() => {
    const grouped: Record<OrderStatus, DashboardKanbanOrder[]> = {
      Ordered: [],
      Paid: [],
      Shipped: [],
      Owned: [],
    };

    for (const order of orders) {
      grouped[order.status].push(order);
    }

    return grouped;
  }, [orders]);

  return (
    <OrderKanbanBoard
      initialColumns={initialColumns}
      isLoading={isLoading}
      currency={currency}
      dateFormat={dateFormat}
    />
  );
}
