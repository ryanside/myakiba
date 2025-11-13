import * as React from "react";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/utils";
import { Link } from "@tanstack/react-router";

interface UnpaidOrder {
  orderId: string;
  title: string;
  shop: string | null;
  releaseMonthYear: string | null;
  itemImages: string[];
  itemIds: number[];
  total: string;
}

interface UnpaidOrdersProps {
  className?: string;
  currency: string;
  orders: UnpaidOrder[];
}

function UnpaidOrders({
  className,
  currency,
  orders,
}: UnpaidOrdersProps): React.ReactElement {
  return (
    <div className={cn("space-y-2 overflow-y-auto", className)}>
      {orders.length > 0 ? (
        orders.map((order) => (
          <UnpaidOrderCard
            key={order.orderId}
            order={order}
            currency={currency}
          />
        ))
      ) : (
        <div className="text-center text-muted-foreground py-8 text-sm">
          No unpaid orders
        </div>
      )}
    </div>
  );
}

function UnpaidOrderCard({
  order,
  currency,
}: {
  order: UnpaidOrder;
  currency: string;
}): React.ReactElement {
  const images = order.itemImages;
  const imageCount = images.length;
  const displayImages = images.slice(0, 4);
  const remainingCount = imageCount > 4 ? imageCount - 4 : 0;

  return (
    <Link
      to="/orders/$id"
      params={{ id: order.orderId }}
      className="flex items-center gap-3 p-2 border rounded-md bg-background hover:bg-accent transition-colors cursor-pointer"
    >
      {imageCount > 0 ? (
        <div className="w-12 h-12 rounded flex-shrink-0 relative overflow-hidden">
          {imageCount === 1 ? (
            <img
              src={images[0]}
              alt={order.title}
              className="w-full h-full object-cover"
            />
          ) : imageCount === 2 ? (
            <div className="grid grid-cols-2 gap-px w-full h-full">
              {displayImages.map((img, idx) => (
                <div key={idx} className="w-full h-full overflow-hidden">
                  <img
                    src={img}
                    alt={`${order.title} ${idx + 1}`}
                    className="w-full h-full object-cover"
                  />
                </div>
              ))}
            </div>
          ) : imageCount === 3 ? (
            <div className="grid grid-cols-2 gap-px w-full h-full">
              <div className="w-full h-full overflow-hidden row-span-2">
                <img
                  src={displayImages[0]}
                  alt={`${order.title} 1`}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="w-full h-full overflow-hidden">
                <img
                  src={displayImages[1]}
                  alt={`${order.title} 2`}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="w-full h-full overflow-hidden">
                <img
                  src={displayImages[2]}
                  alt={`${order.title} 3`}
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-px w-full h-full relative">
              {displayImages.map((img, idx) => (
                <div key={idx} className="w-full h-full overflow-hidden">
                  <img
                    src={img}
                    alt={`${order.title} ${idx + 1}`}
                    className="w-full h-full object-cover"
                  />
                </div>
              ))}
              {remainingCount > 0 && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                  <span className="text-xs font-medium text-white">
                    +{remainingCount}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="w-12 h-12 bg-muted rounded flex-shrink-0 flex items-center justify-center">
          <span className="text-xs text-muted-foreground">No img</span>
        </div>
      )}
      <div className="flex-1 min-w-0">
        <h4 className="font-medium text-sm truncate">{order.title}</h4>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {order.shop && <span>{order.shop}</span>}
          {order.releaseMonthYear && (
            <>
              {order.shop && <span>•</span>}
              <span>{order.releaseMonthYear}</span>
            </>
          )}
          {order.total && (
            <>
              {(order.shop || order.releaseMonthYear) && <span>•</span>}
              <span>{formatCurrency(order.total, currency)}</span>
            </>
          )}
        </div>
      </div>
    </Link>
  );
}

export { UnpaidOrders, type UnpaidOrder };

