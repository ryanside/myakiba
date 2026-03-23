import { HugeiconsIcon } from "@hugeicons/react";
import { Calendar01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
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
import { formatCurrencyFromMinorUnits } from "@myakiba/utils/currency";
import type { DateFormat } from "@myakiba/contracts/shared/types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateOrderStatus } from "@/queries/orders";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { cn } from "@/lib/utils";
import { ORDER_STATUS_COLORS } from "@/lib/orders";
import { formatMonthYearForDisplay } from "@/lib/date-display";
import { getCurrencyLocale } from "@/lib/locale";
import type { Currency } from "@myakiba/contracts/shared/types";

interface KanbanOrder {
  orderId: string;
  title: string;
  shop: string;
  status: "Ordered" | "Paid" | "Shipped" | "Owned";
  releaseDate: string | null;
  itemImages: string[];
  itemIds: string[];
  total: number;
}

interface OrdersKanbanProps {
  orders: KanbanOrder[];
  currency: Currency;
  dateFormat: DateFormat;
}

const COLUMNS: Record<string, { title: string; color: string }> = {
  Ordered: { title: "Ordered", color: ORDER_STATUS_COLORS.Ordered },
  Paid: { title: "Paid", color: ORDER_STATUS_COLORS.Paid },
  Shipped: { title: "Shipped", color: ORDER_STATUS_COLORS.Shipped },
};

interface OrderCardProps extends Omit<
  React.ComponentProps<typeof KanbanItem>,
  "value" | "children"
> {
  order: KanbanOrder;
  currency: Currency;
  dateFormat: DateFormat;
  asHandle?: boolean;
  onMarkOwned: (orderId: string) => void;
}

function OrderCard({
  order,
  currency,
  dateFormat,
  asHandle,
  onMarkOwned,
  ...props
}: OrderCardProps) {
  const locale = getCurrencyLocale(currency);
  const content = (
    <Frame variant="ghost" spacing="sm" className="group/card relative p-0">
      <FramePanel className="p-3">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-2 right-2 opacity-0 group-hover/card:opacity-100 transition-opacity"
                aria-label="Mark as collected"
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
            <p>Mark as collected</p>
          </TooltipContent>
        </Tooltip>
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
              className="line-clamp-2 text-sm font-medium leading-tight hover:underline"
            >
              {order.title}
            </Link>
            {order.shop && (
              <Badge
                variant="outline"
                className="pointer-events-none w-fit px-1.5 py-0 text-[10px]"
              >
                {order.shop}
              </Badge>
            )}
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1 text-muted-foreground">
              {order.releaseDate && (
                <>
                  <HugeiconsIcon icon={Calendar01Icon} className="size-3" />
                  <time className="text-[10px] tabular-nums">
                    {formatMonthYearForDisplay(order.releaseDate, dateFormat)}
                  </time>
                </>
              )}
            </div>
            <span className="text-sm tabular-nums">
              {formatCurrencyFromMinorUnits(order.total, currency, locale)}
            </span>
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
  currency,
  dateFormat,
  isOverlay,
  onMarkOwned,
}: {
  columnId: string;
  orders: readonly KanbanOrder[];
  currency: Currency;
  dateFormat: DateFormat;
  isOverlay?: boolean;
  onMarkOwned: (orderId: string) => void;
}) {
  const col = COLUMNS[columnId];
  return (
    <KanbanColumn value={columnId}>
      <Frame spacing="sm" className="h-full">
        <FrameHeader className="flex flex-row items-center gap-2">
          <div className={cn("size-2 rounded-full", col.color)} />
          <FrameTitle>{col.title}</FrameTitle>
          <Badge variant="outline" size="sm" className="ml-auto">
            {orders.length}
          </Badge>
        </FrameHeader>
        <KanbanColumnContent value={columnId} className="flex flex-col gap-2 p-0.5">
          {orders.map((order) => (
            <OrderCard
              key={order.orderId}
              order={order}
              currency={currency}
              dateFormat={dateFormat}
              asHandle={!isOverlay}
              onMarkOwned={onMarkOwned}
            />
          ))}
        </KanbanColumnContent>
      </Frame>
    </KanbanColumn>
  );
}

export default function OrderKanban({ orders, currency, dateFormat }: OrdersKanbanProps) {
  const queryClient = useQueryClient();

  // Transform orders array into column structure grouped by status
  const initialColumns = React.useMemo(() => {
    const grouped: Record<string, KanbanOrder[]> = {
      Ordered: [],
      Paid: [],
      Shipped: [],
    };

    orders.forEach((order) => {
      if (grouped[order.status]) {
        grouped[order.status].push(order);
      }
    });

    return grouped;
  }, [orders]);

  const [columns, setColumns] = React.useState<Record<string, KanbanOrder[]>>(initialColumns);

  // Update columns when orders prop changes
  React.useEffect(() => {
    setColumns(initialColumns);
  }, [initialColumns]);

  // Mutation for updating order status
  const mutation = useMutation({
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
      console.error(
        `Failed to update order ${variables.orderId} to status ${variables.status}:`,
        error,
      );
      toast.error(`Failed to update order ${variables.orderId} to status ${variables.status}:`, {
        description: `Error: ${error.message}`,
      });
      setColumns(initialColumns);
    },
  });

  const handleMarkOwned = React.useCallback(
    (orderId: string) => {
      // Find which column contains this order
      let foundColumn: string | null = null;
      let foundIndex = -1;

      for (const [columnValue, columnOrders] of Object.entries(columns)) {
        const index = columnOrders.findIndex((o) => o.orderId === orderId);
        if (index !== -1) {
          foundColumn = columnValue;
          foundIndex = index;
          break;
        }
      }

      if (foundColumn === null) return;

      // Optimistically remove the order from its column
      const updatedItems = [...columns[foundColumn]];
      updatedItems.splice(foundIndex, 1);

      setColumns({
        ...columns,
        [foundColumn]: updatedItems,
      });

      mutation.mutate({
        orderId,
        status: "Owned",
      });
    },
    [columns, mutation],
  );

  // Handle item moves between columns
  const handleMove = React.useCallback(
    (moveEvent: {
      activeContainer: string;
      activeIndex: number;
      overContainer: string;
      overIndex: number;
    }) => {
      const { activeContainer, activeIndex, overContainer, overIndex } = moveEvent;

      // Get the moved order
      const movedOrder = columns[activeContainer][activeIndex];

      // Only trigger mutation if moving to a different column
      if (activeContainer !== overContainer) {
        const newStatus = overContainer as "Ordered" | "Paid" | "Shipped";

        // Update columns optimistically
        const activeItems = [...columns[activeContainer]];
        const overItems = [...columns[overContainer]];

        // Remove from source column
        activeItems.splice(activeIndex, 1);

        // Add to destination column
        overItems.splice(overIndex, 0, movedOrder);

        setColumns({
          ...columns,
          [activeContainer]: activeItems,
          [overContainer]: overItems,
        });

        // Trigger mutation to update backend
        mutation.mutate({
          orderId: movedOrder.orderId,
          status: newStatus,
        });
      }
    },
    [columns, mutation],
  );

  return (
    <Kanban
      value={columns}
      onValueChange={setColumns}
      onMove={handleMove}
      getItemValue={(item) => item.orderId}
    >
      <KanbanBoard className="grid grid-cols-3">
        {Object.entries(columns).map(([columnId, columnOrders]) => (
          <OrderColumn
            key={columnId}
            columnId={columnId}
            orders={columnOrders}
            currency={currency}
            dateFormat={dateFormat}
            onMarkOwned={handleMarkOwned}
          />
        ))}
      </KanbanBoard>
      <KanbanOverlay className="bg-muted/10 rounded-md border-2 border-dashed" />
    </Kanban>
  );
}
