import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Kanban,
  KanbanBoard,
  KanbanColumn,
  KanbanColumnContent,
  KanbanColumnHandle,
  KanbanItem,
  KanbanItemHandle,
  KanbanOverlay,
} from "@/components/ui/kanban";
import { GripVertical, CalendarIcon } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateOrderStatus } from "@/queries/orders";
import { toast } from "sonner";

interface KanbanOrder {
  orderId: string;
  title: string;
  shop: string;
  status: "Ordered" | "Paid" | "Shipped" | "Owned";
  releaseMonthYear: string | null;
  itemImages: string[];
  itemIds: number[];
  total: string;
}

interface OrdersKanbanProps {
  orders: KanbanOrder[];
  currency: string;
}

const COLUMN_TITLES: Record<string, string> = {
  Ordered: "Ordered",
  Paid: "Paid",
  Shipped: "Shipped",
};

interface OrderCardProps
  extends Omit<React.ComponentProps<typeof KanbanItem>, "value" | "children"> {
  order: KanbanOrder;
  currency: string;
  asHandle?: boolean;
}

function OrderCard({ order, currency, asHandle, ...props }: OrderCardProps) {
  const cardContent = (
    <div className="rounded-md border bg-card p-3 shadow-xs hover:shadow-sm transition-shadow">
      <div className="flex flex-col gap-2.5">
        {/* Item Images */}
        {order.itemImages && order.itemImages.length > 0 && (
          <div className="flex gap-1 mb-1">
            {order.itemImages.slice(0, 3).map((image, idx) => (
              <div
                key={idx}
                className="relative w-12 h-12 rounded-md overflow-hidden border bg-muted shrink-0"
              >
                <img
                  src={image}
                  alt=""
                  className="w-full h-full object-cover object-top"
                />
              </div>
            ))}
            {order.itemImages.length > 3 && (
              <div className="relative w-12 h-12 rounded-md overflow-hidden border bg-muted flex items-center justify-center shrink-0">
                <span className="text-xs font-medium text-muted-foreground">
                  +{order.itemImages.length - 3}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Title */}
        <div className="flex flex-col gap-1">
          <span className="line-clamp-2 font-light text-sm leading-tight">
            {order.title}
          </span>
          {order.shop && (
            <Badge
              variant="outline"
              className="pointer-events-none w-fit text-[10px] px-1.5 py-0"
            >
              {order.shop}
            </Badge>
          )}
        </div>

        {/* Bottom Info */}
        <div className="flex items-center justify-between text-xs pt-1 border-t">
          <div className="flex items-center gap-1 text-muted-foreground">
            {order.releaseMonthYear && (
              <>
                <CalendarIcon className="h-3 w-3" />
                <time className="text-[10px] tabular-nums">
                  {new Date(order.releaseMonthYear).toLocaleDateString(
                    "en-US",
                    {
                      month: "short",
                      year: "numeric",
                    }
                  )}
                </time>
              </>
            )}
          </div>
          <span className="font-normal text-sm">
            {formatCurrency(parseFloat(order.total), currency)}
          </span>
        </div>
      </div>
    </div>
  );

  return (
    <KanbanItem value={order.orderId} {...props}>
      {asHandle ? (
        <KanbanItemHandle>{cardContent}</KanbanItemHandle>
      ) : (
        cardContent
      )}
    </KanbanItem>
  );
}

interface OrderColumnProps
  extends Omit<React.ComponentProps<typeof KanbanColumn>, "children"> {
  orders: KanbanOrder[];
  currency: string;
  isOverlay?: boolean;
}

function OrderColumn({
  value,
  orders,
  currency,
  isOverlay,
  ...props
}: OrderColumnProps) {
  return (
    <KanbanColumn
      value={value}
      {...props}
      className="rounded-lg border bg-background p-4 shadow-xs"
    >
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-2.5">
          <span className="font-medium text-sm">{COLUMN_TITLES[value]}</span>
          <Badge variant="outline">{orders.length}</Badge>
        </div>
        <KanbanColumnHandle asChild>
          <Button variant="dim" size="sm" mode="icon">
            <GripVertical />
          </Button>
        </KanbanColumnHandle>
      </div>
      <KanbanColumnContent
        value={value}
        className="flex flex-col gap-2.5 p-0.5"
      >
        {orders.map((order) => (
          <OrderCard
            key={order.orderId}
            order={order}
            currency={currency}
            asHandle={!isOverlay}
          />
        ))}
      </KanbanColumnContent>
    </KanbanColumn>
  );
}

export default function OrderKanban({ orders, currency }: OrdersKanbanProps) {
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

  const [columns, setColumns] =
    React.useState<Record<string, KanbanOrder[]>>(initialColumns);

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
    onSuccess: () => {
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ["orders"] }),
        queryClient.invalidateQueries({ queryKey: ["order"] }),
        queryClient.invalidateQueries({ queryKey: ["collection"] }),
        queryClient.invalidateQueries({ queryKey: ["item"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["analytics"] }),
      ]);
    },
    onError: (error: Error, variables) => {
      console.error(
        `Failed to update order ${variables.orderId} to status ${variables.status}:`,
        error
      );
      toast.error(
        `Failed to update order ${variables.orderId} to status ${variables.status}:`,
        {
          description: `Error: ${error.message}`,
        }
      );
      setColumns(initialColumns);
    },
  });

  // Handle item moves between columns
  const handleMove = React.useCallback(
    (moveEvent: {
      activeContainer: string;
      activeIndex: number;
      overContainer: string;
      overIndex: number;
    }) => {
      const { activeContainer, activeIndex, overContainer, overIndex } =
        moveEvent;

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
    [columns, mutation]
  );

  return (
    <Kanban
      value={columns}
      onValueChange={setColumns}
      onMove={handleMove}
      getItemValue={(item) => item.orderId}
      className="h-full"
    >
      <KanbanBoard className="grid auto-rows-fr grid-cols-3 h-full">
        {Object.entries(columns).map(([columnValue, columnOrders]) => (
          <OrderColumn
            key={columnValue}
            value={columnValue}
            orders={columnOrders}
            currency={currency}
            className="max-h-[300px] overflow-auto"
          />
        ))}
      </KanbanBoard>
      <KanbanOverlay>
        <div className="rounded-md bg-muted/60 size-full" />
      </KanbanOverlay>
    </Kanban>
  );
}
