import { Skeleton } from "@/components/ui/skeleton";
import { OrdersDataGridSkeleton } from "./orders-data-grid-skeleton";

export function OrdersGridSkeleton() {
  return (
    <div className="w-full space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-row items-start gap-4">
          <Skeleton className="h-8 w-36" />
        </div>
        <Skeleton className="h-4 w-52" />
      </div>
      {/* KPIs */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
      <OrdersDataGridSkeleton />
    </div>
  );
}
