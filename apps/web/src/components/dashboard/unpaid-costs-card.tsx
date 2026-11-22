import type { ReactNode } from "react";
import { KPICard } from "@/components/ui/kpi-card";

interface UnpaidCostsCardProps {
  readonly amount: string;
  readonly orderCount: number;
  readonly isLoading: boolean;
}

export function UnpaidCostsCard({
  amount,
  orderCount,
  isLoading,
}: UnpaidCostsCardProps): ReactNode {
  return (
    <KPICard
      title="Unpaid Costs"
      value={amount}
      subvalueTitle={orderCount === 1 ? "order" : "orders"}
      subvalue={orderCount}
      isLoading={isLoading}
    />
  );
}
