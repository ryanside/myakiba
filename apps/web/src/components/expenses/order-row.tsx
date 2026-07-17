import type { CSSProperties, ReactNode } from "react";
import { PackageIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link } from "@tanstack/react-router";
import type { Currency, DateFormat } from "@myakiba/contracts/shared/types";
import { formatCurrencyFromMinorUnits } from "@myakiba/utils/currency";
import { ImageThumbnail } from "@/components/ui/image-thumbnail";
import { formatDateOnlyForDisplay } from "@/lib/date-display";
import type { ExpenseOrder } from "@/queries/expenses";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface ExpenseOrderRowProps {
  readonly order: ExpenseOrder;
  readonly currency: Currency;
  readonly locale: string;
  readonly dateFormat: DateFormat;
  readonly className?: string;
  readonly style?: CSSProperties;
}

export function ExpenseOrderRow({
  order,
  currency,
  locale,
  dateFormat,
  className,
  style,
}: ExpenseOrderRowProps): ReactNode {
  return (
    <Link
      to="/orders/$id"
      params={{ id: order.orderId }}
      className={cn(
        "grid gap-1 py-3 transition-colors duration-150 ease-out hover:bg-muted/40 sm:grid-cols-[1fr_auto]",
        className,
      )}
      style={style}
    >
      <div className="flex min-w-0 items-center gap-3">
        <ImageThumbnail
          images={order.images}
          title={order.title}
          fallbackIcon={<HugeiconsIcon icon={PackageIcon} className="size-4" />}
          className="size-8 rounded-md"
        />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{order.title}</p>
          <p className="flex items-center gap-2.5 text-xs text-muted-foreground">
            <span className="truncate">{order.shop}</span>
            <span className="shrink-0">
              {order.expenseDate
                ? formatDateOnlyForDisplay(order.expenseDate, dateFormat)
                : "Undated"}
            </span>
          </p>
        </div>
      </div>
      <div className="text-left sm:text-right">
        <p className="text-sm font-medium tabular-nums">
          {formatCurrencyFromMinorUnits(order.totalSpend, currency, locale)}
        </p>
        <p className="text-xs text-muted-foreground tabular-nums">
          {formatCurrencyFromMinorUnits(order.feeSpend, currency, locale)} in fees
        </p>
      </div>
    </Link>
  );
}

export function ExpenseOrderRowSkeleton(): ReactNode {
  return (
    <div className="grid gap-1 py-3 sm:grid-cols-[1fr_auto]">
      <div className="flex min-w-0 items-center gap-3">
        <Skeleton className="size-8 shrink-0 rounded-md" />
        <div className="min-w-0 space-y-1.5">
          <Skeleton className="h-4 w-32 max-w-full" />
          <Skeleton className="h-3.5 w-24 max-w-full" />
        </div>
      </div>
      <div className="space-y-1.5">
        <Skeleton className="h-4 w-16 sm:ml-auto" />
        <Skeleton className="h-3.5 w-14 sm:ml-auto" />
      </div>
    </div>
  );
}
